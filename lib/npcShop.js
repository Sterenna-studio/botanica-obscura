import { supabase } from '../app.js';

// Prix de base par rareté (en pièces 🪙)
const BASE_PRICES = {
  common:    10,
  rare:      30,
  epic:      80,
  legendary: 200,
  mythic:    500,
};

// Multiplicateur de prix par tier de qualité
const QUALITY_MULTIPLIERS = [0.5, 1.0, 1.8, 3.0, 6.0];

export function computeNpcPrice(rarity, qualityTierId = 1) {
  const base = BASE_PRICES[rarity] ?? 10;
  const mult = QUALITY_MULTIPLIERS[qualityTierId] ?? 1.0;
  return Math.round(base * mult);
}

/**
 * Vend une graine au NPC :
 * - décrémente player_seeds (ou supprime si qty = 1)
 * - crédite les coins dans botanica_player_data
 * - log dans npc_sales_log
 * Retourne { coins: newTotal, price } ou { error }
 */
export async function sellSeedToNpc(userId, seedId, speciesId, rarity, qualityTierId = 1) {
  const price = computeNpcPrice(rarity, qualityTierId);

  // 1. Lire la quantité actuelle
  const { data: seed, error: seedErr } = await supabase
    .from('player_seeds')
    .select('id, quantity')
    .eq('id', seedId)
    .eq('user_id', userId)
    .single();

  if (seedErr || !seed) return { error: 'Graine introuvable.' };

  // 2. Décrémenter ou supprimer
  if (seed.quantity > 1) {
    await supabase
      .from('player_seeds')
      .update({ quantity: seed.quantity - 1 })
      .eq('id', seedId);
  } else {
    await supabase
      .from('player_seeds')
      .delete()
      .eq('id', seedId);
  }

  // 3. Créditer les coins
  const { data: playerData } = await supabase
    .from('botanica_player_data')
    .select('coins')
    .eq('user_id', userId)
    .single();

  const newCoins = (playerData?.coins ?? 0) + price;

  await supabase
    .from('botanica_player_data')
    .upsert({ user_id: userId, coins: newCoins }, { onConflict: 'user_id' });

  // 4. Log la vente
  await supabase
    .from('npc_sales_log')
    .insert({ user_id: userId, species_id: speciesId, quality_tier_id: qualityTierId, price_sold: price });

  return { coins: newCoins, price };
}
