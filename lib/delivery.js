// lib/delivery.js — Mini-jeu Livraisons
// Le joueur reçoit des commandes de NPC qui demandent une espèce précise.
// Livrer donne des coins bonus + XP. Les commandes ont une durée limitée.

import { supabase } from './supabaseClient.js';
import { loadLocal, patchLocal } from './localSave.js';
import { addXpToPlayer, computeHarvestXp } from './xp.js';
import { sellSeedToNpc, computeNpcPrice } from './npcShop.js';
import { getFallbackSpeciesTree } from './speciesTree.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const ORDER_COUNT         = 3;    // Nombre de commandes actives simultanées
const ORDER_DURATION_MS   = 10 * 60 * 1000; // 10 minutes par commande
const BONUS_MULTIPLIER    = 1.5;  // Bonus coins = prix NPC × 1.5
const XP_BONUS_FLAT       = 15;   // XP plat en plus par livraison réussie

const NPC_NAMES = [
  { name: 'Madame Rondine',  emoji: '👒' },
  { name: 'Maître Corvinus', emoji: '🎩' },
  { name: 'Tante Pherula',   emoji: '🌺' },
  { name: 'Sœur Osmonde',    emoji: '🌿' },
  { name: 'Le Vieux Borago', emoji: '🧙' },
];

// Lieux réels de Pontivy (Morbihan). distance = flavor, difficulty = 1..3,
// rewardMult = bonus de récompense pour les trajets plus longs/risqués.
export const PONTIVY_DESTINATIONS = [
  { name: 'Les Halles',                    emoji: '🏛️', km: 1.0, difficulty: 1, rewardMult: 1.00 },
  { name: 'Place du Martray',              emoji: '⛲', km: 1.2, difficulty: 1, rewardMult: 1.05 },
  { name: 'Château des Rohan',             emoji: '🏰', km: 1.6, difficulty: 1, rewardMult: 1.15 },
  { name: 'Basilique Notre-Dame-de-Joie',  emoji: '⛪', km: 2.0, difficulty: 2, rewardMult: 1.25 },
  { name: 'Quartier de la Gare',           emoji: '🚉', km: 2.4, difficulty: 2, rewardMult: 1.30 },
  { name: 'Les bords du Blavet',           emoji: '🛶', km: 3.0, difficulty: 2, rewardMult: 1.40 },
  { name: 'Parc de Kério',                 emoji: '🌲', km: 3.6, difficulty: 2, rewardMult: 1.45 },
  { name: 'Quartier de Stival',            emoji: '🏘️', km: 4.2, difficulty: 3, rewardMult: 1.60 },
  { name: 'Le Plessis',                    emoji: '🌳', km: 5.0, difficulty: 3, rewardMult: 1.75 },
];

// ─── Génération d'une commande ────────────────────────────────────────────────

function pickNpc() {
  return NPC_NAMES[Math.floor(Math.random() * NPC_NAMES.length)];
}

function pickDestination() {
  return PONTIVY_DESTINATIONS[Math.floor(Math.random() * PONTIVY_DESTINATIONS.length)];
}

export async function generateOrders(userId) {
  // Récupère les graines disponibles (cloud ou local)
  let seeds = [];
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    const { data } = await supabase
      .from('botanica_player_seeds')
      .select('species_id, quantity, botanica_species(id, name, rarity, tier)')
      .eq('user_id', userId)
      .gt('quantity', 0);
    seeds = (data ?? []).filter(s => s.botanica_species);
  }
  // Fallback local
  if (!seeds.length) {
    const local = loadLocal()?.seeds ?? [];
    const tree  = getFallbackSpeciesTree();
    seeds = local
      .filter(s => s.quantity > 0)
      .map(s => ({
        species_id: s.species_id,
        quantity: s.quantity,
        botanica_species: tree.find(sp => sp.id === s.species_id) ?? { id: s.species_id, name: `Espèce #${s.species_id}`, rarity: 'common', tier: 0 },
      }));
  }

  if (!seeds.length) return [];

  // Tire ORDER_COUNT commandes aléatoires parmi les espèces disponibles
  const shuffled = [...seeds].sort(() => Math.random() - 0.5).slice(0, ORDER_COUNT);
  const now = Date.now();

  return shuffled.map((s, i) => {
    const sp        = s.botanica_species;
    const npc       = pickNpc();
    const dest      = pickDestination();
    const basePrice = computeNpcPrice(sp.rarity ?? 'common');
    const reward    = Math.round(basePrice * BONUS_MULTIPLIER * dest.rewardMult);
    return {
      id:          `order-${now}-${i}`,
      speciesId:   sp.id,
      speciesName: sp.name,
      rarity:      sp.rarity ?? 'common',
      npcName:     npc.name,
      npcEmoji:    npc.emoji,
      destination:      dest.name,
      destinationEmoji: dest.emoji,
      destinationKm:    dest.km,
      difficulty:       dest.difficulty,
      reward,
      expiresAt:   now + ORDER_DURATION_MS,
    };
  });
}

// ─── Livraison ────────────────────────────────────────────────────────────────

export async function fulfillOrder(userId, order) {
  // 1. Retire la graine via le mécanisme NPC existant
  //    On passe qualityTierId=1 par défaut (la commande ne porte pas de qualité)
  const saleResult = await sellSeedToNpc(userId, null, order.speciesId, order.rarity, 1);
  if (saleResult.error) return { error: saleResult.error };

  // 2. Coins bonus livraison (en plus du prix NPC déjà crédité)
  const bonusCoins = order.reward - computeNpcPrice(order.rarity, 1);
  const localData  = loadLocal()?.playerData ?? {};
  const cloudCoins = saleResult.coins; // déjà mis à jour par sellSeedToNpc
  const finalCoins = cloudCoins + bonusCoins;
  patchLocal('playerData', { ...localData, coins: finalCoins });

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    await supabase
      .from('botanica_player_data')
      .upsert({ user_id: userId, coins: finalCoins }, { onConflict: 'user_id' });
  }

  // 3. XP bonus livraison
  const xpGain = computeHarvestXp(order.rarity, 1) + XP_BONUS_FLAT;
  const playerRow = loadLocal()?.playerData ?? {};
  const xpResult  = await addXpToPlayer(userId, xpGain, { ...playerRow, coins: finalCoins });

  return {
    success:   true,
    coins:     finalCoins + (xpResult.leveledUp ? (xpResult.newCoins - finalCoins) : 0),
    xpGained:  xpGain,
    leveledUp: xpResult.leveledUp,
    reward:    xpResult.reward,
    newLevel:  xpResult.newLevel,
  };
}
