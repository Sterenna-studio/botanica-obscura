import { supabase } from '../app.js';
import { sellSeedToNpc, computeNpcPrice } from './npcShop.js';

export async function loadInventory(userId) {
  const { data, error } = await supabase
    .from('player_seeds')
    .select('*, species(*)')
    .eq('user_id', userId)
    .order('obtained_at', { ascending: false });
  if (error) return [];
  return data || [];
}

/**
 * @param {Array}    seeds
 * @param {Function} onSelect    (speciesId) — branché sur le pot de mutation
 * @param {Function} onSell      (newCoins)  — callback pour rafraîchir les stats joueur
 * @param {string}   userId
 */
export function renderInventory(seeds, onSelect, onSell, userId) {
  const grid  = document.getElementById('inventoryGrid');
  const empty = document.getElementById('inventoryEmpty');
  if (!grid) return;

  if (!seeds.length) {
    grid.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  const rarityOrder = { mythic: 0, legendary: 1, epic: 2, rare: 3, common: 4 };
  const sorted = [...seeds].sort((a, b) =>
    (rarityOrder[a.species.rarity] ?? 5) - (rarityOrder[b.species.rarity] ?? 5)
  );

  grid.innerHTML = sorted.map(seed => {
    const price = computeNpcPrice(seed.species.rarity);
    return `
    <div class="inv-card rarity-border-${seed.species.rarity}" data-seed-id="${seed.id}" data-species-id="${seed.species.id}" title="${seed.species.description || ''}">
      <div class="inv-sprite">
        <svg viewBox="0 0 100 120">
          <ellipse cx="50" cy="54" rx="28" ry="35" fill="${seed.species.body_color || '#7ec850'}" />
          <line x1="22" y1="52" x2="6" y2="66" stroke="${seed.species.stem_color || '#4a7c2f'}" stroke-width="4" stroke-linecap="round"/>
          <line x1="78" y1="52" x2="94" y2="66" stroke="${seed.species.stem_color || '#4a7c2f'}" stroke-width="4" stroke-linecap="round"/>
          <line x1="38" y1="88" x2="28" y2="110" stroke="${seed.species.stem_color || '#4a7c2f'}" stroke-width="4" stroke-linecap="round"/>
          <line x1="62" y1="88" x2="72" y2="110" stroke="${seed.species.stem_color || '#4a7c2f'}" stroke-width="4" stroke-linecap="round"/>
          <circle cx="42" cy="52" r="4" fill="white"/><circle cx="58" cy="52" r="4" fill="white"/>
          <circle cx="43" cy="53" r="2" fill="${seed.species.eye_color || '#222'}"/>
          <circle cx="59" cy="53" r="2" fill="${seed.species.eye_color || '#222'}"/>
        </svg>
      </div>
      <div class="inv-info">
        <div class="inv-name">${seed.species.name}</div>
        <div class="inv-meta"><span class="rarity-badge ${seed.species.rarity}">${seed.species.rarity}</span> T${seed.species.tier}</div>
        <div class="inv-qty">x${seed.quantity}</div>
      </div>
      <div class="inv-actions">
        <button class="inv-select-btn" data-species-id="${seed.species.id}">Utiliser</button>
        <button class="inv-sell-btn" data-seed-id="${seed.id}" data-species-id="${seed.species.id}" data-rarity="${seed.species.rarity}" title="Vendre au NPC">
          🪙 ${price}
        </button>
      </div>
    </div>`;
  }).join('');

  // Bouton Utiliser (inchangé)
  grid.querySelectorAll('.inv-select-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.currentTarget.dataset.speciesId;
      onSelect(id);
    });
  });

  // Bouton Vendre
  grid.querySelectorAll('.inv-sell-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      const { seedId, speciesId, rarity } = e.currentTarget.dataset;
      btn.disabled = true;
      btn.textContent = '⏳';

      const result = await sellSeedToNpc(userId, seedId, Number(speciesId), rarity);

      if (result.error) {
        btn.disabled = false;
        btn.textContent = `🪙 ${computeNpcPrice(rarity)}`;
        alert(result.error);
        return;
      }

      if (typeof onSell === 'function') onSell(result.coins);
    });
  });
}
