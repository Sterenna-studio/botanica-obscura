/**
 * seedDrop.js — Drop de graines des espèces parentes à la récolte
 *
 * Mécanique :
 *   - Chaque récolte a une chance de donner 1, 2 ou 3 graines
 *   - Les graines tombent des ESPÈCES PARENTES (species_a et species_b du pot)
 *   - Elles vont dans botanica_player_seeds (pas dans les fleurs)
 *
 * Probabilités :
 *   1 graine : 50%
 *   2 graines : 35%
 *   3 graines : 15%
 */

import { supabase } from '../app.js';
import { adjustLocalSeedQuantity } from './localSave.js';

const DROP_WEIGHTS = [50, 35, 15]; // index+1 = nombre de graines

function rollSeedDropCount() {
  const roll = Math.random() * 100;
  if (roll < 50)  return 1;
  if (roll < 85)  return 2;
  return 3;
}

/**
 * Ajoute des graines dans botanica_player_seeds pour une espèce parente.
 * @param {string} userId
 * @param {number} speciesId  — id de l'espèce parente
 * @param {number} qty        — 1, 2 ou 3
 */
async function addParentSeed(userId, speciesId, qty) {
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
 * Effectue le drop de graines parentes après une récolte.
 * @param {string} userId
 * @param {number} speciesAId  — première espèce parente du pot
 * @param {number} speciesBId  — deuxième espèce parente du pot
 * @returns {{ drops: Array<{speciesId, qty}> }}
 */
export async function performSeedDrop(userId, speciesAId, speciesBId) {
  const drops = [];

  // Chaque parent a sa propre chance de drop (indépendant)
  for (const sid of [speciesAId, speciesBId]) {
    if (!sid) continue;
    // 70% de chance de drop par parent
    if (Math.random() < 0.70) {
      const qty = rollSeedDropCount();
      await addParentSeed(userId, sid, qty);
      drops.push({ speciesId: sid, qty });
    }
  }

  return { drops };
}
