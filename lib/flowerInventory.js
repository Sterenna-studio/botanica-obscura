/**
 * flowerInventory.js — Gestion de l'inventaire de fleurs
 *
 * Les fleurs sont le produit récoltable (à vendre / livrer).
 * Elles sont distinctes des graines (botanica_player_seeds) qui servent à planter.
 *
 * Table : botanica_player_flowers
 *   id uuid | user_id uuid | species_id int
 *   quality_tier_id smallint | quantity int | obtained_at timestamptz
 */

import { supabase } from '../app.js';

// ── Chargement ────────────────────────────────────────────────────────────────
export async function loadFlowers(userId) {
  const { data, error } = await supabase
    .from('botanica_player_flowers')
    .select('*, botanica_species(*)')
    .eq('user_id', userId)
    .order('obtained_at', { ascending: false });

  if (error) {
    console.warn('[flowers] Chargement cloud échoué :', error.message);
    return [];
  }
  return (data ?? []).map(f => ({ ...f, species: f.botanica_species }));
}

// ── Ajout de fleurs après récolte ─────────────────────────────────────────────
/**
 * @param {string} userId
 * @param {number} speciesId
 * @param {number} qualityTierId  0..4
 * @param {number} quantity       nb fleurs à ajouter
 */
export async function addFlowers(userId, speciesId, qualityTierId, quantity) {
  if (quantity <= 0) return { error: 'Quantité invalide.' };

  // Tente d'incrémenter une ligne existante (même espèce + même qualité)
  const { data: existing } = await supabase
    .from('botanica_player_flowers')
    .select('id, quantity')
    .eq('user_id', userId)
    .eq('species_id', speciesId)
    .eq('quality_tier_id', qualityTierId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('botanica_player_flowers')
      .update({ quantity: existing.quantity + quantity })
      .eq('id', existing.id);
    if (error) return { error: error.message };
    return { ok: true };
  }

  const { error } = await supabase
    .from('botanica_player_flowers')
    .insert({
      user_id:         userId,
      species_id:      speciesId,
      quality_tier_id: qualityTierId,
      quantity,
      obtained_at:     new Date().toISOString(),
    });
  if (error) return { error: error.message };
  return { ok: true };
}

// ── Vente d'une fleur au NPC ──────────────────────────────────────────────────
const FLOWER_BASE_PRICES = { common: 10, rare: 30, epic: 80, legendary: 200, mythic: 500 };
const FLOWER_QUALITY_MULT = [0.5, 1.0, 1.8, 3.0, 6.0];

export function computeFlowerPrice(rarity, qualityTierId = 1) {
  const base = FLOWER_BASE_PRICES[rarity] ?? 10;
  const mult = FLOWER_QUALITY_MULT[qualityTierId] ?? 1.0;
  return Math.round(base * mult);
}

export async function sellFlowerToNpc(userId, flowerId, speciesId, rarity, qualityTierId = 1) {
  const price = computeFlowerPrice(rarity, qualityTierId);

  const { data: flower, error: readErr } = await supabase
    .from('botanica_player_flowers')
    .select('id, quantity')
    .eq('id', flowerId)
    .eq('user_id', userId)
    .maybeSingle();

  if (readErr || !flower) return { error: 'Fleur introuvable.' };
  if (flower.quantity <= 0) return { error: 'Stock épuisé.' };

  const nextQty = flower.quantity - 1;
  const writeResult = nextQty > 0
    ? await supabase.from('botanica_player_flowers').update({ quantity: nextQty }).eq('id', flowerId)
    : await supabase.from('botanica_player_flowers').delete().eq('id', flowerId);

  if (writeResult.error) return { error: writeResult.error.message };

  // Crédite les pièces
  const { data: pd } = await supabase
    .from('botanica_player_data').select('coins').eq('user_id', userId).maybeSingle();
  const newCoins = (pd?.coins ?? 0) + price;
  await supabase.from('botanica_player_data')
    .update({ coins: newCoins }).eq('user_id', userId);

  // Log
  await supabase.from('botanica_npc_sales_log').insert({
    user_id: userId, species_id: Number(speciesId),
    quality_tier_id: qualityTierId, price_sold: price,
  });

  return { coins: newCoins, price };
}

