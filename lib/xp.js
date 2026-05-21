// lib/xp.js — Système de niveaux, XP et récompenses
import { supabase } from './supabaseClient.js';
import { patchLocal } from './localSave.js';

export const LEVEL_TABLE = [
  { level: 1,  xpRequired: 0,    reward: null },
  { level: 2,  xpRequired: 100,  reward: { coins: 50,   label: '+50🪙',            potSlots: 0 } },
  { level: 3,  xpRequired: 250,  reward: { coins: 75,   label: '+75🪙',            potSlots: 0 } },
  { level: 4,  xpRequired: 500,  reward: { coins: 100,  label: '+100🪙 +1 slot 🪨', potSlots: 1 } },
  { level: 5,  xpRequired: 900,  reward: { coins: 150,  label: '+150🪙 +1 slot 🪨', potSlots: 1 } },
  { level: 6,  xpRequired: 1400, reward: { coins: 200,  label: '+200🪙',            potSlots: 0 } },
  { level: 7,  xpRequired: 2100, reward: { coins: 300,  label: '+300🪙',            potSlots: 0 } },
  { level: 8,  xpRequired: 3000, reward: { coins: 400,  label: '+400🪙 +1 slot 🪨', potSlots: 1 } },
  { level: 9,  xpRequired: 4200, reward: { coins: 500,  label: '+500🪙',            potSlots: 0 } },
  { level: 10, xpRequired: 6000, reward: { coins: 1000, label: '+1000🪙 🎖️',       potSlots: 0 } },
];

const MAX_LEVEL = LEVEL_TABLE[LEVEL_TABLE.length - 1].level;

const XP_BY_RARITY   = { common: 10, rare: 20, epic: 40, legendary: 80, mythic: 200 };
const XP_QUALITY_MUL = [0.5, 1.0, 1.5, 2.0, 3.0];

export function computeHarvestXp(rarity, qualityTierId = 1) {
  const base = XP_BY_RARITY[rarity] ?? 10;
  const mul  = XP_QUALITY_MUL[qualityTierId] ?? 1.0;
  return Math.round(base * mul);
}

export function resolveLevel(totalXp) {
  let currentEntry = LEVEL_TABLE[0];
  for (const entry of LEVEL_TABLE) {
    if (totalXp >= entry.xpRequired) currentEntry = entry;
    else break;
  }
  const level = currentEntry.level;
  if (level >= MAX_LEVEL) {
    return { level: MAX_LEVEL, currentLevelXp: totalXp, nextLevelXp: null, progress: 100 };
  }
  const nextEntry      = LEVEL_TABLE[level];
  const currentLevelXp = totalXp - currentEntry.xpRequired;
  const nextLevelXp    = nextEntry.xpRequired - currentEntry.xpRequired;
  const progress       = Math.min((currentLevelXp / nextLevelXp) * 100, 100);
  return { level, currentLevelXp, nextLevelXp, progress };
}

export async function addXpToPlayer(userId, xpGained, currentData) {
  const prevTotal = currentData.xp    ?? 0;
  const prevCoins = currentData.coins ?? 0;
  const prevLevel = currentData.level ?? 1;

  const newTotal = prevTotal + xpGained;
  const { level: newLevel } = resolveLevel(newTotal);

  const leveledUp = newLevel > prevLevel;
  let bonusCoins    = 0;
  let reward        = null;
  let bonusPotSlots = 0;

  if (leveledUp) {
    for (let lvl = prevLevel + 1; lvl <= newLevel; lvl++) {
      const entry = LEVEL_TABLE.find(e => e.level === lvl);
      if (entry?.reward) {
        bonusCoins    += entry.reward.coins    ?? 0;
        bonusPotSlots += entry.reward.potSlots ?? 0;
        reward = entry.reward;
      }
    }
  }

  const newCoins    = prevCoins + bonusCoins;
  const newPotSlots = (currentData.pot_slots ?? 1) + bonusPotSlots;

  const updatedData = {
    user_id:   userId,
    xp:        newTotal,
    level:     newLevel,
    coins:     newCoins,
    pot_slots: newPotSlots,
  };

  // 1. Toujours sauver en local
  patchLocal('playerData', { xp: newTotal, level: newLevel, coins: newCoins, pot_slots: newPotSlots });

  // 2. Sync cloud si UUID valide
  const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
  if (isValidUUID) {
    try {
      await supabase
        .from('botanica_player_data')
        .upsert(updatedData, { onConflict: 'user_id' });
    } catch (e) {
      console.warn('[xp] Sync cloud échoué, données sauvées en local :', e);
    }
  }

  return { newXp: newTotal, newLevel, newCoins, newPotSlots, leveledUp, reward };
}
