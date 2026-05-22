// lib/quality.js — Tiers de qualité de pousse

export const QUALITY_TIERS = [
  { id: 0, name: 'guezmer',  label: '💀 Guezmer',  color: '#666',    multiplier: 0.5  },
  { id: 1, name: 'potable',  label: '🌱 Potable',  color: '#7ec850', multiplier: 1.0  },
  { id: 2, name: 'frape',    label: '✨ Frape',    color: '#5bc8ef', multiplier: 1.8  },
  { id: 3, name: 'banger',   label: '🔥 Banger',   color: '#f4a030', multiplier: 3.0  },
  { id: 4, name: 'comète',   label: '☄️ Comète',   color: '#d870f0', multiplier: 6.0  },
];

/**
 * Calcule le tier de qualité à la récolte selon les bonus actifs.
 * NOTE : Cette fonction est une copie de la logique de l'Edge Function `harvest-mutation`.
 * La résolution réelle se fait côté serveur — cette version client sert uniquement
 * à la documentation, aux tests unitaires, et aux previews éventuels.
 * Ne pas appeler en production pour déterminer le résultat d'une récolte.
 *
 * @param {Object} gardenBonuses - { waterBonus, lightBonus, thermoBonus, fanBonus, uvBonus }
 * @returns {Object} QUALITY_TIERS entry
 */
export function rollQualityTier(gardenBonuses = {}) {
  const {
    waterBonus  = 0,
    lightBonus  = 0,
    thermoBonus = 0,
    fanBonus    = 0,
    uvBonus     = 0,
  } = gardenBonuses;

  // Base weights [guezmer, potable, frape, banger, comète]
  const weights = [20, 40, 25, 10, 5];

  // Chaque bonus réduit guezmer et monte les tiers supérieurs
  if (waterBonus)  { weights[0] -= 5;  weights[1] -= 5;  weights[2] += 10; }
  if (lightBonus)  { weights[0] -= 5;  weights[2] -= 5;  weights[3] += 10; }
  if (thermoBonus) { weights[0] -= 8;  weights[1] += 8; }
  if (fanBonus)    { weights[1] -= 5;  weights[3] += 5; }
  if (uvBonus)     { weights[2] -= 5;  weights[4] += 5; }

  // Clamp à 0
  const clamped = weights.map(w => Math.max(0, w));
  const total   = clamped.reduce((a, b) => a + b, 0);
  let roll      = Math.random() * total;

  for (let i = 0; i < clamped.length; i++) {
    roll -= clamped[i];
    if (roll <= 0) return QUALITY_TIERS[i];
  }
  return QUALITY_TIERS[1];
}

/**
 * Calcule le prix de vente au NPC.
 * @param {Object} species - { tier, rarity }
 * @param {Object} qualityTier - QUALITY_TIERS entry
 * @returns {number} prix en pièces
 */
const RARITY_BASE = { common: 10, rare: 25, epic: 60, legendary: 130, mythic: 280 };

export function computeSellPrice(species, qualityTier) {
  const base    = RARITY_BASE[species.rarity] ?? 10;
  const tierMul = species.tier ?? 1;
  return Math.round(base * tierMul * qualityTier.multiplier);
}
