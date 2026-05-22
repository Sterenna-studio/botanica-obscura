import { supabase } from '../app.js';
import { sellSeedToNpc, computeNpcPrice } from './npcShop.js';
import { loadLocal, patchLocalSeeds } from './localSave.js';
import { getFallbackSpeciesTree } from './speciesTree.js';
import { createPlantCharacterSvg } from './plantSvg.js';

export async function loadInventory(userId) {
  const { data, error } = await supabase
    .from('botanica_player_seeds')
    .select('*, botanica_species(*)')
    .eq('user_id', userId)
    .order('obtained_at', { ascending: false });

  if (error) {
    console.warn('[inventory] Chargement cloud échoué, fallback local :', error.message);
    const fallbackSpecies = getFallbackSpeciesTree();
    return (loadLocal()?.seeds ?? []).map(seed => {
      const species = fallbackSpecies.find(sp => sp.id === seed.species_id) ?? {
        id: seed.species_id,
        name: `Espèce #${seed.species_id}`,
        tier: 0,
        rarity: 'common',
      };
      return {
        id: `local-${seed.species_id}`,
        species_id: seed.species_id,
        quantity: seed.quantity,
        species,
      };
    });
  }

  const seeds = (data || []).map(seed => ({ ...seed, species: seed.botanica_species }));
  patchLocalSeeds(seeds);
  return seeds;
}

function showToast(msg, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-visible'));
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 2800);
}

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
      <div class="inv-sprite">${createPlantCharacterSvg(seed.species)}</div>
      <div class="inv-info">
        <div class="inv-name">${seed.species.name}</div>
        <div class="inv-meta"><span class="rarity-badge ${seed.species.rarity}">${seed.species.rarity}</span> T${seed.species.tier}</div>
        <div class="inv-qty" data-seed-id="${seed.id}">x${seed.quantity}</div>
      </div>
      <div class="inv-actions">
        <button class="inv-select-btn" data-species-id="${seed.species.id}" title="Placer cette graine dans le prochain emplacement libre d'un pot">🌱 Placer</button>
        <button class="inv-sell-btn" data-seed-id="${seed.id}" data-species-id="${seed.species.id}" data-rarity="${seed.species.rarity}" data-name="${seed.species.name}" data-price="${price}" title="Vendre au NPC">
          🪙 ${price}
        </button>
      </div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.inv-select-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const selected = onSelect(e.currentTarget.dataset.speciesId);
      if (selected === false) {
        showToast('Aucun pot libre ne peut recevoir cette graine. Vérifie les slots ou la quantité disponible.', 'error');
      } else {
        showToast('Graine placée dans un pot. Choisis une deuxième graine puis lance la mutation.');
      }
    });
  });

  grid.querySelectorAll('.inv-sell-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      const { seedId, speciesId, rarity, name, price } = e.currentTarget.dataset;
      btn.disabled = true;
      btn.textContent = '⏳';

      const result = await sellSeedToNpc(userId, seedId, Number(speciesId), rarity);

      if (result.error) {
        btn.disabled = false;
        btn.textContent = `🪙 ${price}`;
        showToast(`❌ ${result.error}`, 'error');
        return;
      }

      const card  = grid.querySelector(`.inv-card[data-seed-id="${seedId}"]`);
      const qtyEl = grid.querySelector(`.inv-qty[data-seed-id="${seedId}"]`);
      if (qtyEl) {
        const prev = parseInt(qtyEl.textContent.replace('x', ''), 10);
        if (prev <= 1) {
          card?.remove();
          if (!grid.children.length && empty) empty.style.display = 'block';
        } else {
          qtyEl.textContent = `x${prev - 1}`;
          btn.disabled = false;
          btn.textContent = `🪙 ${price}`;
        }
      }

      showToast(`🪙 +${price} — ${name} vendu au NPC !`);
      if (typeof onSell === 'function') onSell(result.coins);
    });
  });
}