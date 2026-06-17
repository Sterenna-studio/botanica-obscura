/**
 * seedDrop.js — Drop de graines à la récolte
 *
 * Mécanique :
 *   - GRAINES PARENTES : chaque espèce mère (species_a / species_b) a une chance
 *     indépendante de redonner 1 à 3 de ses graines.
 *   - GRAINES DE VARIÉTÉ : la plante récoltée a une chance de donner des graines
 *     de SA PROPRE variété (l'espèce résultante de la mutation). Cette chance
 *     croît avec le tier de qualité — une récolte Banger/Comète propage bien
 *     mieux sa lignée qu'un Guezmer.
 *   - Toutes ces graines vont dans botanica_player_seeds.
 *
 * Probabilités (nombre de graines parentes) :
 *   1 graine : 50%   2 graines : 35%   3 graines : 15%
 */

import { supabase } from '../app.js';
import { adjustLocalSeedQuantity } from './localSave.js';

// Chance de base d'obtenir des graines de la variété récoltée, par tier de qualité
// [guezmer, potable, frape, banger, comète]
const VARIETY_DROP_CHANCE = [0.10, 0.20, 0.35, 0.55, 0.75];

// Chance d'en obtenir 2 (au lieu d'1) sur les hauts tiers
const VARIETY_DOUBLE_CHANCE = [0, 0, 0.10, 0.25, 0.40];

function rollSeedDropCount() {
  const roll = Math.random() * 100;
  if (roll < 50)  return 1;
  if (roll < 85)  return 2;
  return 3;
}

/**
 * Ajoute des graines dans botanica_player_seeds pour une espèce.
 * @param {string} userId
 * @param {number} speciesId
 * @param {number} qty
 */
async function addSeed(userId, speciesId, qty) {
  const id = Number(speciesId);
  if (!id || qty <= 0) return;

  const { data: existing } = await supabase
    .from('botanica_player_seeds')
    .select('id, quantity')
    .eq('user_id', userId)
    .eq('species_id', id)
    .maybeSingle();

  if (existing) {
    await supabase.from('botanica_player_seeds')
      .update({ quantity: existing.quantity + qty })
      .eq('id', existing.id);
  } else {
    await supabase.from('botanica_player_seeds')
      .insert({ user_id: userId, species_id: id, quantity: qty, obtained_at: new Date().toISOString() });
  }
  adjustLocalSeedQuantity(id, qty);
}

/**
 * Calcule la chance de drop de graines de variété pour un tier de qualité donné,
 * en tenant compte du bonus jardin « Pollen Fertile » (seedLuck).
 * @param {number} qualityTierId  0..4
 * @param {object} gardenBonuses  { seedLuck, ... }
 * @returns {number} probabilité 0..1
 */
export function varietyDropChance(qualityTierId = 1, gardenBonuses = {}) {
  const base   = VARIETY_DROP_CHANCE[qualityTierId] ?? VARIETY_DROP_CHANCE[1];
  const luck   = Number(gardenBonuses?.seedLuck ?? 0);
  return Math.min(0.95, base + luck * 0.08); // +8% par niveau de Pollen Fertile
}

/**
 * Effectue le drop de graines après une récolte.
 * @param {string} userId
 * @param {number} speciesAId   — première espèce parente du pot
 * @param {number} speciesBId   — deuxième espèce parente du pot
 * @param {object} [opts]
 * @param {number} [opts.resultSpeciesId]  — espèce variété récoltée
 * @param {number} [opts.qualityTierId]    — tier de qualité (0..4)
 * @param {object} [opts.gardenBonuses]    — bonus jardin actifs
 * @returns {{ drops: Array<{speciesId, qty, isVariety?:boolean}> }}
 */
export async function performSeedDrop(userId, speciesAId, speciesBId, opts = {}) {
  const { resultSpeciesId = null, qualityTierId = 1, gardenBonuses = {} } = opts;
  const drops = [];

  // ── Graines parentes (chance indépendante de 70% par parent) ──────────────
  for (const sid of [speciesAId, speciesBId]) {
    if (!sid) continue;
    if (Math.random() < 0.70) {
      const qty = rollSeedDropCount();
      await addSeed(userId, sid, qty);
      drops.push({ speciesId: sid, qty });
    }
  }

  // ── Graines de la variété récoltée (chance selon qualité) ─────────────────
  if (resultSpeciesId) {
    const chance = varietyDropChance(qualityTierId, gardenBonuses);
    if (Math.random() < chance) {
      const dbl = VARIETY_DOUBLE_CHANCE[qualityTierId] ?? 0;
      const qty = Math.random() < dbl ? 2 : 1;
      await addSeed(userId, resultSpeciesId, qty);
      drops.push({ speciesId: resultSpeciesId, qty, isVariety: true });
    }
  }

  return { drops };
}
