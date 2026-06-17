/**
 * lib/labExpansion.js — Achat de pots supplémentaires (agrandir le labo)
 *
 * En plus des pots débloqués par le niveau, le joueur peut acheter des slots
 * de pot directement, à prix (volontairement) élevé et croissant. Le cap de
 * pots effectif est porté par `pot_slots` dans botanica_player_data.
 */

import { supabase } from '../app.js';
import { loadLocal, patchLocal } from './localSave.js';

export const MAX_POT_SLOTS = 8;

const BASE_SLOT_COST = 1500;

/** Coût pour passer de `currentSlots` à `currentSlots + 1`. */
export function getPotSlotCost(currentSlots) {
  // 4→5 : 4500, 5→6 : 6000, 6→7 : 7500, 7→8 : 9000…
  return BASE_SLOT_COST * Math.max(1, currentSlots);
}

function isValidUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

/**
 * Achète un slot de pot supplémentaire.
 * @returns {{ newCoins, newPotSlots } | { error }}
 */
export async function buyPotSlot(userId, currentSlots, currentCoins) {
  const slots = Number(currentSlots) || 1;
  if (slots >= MAX_POT_SLOTS) return { error: 'Labo au maximum (8 pots).' };

  const cost = getPotSlotCost(slots);
  if (currentCoins < cost) return { error: `Pièces insuffisantes (besoin : ${cost} 🪙).` };

  const newCoins    = currentCoins - cost;
  const newPotSlots = slots + 1;

  const localPlayerData = loadLocal()?.playerData ?? {};
  patchLocal('playerData', { ...localPlayerData, coins: newCoins, pot_slots: newPotSlots });

  if (isValidUUID(userId)) {
    const { error } = await supabase
      .from('botanica_player_data')
      .upsert({ user_id: userId, coins: newCoins, pot_slots: newPotSlots }, { onConflict: 'user_id' });
    if (error) return { error: error.message };
  }

  return { newCoins, newPotSlots, cost };
}

/**
 * Rendu de la carte « Agrandir le laboratoire » dans la boutique.
 * @param {object}   playerData  { coins, pot_slots }
 * @param {function} onBuy       callback() après achat réussi
 */
export function renderLabExpansion(playerData, onBuy) {
  const container = document.getElementById('labExpansionContainer');
  if (!container) return;

  const slots  = Number(playerData.pot_slots) || 1;
  const maxed  = slots >= MAX_POT_SLOTS;
  const cost   = maxed ? 0 : getPotSlotCost(slots);
  const afford = (playerData.coins ?? 0) >= cost;

  container.innerHTML = `
    <div class="lab-expansion-card ${maxed ? 'lab-maxed' : ''}">
      <div class="lab-expansion-emoji">🧪</div>
      <div class="lab-expansion-info">
        <div class="lab-expansion-title">Agrandir le laboratoire</div>
        <div class="lab-expansion-desc">Ajoute un pot de mutation supplémentaire (${slots}/${MAX_POT_SLOTS} pots).</div>
      </div>
      ${maxed
        ? '<div class="lab-expansion-max">MAX</div>'
        : `<button class="lab-expansion-btn ${afford ? '' : 'disabled'}" ${afford ? '' : 'disabled'}>🪙 ${cost}</button>`
      }
    </div>`;

  const btn = container.querySelector('.lab-expansion-btn:not([disabled])');
  if (btn) btn.addEventListener('click', () => onBuy());
}