// ── Total fleurs (pour cargo livraison) ──────────────────────────────────────
export function totalFlowerCount(flowers) {
  return flowers.reduce((sum, f) => sum + (Number(f.quantity) || 0), 0);
}

// ── Rendu UI ──────────────────────────────────────────────────────────────────
import { QUALITY_TIERS } from './quality.js';
import { createPlantCharacterSvg } from './plantSvg.js';

function showToast(msg, type = 'success') {
  let tc = document.getElementById('toast-container');
  if (!tc) { tc = document.createElement('div'); tc.id = 'toast-container'; document.body.appendChild(tc); }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  tc.appendChild(t);
  requestAnimationFrame(() => t.classList.add('toast-visible'));
  setTimeout(() => { t.classList.remove('toast-visible'); t.addEventListener('transitionend', () => t.remove(), { once: true }); }, 2800);
}

export function renderFlowers(flowers, onSell, userId) {
  const grid  = document.getElementById('flowersGrid');
  const empty = document.getElementById('flowersEmpty');
  if (!grid) return;

  if (!flowers.length) {
    grid.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  const rarityOrder = { mythic: 0, legendary: 1, epic: 2, rare: 3, common: 4 };
  const sorted = [...flowers].sort((a, b) => {
    const qDiff = (b.quality_tier_id ?? 0) - (a.quality_tier_id ?? 0);
    if (qDiff !== 0) return qDiff;
    return (rarityOrder[a.species?.rarity] ?? 5) - (rarityOrder[b.species?.rarity] ?? 5);
  });

  grid.innerHTML = sorted.map(f => {
    const qt    = QUALITY_TIERS.find(t => t.id === f.quality_tier_id) ?? QUALITY_TIERS[1];
    const price = computeFlowerPrice(f.species?.rarity ?? 'common', f.quality_tier_id);
    return `
    <div class="inv-card rarity-border-${f.species?.rarity ?? 'common'}" data-flower-id="${f.id}">
      <div class="inv-sprite">${createPlantCharacterSvg(f.species ?? {})}</div>
      <div class="inv-info">
        <div class="inv-name">${f.species?.name ?? '???'}</div>
        <div class="inv-meta">
          <span class="rarity-badge ${f.species?.rarity ?? 'common'}">${f.species?.rarity ?? '?'}</span>
          <span style="color:${qt.color};font-size:0.8em">${qt.label}</span>
        </div>
        <div class="inv-qty">x${f.quantity}</div>
      </div>
      <div class="inv-actions">
        <button class="inv-sell-btn flower-sell-btn"
          data-flower-id="${f.id}"
          data-species-id="${f.species?.id ?? 0}"
          data-rarity="${f.species?.rarity ?? 'common'}"
          data-quality="${f.quality_tier_id}"
          data-name="${f.species?.name ?? '???'}"
          data-price="${price}">
          🪙 ${price}
        </button>
      </div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.flower-sell-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      const { flowerId, speciesId, rarity, quality, name, price } = e.currentTarget.dataset;
      btn.disabled = true; btn.textContent = '⏳';
      const result = await sellFlowerToNpc(userId, flowerId, Number(speciesId), rarity, Number(quality));
      if (result.error) {
        btn.disabled = false; btn.textContent = `🪙 ${price}`;
        showToast(`❌ ${result.error}`, 'error');
        return;
      }
      const card  = grid.querySelector(`.inv-card[data-flower-id="${flowerId}"]`);
      const qtyEl = card?.querySelector('.inv-qty');
      if (qtyEl) {
        const prev = parseInt(qtyEl.textContent.replace('x', ''), 10);
        if (prev <= 1) {
          card?.remove();
          if (!grid.children.length && empty) empty.style.display = 'block';
        } else {
          qtyEl.textContent = `x${prev - 1}`;
          btn.disabled = false; btn.textContent = `🪙 ${price}`;
        }
      }
      showToast(`🌸 +${result.price} — ${name} vendu !`);
      if (typeof onSell === 'function') onSell(result.coins);
    });
  });
}
