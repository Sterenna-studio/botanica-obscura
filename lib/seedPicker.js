/**
 * seedPicker.js — Modal de sélection de graine pour les pots
 *
 * Ouvre une modal compacte avec une grille de cards (sprite SVG + nom + quantité).
 * Appelle onSelect(speciesId) quand une graine est choisie.
 * Appelle onClear() si le slot est effacé.
 */

import { createPlantCharacterSvg } from './plantSvg.js';

const RARITY_ORDER = { mythic: 0, legendary: 1, epic: 2, rare: 3, common: 4 };

/**
 * @param {Map<number,number>}  seedQuantities  speciesId → qty
 * @param {Array}               speciesList
 * @param {string}              label           'Mère A' | 'Mère B'
 * @param {number|null}         currentId       espèce déjà sélectionnée
 * @param {function}            onSelect        (speciesId: number) => void
 * @param {function}            onClear         () => void
 */
export function openSeedPicker(seedQuantities, speciesList, label, currentId, onSelect, onClear) {
  // Nettoie un éventuel picker déjà ouvert
  document.getElementById('seed-picker-overlay')?.remove();

  const available = speciesList
    .filter(s => (seedQuantities.get(Number(s.id)) ?? 0) > 0)
    .sort((a, b) => {
      const qDiff = (seedQuantities.get(Number(b.id)) ?? 0) - (seedQuantities.get(Number(a.id)) ?? 0);
      if (qDiff !== 0) return qDiff;
      return (RARITY_ORDER[a.rarity] ?? 5) - (RARITY_ORDER[b.rarity] ?? 5);
    });

  const overlay = document.createElement('div');
  overlay.id = 'seed-picker-overlay';
  overlay.className = 'sp-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `Choisir une graine — ${label}`);

  overlay.innerHTML = `
    <div class="sp-card">
      <div class="sp-header">
        <span class="sp-title">🌱 ${label}</span>
        <button class="sp-close" aria-label="Fermer">&times;</button>
      </div>
      ${
        currentId
          ? `<button class="sp-clear-btn">✕ Retirer la sélection</button>`
          : ''
      }
      ${
        available.length
          ? `<div class="sp-grid">${available.map(s => _buildCard(s, seedQuantities, currentId)).join('')}</div>`
          : `<div class="sp-empty">Aucune graine disponible.<br>Achetez des graines dans la Boutique !</div>`
      }
    </div>
  `;

  // Fermeture
  overlay.querySelector('.sp-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  // Effacer
  overlay.querySelector('.sp-clear-btn')?.addEventListener('click', () => {
    overlay.remove();
    onClear();
  });

  // Sélection
  overlay.querySelectorAll('.sp-seed-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = Number(card.dataset.speciesId);
      overlay.remove();
      onSelect(id);
    });
  });

  // Trap focus sur Escape
  overlay.addEventListener('keydown', e => { if (e.key === 'Escape') overlay.remove(); });

  document.body.appendChild(overlay);
  // Focus premier élément
  requestAnimationFrame(() => overlay.querySelector('.sp-seed-card, .sp-close')?.focus());
}

function _buildCard(species, seedQuantities, currentId) {
  const qty    = seedQuantities.get(Number(species.id)) ?? 0;
  const active = Number(species.id) === Number(currentId) ? 'sp-seed-active' : '';
  return `
    <button class="sp-seed-card ${active} rarity-seed-${species.rarity ?? 'common'}"
            data-species-id="${species.id}"
            title="${species.name} — ${species.rarity} T${species.tier}">
      <div class="sp-seed-sprite">${createPlantCharacterSvg(species)}</div>
      <div class="sp-seed-name">${species.name}</div>
      <div class="sp-seed-meta">
        <span class="sp-seed-rarity rarity-dot-${species.rarity ?? 'common'}"></span>
        <span class="sp-seed-qty">×${qty}</span>
      </div>
    </button>
  `;
}
