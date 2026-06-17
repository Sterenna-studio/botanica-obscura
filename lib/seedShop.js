/**
 * seedShop.js — Boutique de graines de base (Tier 0)
 *
 * Les espèces de base sont achetées avec des pièces.
 * Elles vont dans botanica_player_seeds (pas dans les fleurs).
 *
 * Le niveau du joueur débloque l'achat des raretés supérieures : on devient
 * un botaniste de plus en plus reconnu, donc on a accès à du matériel de plus
 * en plus rare (et cher).
 */

import { supabase } from '../app.js';
import { createSeedSvg } from './plantSvg.js';

// Prix élevés : la boutique est un puits à pièces de fin de boucle
const SHOP_PRICES = { common: 40, rare: 120, epic: 350, legendary: 900, mythic: 2200 };

// Niveau requis pour débloquer l'achat selon la rareté
export const RARITY_UNLOCK_LEVEL = { common: 1, rare: 2, epic: 4, legendary: 6, mythic: 8 };

export function getSeedShopPrice(rarity) {
  return SHOP_PRICES[rarity] ?? 40;
}

export function getRarityUnlockLevel(rarity) {
  return RARITY_UNLOCK_LEVEL[rarity] ?? 1;
}

// ── Chargement des espèces de base ───────────────────────────────────────
export async function loadBaseSpecies() {
  const { data, error } = await supabase
    .from('botanica_species')
    .select('*')
    .eq('is_base_species', true)
    .order('tier', { ascending: true })
    .order('id',   { ascending: true });
  if (error) { console.warn('[seedShop] Chargement espèces base échoué :', error.message); return []; }
  return data ?? [];
}

// ── Achat d'une graine ───────────────────────────────────────────────────────
export async function buyBaseSeed(userId, speciesId, rarity, currentCoins, playerLevel = 1) {
  const unlockLevel = getRarityUnlockLevel(rarity);
  if ((playerLevel ?? 1) < unlockLevel) {
    return { error: `Débloqué au niveau ${unlockLevel} (botaniste expert).` };
  }

  const price = getSeedShopPrice(rarity);
  if (currentCoins < price) return { error: `Pièces insuffisantes (besoin : ${price} 🪙).` };

  const newCoins = currentCoins - price;

  // Débit pièces
  const { error: coinErr } = await supabase
    .from('botanica_player_data')
    .update({ coins: newCoins })
    .eq('user_id', userId);
  if (coinErr) return { error: 'Impossible de débiter les pièces.' };

  // Ajout graine
  const { data: existing } = await supabase
    .from('botanica_player_seeds')
    .select('id, quantity')
    .eq('user_id', userId)
    .eq('species_id', speciesId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('botanica_player_seeds')
      .update({ quantity: existing.quantity + 1 })
      .eq('id', existing.id);
    if (error) return { error: 'Impossible d’ajouter la graine.' };
  } else {
    const { error } = await supabase
      .from('botanica_player_seeds')
      .insert({ user_id: userId, species_id: speciesId, quantity: 1, obtained_at: new Date().toISOString() });
    if (error) return { error: 'Impossible d’ajouter la graine.' };
  }

  return { ok: true, newCoins, price };
}

// ── Rendu UI boutique ────────────────────────────────────────────────────────────
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

/**
 * @param {Array}    baseSpecies   — résultat de loadBaseSpecies()
 * @param {number}   currentCoins  — pièces actuelles du joueur
 * @param {string}   userId
 * @param {function} onBuy         — callback(newCoins) après achat réussi
 * @param {number}   playerLevel   — niveau du joueur (déblocage des raretés)
 */
export function renderSeedShop(baseSpecies, currentCoins, userId, onBuy, playerLevel = 1) {
  const grid  = document.getElementById('shopGrid');
  const empty = document.getElementById('shopEmpty');
  if (!grid) return;

  if (!baseSpecies.length) {
    grid.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  // Trie par rareté de déblocage pour un parcours "progression"
  const sorted = [...baseSpecies].sort((a, b) =>
    getRarityUnlockLevel(a.rarity) - getRarityUnlockLevel(b.rarity) || a.id - b.id);

  grid.innerHTML = sorted.map(sp => {
    const price       = getSeedShopPrice(sp.rarity);
    const unlockLevel = getRarityUnlockLevel(sp.rarity);
    const locked      = (playerLevel ?? 1) < unlockLevel;
    const canAfford   = currentCoins >= price;
    const canBuy      = !locked && canAfford;

    const btn = locked
      ? `<button class="shop-buy-btn shop-btn-locked" disabled>🔒 Niveau ${unlockLevel}</button>`
      : `<button
          class="shop-buy-btn ${canAfford ? '' : 'shop-btn-disabled'}"
          data-species-id="${sp.id}"
          data-rarity="${sp.rarity}"
          data-name="${sp.name}"
          data-price="${price}"
          ${canAfford ? '' : 'disabled'}
        >🪙 ${price}</button>`;

    return `
    <div class="shop-card rarity-border-${sp.rarity} ${locked ? 'shop-card-locked' : ''}" data-species-id="${sp.id}">
      <div class="shop-sprite">${createSeedSvg(sp)}</div>
      <div class="shop-info">
        <div class="shop-name">${sp.name}</div>
        <div class="shop-meta">
          <span class="rarity-badge ${sp.rarity}">${sp.rarity}</span>
          <span class="shop-tier">Tier ${sp.tier}</span>
        </div>
        <div class="shop-desc">${sp.description ?? ''}</div>
      </div>
      ${btn}
    </div>`;
  }).join('');

  grid.querySelectorAll('.shop-buy-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', async e => {
      const { speciesId, rarity, name, price } = e.currentTarget.dataset;
      btn.disabled = true;
      btn.textContent = '⏳';

      const result = await buyBaseSeed(userId, Number(speciesId), rarity, currentCoins, playerLevel);

      if (result.error) {
        btn.disabled = false;
        btn.textContent = `🪙 ${price}`;
        showToast(`❌ ${result.error}`, 'error');
        return;
      }

      showToast(`🌱 ${name} achetée ! −${price} 🪙`);
      if (typeof onBuy === 'function') onBuy(result.newCoins);
    });
  });
}
