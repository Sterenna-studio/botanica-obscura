/**
 * harvestQuantity.js — Calcule le nombre de FLEURS obtenues à la récolte
 *
 * Les fleurs sont le produit de la mutation (à vendre / livrer).
 * Les graines parentes sont gérées séparément via seedDrop.js.
 *
 * Facteurs :
 *  1. quality_tier_id  (0→4) : base quantité fleurs
 *  2. gardenBonuses    : chaque bonus actif ajoute +0.5 fleur potentielle
 *  3. species.tier     : bonus multiplicatif discret
 *
 * Formule :
 *   qty = floor( baseQty * speciesTierMult + gardenBonus ) + bonusRoll
 */

const BASE_QTY  = [1, 1, 2, 3, 5]; // guezmer→potable→frape→banger→comète
const TIER_MULT = [1, 1, 1.2, 1.4, 1.7, 2.0];

/**
 * @param {number} qualityTierId   0..4
 * @param {object} gardenBonuses   { waterBonus, lightBonus, thermoBonus, fanBonus, uvBonus }
 * @param {number} speciesTier     1..5
 * @returns {number} nombre de fleurs (min 1)
 */
export function computeHarvestQuantity(qualityTierId = 1, gardenBonuses = {}, speciesTier = 1) {
  const base  = BASE_QTY[qualityTierId]  ?? 1;
  const mult  = TIER_MULT[Math.min(speciesTier, 5)] ?? 1;
  const gardenCount  = Object.values(gardenBonuses).filter(v => v > 0).length;
  const gardenBonus  = gardenCount * 0.5;
  const bonusRollChance = [0, 0.10, 0.25, 0.45, 0.70][qualityTierId] ?? 0;
  const bonusRoll = Math.random() < bonusRollChance ? 1 : 0;
  return Math.max(1, Math.floor(base * mult + gardenBonus) + bonusRoll);
}

export function harvestQuantityBreakdown(qualityTierId, gardenBonuses, speciesTier) {
  const base  = BASE_QTY[qualityTierId]  ?? 1;
  const mult  = TIER_MULT[Math.min(speciesTier, 5)] ?? 1;
  const gardenCount = Object.values(gardenBonuses).filter(v => v > 0).length;
  return { base, speciesMult: mult, gardenBonusRaw: gardenCount * 0.5, gardenActive: gardenCount };
}
