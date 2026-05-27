/**
 * sellModal.js — Modal de vente de fleurs (NPC + livraison express)
 *
 * NPC       : prix fixes, 100% garanti
 * Express   : +30% mais 25% de chance de perdre la mise (police)
 */

import { supabase } from '../app.js';
import { computeFlowerPrice } from './flowerInventory.js';
import { QUALITY_TIERS } from './quality.js';

// ── Calcul du total NPC ─────────────────────────────────────────────────────
export function computeNpcTotal(flowers) {
  return flowers.reduce((sum, f) => {
    const price = computeFlowerPrice(f.species?.rarity ?? 'common', f.quality_tier_id ?? 1);
    return sum + price * (f.quantity ?? 1);
  }, 0);
}

// ── Vente tout au NPC ───────────────────────────────────────────────────────
export async function sellAllToNpc(userId, flowers) {
  if (!flowers.length) return { error: 'Aucune fleur à vendre.' };

  const total = computeNpcTotal(flowers);

  // Supprime toutes les lignes de fleurs du joueur
  const { error: delErr } = await supabase
    .from('botanica_player_flowers')
    .delete()
    .eq('user_id', userId);
  if (delErr) return { error: 'Impossible de vider l’inventaire.' };

  // Log (une ligne par stack)
  const logs = flowers.flatMap(f => [{
    user_id:         userId,
    species_id:      Number(f.species?.id ?? f.species_id),
    quality_tier_id: f.quality_tier_id ?? 1,
    price_sold:      computeFlowerPrice(f.species?.rarity ?? 'common', f.quality_tier_id ?? 1) * (f.quantity ?? 1),
  }]);
  if (logs.length) await supabase.from('botanica_npc_sales_log').insert(logs);

  // Crédite les pièces
  const { data: pd } = await supabase
    .from('botanica_player_data').select('coins').eq('user_id', userId).maybeSingle();
  const newCoins = (pd?.coins ?? 0) + total;
  await supabase.from('botanica_player_data')
    .update({ coins: newCoins }).eq('user_id', userId);

  return { ok: true, earned: total, newCoins };
}

// ── Livraison express ───────────────────────────────────────────────────────
const EXPRESS_BONUS = 1.3;  // +30%
const EXPRESS_RISK  = 0.25; // 25% chance d'échec

export async function sellExpress(userId, flowers) {
  if (!flowers.length) return { error: 'Aucune fleur à livrer.' };

  const lost = Math.random() < EXPRESS_RISK;

  // Supprime toujours les fleurs (risque réel)
  const { error: delErr } = await supabase
    .from('botanica_player_flowers')
    .delete()
    .eq('user_id', userId);
  if (delErr) return { error: 'Erreur lors de la livraison.' };

  if (lost) return { ok: true, lost: true, earned: 0, newCoins: null };

  const base  = computeNpcTotal(flowers);
  const total = Math.round(base * EXPRESS_BONUS);

  const { data: pd } = await supabase
    .from('botanica_player_data').select('coins').eq('user_id', userId).maybeSingle();
  const newCoins = (pd?.coins ?? 0) + total;
  await supabase.from('botanica_player_data')
    .update({ coins: newCoins }).eq('user_id', userId);

  return { ok: true, lost: false, earned: total, newCoins };
}

// ── UI : ouvre la modal ────────────────────────────────────────────────────────
/**
 * @param {Array}    flowers
 * @param {string}   userId
 * @param {function} onDone(newCoins | null, earned, lost)
 */
export function openSellModal(flowers, userId, onDone) {
  const modal = document.getElementById('sell-modal');
  if (!modal) return;

  const total     = flowers.reduce((s, f) => s + (f.quantity ?? 1), 0);
  const npcTotal  = computeNpcTotal(flowers);
  const exprTotal = Math.round(npcTotal * EXPRESS_BONUS);

  modal.querySelector('#sell-modal-count').textContent  = `${total} fleur${total !== 1 ? 's' : ''}`;
  modal.querySelector('#sell-modal-npc').textContent    = `🪙 ${npcTotal} garanti`;
  modal.querySelector('#sell-modal-expr').textContent   = `🚗 ${exprTotal} (+30%) — risque 25%`;

  // État initial
  const resultEl = modal.querySelector('#sell-modal-result');
  resultEl.textContent = '';
  resultEl.className   = 'sell-modal-result';

  const npcBtn  = modal.querySelector('#sell-btn-npc');
  const exprBtn = modal.querySelector('#sell-btn-express');
  const closeBtn = modal.querySelector('#sell-modal-close');

  function setLoading(yes) {
    npcBtn.disabled  = yes;
    exprBtn.disabled = yes;
  }

  function showResult(msg, type, earned, newCoins, lost) {
    resultEl.textContent = msg;
    resultEl.className   = `sell-modal-result sell-modal-${type}`;
    npcBtn.style.display  = 'none';
    exprBtn.style.display = 'none';
    closeBtn.textContent  = 'Fermer';
    closeBtn.onclick = () => {
      modal.style.display = 'none';
      onDone?.(newCoins, earned, lost);
    };
  }

  npcBtn.onclick = async () => {
    setLoading(true);
    const r = await sellAllToNpc(userId, flowers);
    if (r.error) { setLoading(false); resultEl.textContent = `❌ ${r.error}`; return; }
    showResult(`✅ Vendu ! +🪙 ${r.earned} pièces`, 'success', r.earned, r.newCoins, false);
  };

  exprBtn.onclick = async () => {
    setLoading(true);
    const r = await sellExpress(userId, flowers);
    if (r.error) { setLoading(false); resultEl.textContent = `❌ ${r.error}`; return; }
    if (r.lost) {
      showResult('🚨 Arrêté par la police ! Cargo confisqué.', 'danger', 0, null, true);
    } else {
      showResult(`🚗 Livraison réussie ! +🪙 ${r.earned} pièces`, 'success', r.earned, r.newCoins, false);
    }
  };

  closeBtn.textContent = 'Annuler';
  closeBtn.onclick = () => { modal.style.display = 'none'; };
  npcBtn.style.display  = '';
  exprBtn.style.display = '';

  modal.style.display = 'flex';
}
