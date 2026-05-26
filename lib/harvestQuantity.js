/**
 * harvestQuantity.js — Calcule le nombre de graines obtenues à la récolte
 *
 * Facteurs :
 *  1. quality_tier_id  (0→4) : base quantité
 *  2. gardenBonuses    : chaque bonus actif ajoute +1 graine potentielle
 *  3. species.tier     : bonus multiplicatif discret
 *
 * Formule finale :
 *   qty = floor( baseQty * speciesTierMult ) + gardenBonus + roll
 *   où roll = 0 ou 1 selon probabilité dépendant de la qualité
 */

// Quantité de base par quality_tier_id
const BASE_QTY = [1, 1, 2, 3, 5]; // guezmer→potable→frape→banger→comète

// Multiplicateur selon tier de l'espèce (tier 1-5 mappé)
const TIER_MULT = [1, 1, 1.2, 1.4, 1.7, 2.0];

/**
 * @param {number} qualityTierId  - 0..4
 * @param {object} gardenBonuses  - { waterBonus, lightBonus, thermoBonus, fanBonus, uvBonus }
 * @param {number} speciesTier    - 1..5
 * @returns {number} quantité de graines (min 1)
 */
export function computeHarvestQuantity(qualityTierId = 1, gardenBonuses = {}, speciesTier = 1) {
  const base = BASE_QTY[qualityTierId] ?? 1;
  const mult = TIER_MULT[Math.min(speciesTier, 5)] ?? 1;

  // Bonus jardin actifs = +0.5 graine chacun (arrondi aléatoire)
  const gardenCount = Object.values(gardenBonuses).filter(v => v > 0).length;
  const gardenBonus = gardenCount * 0.5;

  // Roll bonus : probabilité de +1 supplémentaire selon qualité
  const bonusRollChance = [0, 0.1, 0.25, 0.45, 0.70][qualityTierId] ?? 0;
  const bonusRoll = Math.random() < bonusRollChance ? 1 : 0;

  return Math.max(1, Math.floor(base * mult + gardenBonus) + bonusRoll);
}

/**
 * Résumé lisible pour l'UI (tooltip ou log)
 */
export function harvestQuantityBreakdown(qualityTierId, gardenBonuses, speciesTier) {
  const base  = BASE_QTY[qualityTierId] ?? 1;
  const mult  = TIER_MULT[Math.min(speciesTier, 5)] ?? 1;
  const gardenCount = Object.values(gardenBonuses).filter(v => v > 0).length;
  return {
    base,
    speciesMult: mult,
    gardenBonusRaw: gardenCount * 0.5,
    gardenActive: gardenCount,
  };
}
