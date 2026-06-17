/**
 * harvestQuantity.js — Calcule le nombre de FLEURS obtenues à la récolte
 *
 * Les fleurs sont le produit de la mutation (à vendre / livrer).
 * Les graines parentes sont gérées séparément via seedDrop.js.
 *
 * Facteurs :
 *  1. quality_tier_id  (0→4) : base quantité fleurs
 *  2. gardenBonuses    : chaque effet de qualité actif ajoute +0.5 fleur potentielle
 *  3. yieldBonus       : « Engrais Florissant » ajoute +1 fleur garantie par niveau
 *  4. species.tier     : bonus multiplicatif discret
 *
 * Formule :
 *   qty = floor( baseQty * speciesTierMult + gardenBonus ) + yieldFlowers + bonusRoll
 */

const BASE_QTY  = [1, 1, 2, 3, 5]; // guezmer→potable→frape→banger→comète
const TIER_MULT = [1, 1, 1.2, 1.4, 1.7, 2.0];

// Effets jardin qui ne participent PAS au bonus générique de quantité.
// (yieldBonus a son propre calcul, seedLuck ne touche que le drop de graines)
const NON_QTY_EFFECTS = new Set(['yieldBonus', 'seedLuck']);

function countQualityEffects(gardenBonuses = {}) {
  return Object.entries(gardenBonuses)
    .filter(([id, v]) => v > 0 && !NON_QTY_EFFECTS.has(id))
    .length;
}

/**
 * @param {number} qualityTierId   0..4
 * @param {object} gardenBonuses   { waterBonus, lightBonus, thermoBonus, fanBonus, uvBonus, yieldBonus }
 * @param {number} speciesTier     1..5
 * @returns {number} nombre de fleurs (min 1)
 */
export function computeHarvestQuantity(qualityTierId = 1, gardenBonuses = {}, speciesTier = 1) {
  const base  = BASE_QTY[qualityTierId]  ?? 1;
  const mult  = TIER_MULT[Math.min(speciesTier, 5)] ?? 1;
  const gardenBonus  = countQualityEffects(gardenBonuses) * 0.5;
  const yieldFlowers = Number(gardenBonuses?.yieldBonus ?? 0);
  const bonusRollChance = [0, 0.10, 0.25, 0.45, 0.70][qualityTierId] ?? 0;
  const bonusRoll = Math.random() < bonusRollChance ? 1 : 0;
  return Math.max(1, Math.floor(base * mult + gardenBonus) + yieldFlowers + bonusRoll);
}

export function harvestQuantityBreakdown(qualityTierId, gardenBonuses, speciesTier) {
  const base  = BASE_QTY[qualityTierId]  ?? 1;
  const mult  = TIER_MULT[Math.min(speciesTier, 5)] ?? 1;
  const gardenCount  = countQualityEffects(gardenBonuses);
  const yieldFlowers = Number(gardenBonuses?.yieldBonus ?? 0);
  return { base, speciesMult: mult, gardenBonusRaw: gardenCount * 0.5, gardenActive: gardenCount, yieldFlowers };
}

/**
 * Estimation min/max du nombre de fleurs (pour les panneaux d'info).
 * @returns {{min:number, max:number}}
 */
export function harvestQuantityRange(qualityTierId = 1, gardenBonuses = {}, speciesTier = 1) {
  const base  = BASE_QTY[qualityTierId]  ?? 1;
  const mult  = TIER_MULT[Math.min(speciesTier, 5)] ?? 1;
  const gardenBonus  = countQualityEffects(gardenBonuses) * 0.5;
  const yieldFlowers = Number(gardenBonuses?.yieldBonus ?? 0);
  const floorQty = Math.max(1, Math.floor(base * mult + gardenBonus) + yieldFlowers);
  const hasBonusRoll = ([0, 0.10, 0.25, 0.45, 0.70][qualityTierId] ?? 0) > 0;
  return { min: floorQty, max: floorQty + (hasBonusRoll ? 1 : 0) };
}
