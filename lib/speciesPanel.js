/**
 * speciesPanel.js — Panneau latéral détail d'une espèce
 * Partagé entre le Codex et l'Arbre des mutations.
 */
import { createPlantCharacterSvg } from './plantSvg.js';
import { computeNpcPrice } from './npcShop.js';

const RARITY_LABELS = {
  common: 'Commune', rare: 'Rare', epic: 'Épique', legendary: 'Légendaire', mythic: 'Mythique',
};
const QUALITY_LABELS = [
  { id: 0, label: 'Médiocre',   emoji: '🥀' },
  { id: 1, label: 'Standard',   emoji: '🌿' },
  { id: 2, label: 'Soigné',     emoji: '🌱' },
  { id: 3, label: 'Exceptionnel', emoji: '🌸' },
  { id: 4, label: 'Légendaire', emoji: '🌟' },
];

function escHtml(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function getOrCreatePanel() {
  let panel = document.getElementById('species-detail-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'species-detail-panel';
    panel.className = 'species-panel';
    panel.innerHTML = '<button class="species-panel-close" aria-label="Fermer">✕</button><div class="species-panel-body"></div>';
    document.body.appendChild(panel);
    panel.querySelector('.species-panel-close').addEventListener('click', () => closePanel());
    // Ferme au clic sur le backdrop
    panel.addEventListener('click', e => { if (e.target === panel) closePanel(); });
  }
  return panel;
}

export function closePanel() {
  const panel = document.getElementById('species-detail-panel');
  if (panel) {
    panel.classList.remove('species-panel--open');
    panel.setAttribute('aria-hidden', 'true');
  }
}

/**
 * @param {object} species        - L'espèce à afficher
 * @param {object[]} speciesList  - Liste complète pour résoudre les parents
 * @param {Map<number,number>} inventoryQties - species_id → quantité en inventaire
 * @param {function} onCraft      - callback(speciesId, parentAId, parentBId) quand le joueur clique Craft
 * @param {Set<number>} unlockedIds - IDs débloqués par le joueur
 */
export function renderSpeciesPanel(species, speciesList, inventoryQties, onCraft, unlockedIds = new Set()) {
  const panel = getOrCreatePanel();
  const body  = panel.querySelector('.species-panel-body');
  const byId  = new Map(speciesList.map(s => [Number(s.id), s]));

  const parentA = species.parent_a_id ? byId.get(Number(species.parent_a_id)) : null;
  const parentB = species.parent_b_id ? byId.get(Number(species.parent_b_id)) : null;
  const isTier1 = !parentA && !parentB;

  const qtyA   = parentA ? (inventoryQties.get(Number(parentA.id)) ?? 0) : 0;
  const qtyB   = parentB ? (inventoryQties.get(Number(parentB.id)) ?? 0) : 0;
  const selfQty = inventoryQties.get(Number(species.id)) ?? 0;

  // Cross identique : besoin de 2 exemplaires du même parent
  const isSelfCross = parentA && parentB && Number(parentA.id) === Number(parentB.id);
  const canCraft = isTier1
    ? false
    : isSelfCross
      ? qtyA >= 2
      : qtyA >= 1 && qtyB >= 1;

  const rarity      = species.rarity ?? 'common';
  const rarityLabel = RARITY_LABELS[rarity] ?? rarity;
  const isUnlocked  = unlockedIds.has(Number(species.id));
  const stateLabel  = isUnlocked ? '✅ Découverte' : (species.discovered_by ? '🌐 Connue serveur' : '❓ Inconnue');

  // Prix NPC par qualité
  const priceRows = QUALITY_LABELS.map(q =>
    `<tr><td>${q.emoji} ${escHtml(q.label)}</td><td class="sp-price">🪙 ${computeNpcPrice(rarity, q.id)}</td></tr>`
  ).join('');

  // Recette
  let recipeHtml;
  if (isTier1) {
    recipeHtml = `<div class="sp-recipe sp-recipe-base">🌱 Espèce de base — obtenue via colis mystère ou départ.</div>`;
  } else {
    const nameA = escHtml(parentA?.name ?? '???');
    const nameB = escHtml(parentB?.name ?? '???');
    const colorA = canCraft || qtyA > 0 ? 'sp-parent-ok' : 'sp-parent-miss';
    const colorB = canCraft || qtyB > 0 ? 'sp-parent-ok' : 'sp-parent-miss';
    recipeHtml = `
      <div class="sp-recipe">
        <span class="sp-parent ${colorA}">${nameA}<br><small>x${qtyA} en inventaire</small></span>
        <span class="sp-cross">×</span>
        <span class="sp-parent ${colorB}">${nameB}<br><small>x${qtyB} en inventaire</small></span>
      </div>
      ${canCraft
        ? `<button class="sp-craft-btn" data-species-id="${species.id}" data-parent-a="${parentA?.id}" data-parent-b="${parentB?.id}">🌱 Envoyer dans un pot</button>`
        : `<div class="sp-craft-disabled">❌ Graines manquantes pour crafter</div>`
      }`;
  }

  const ownedBadge = selfQty > 0 ? `<span class="sp-owned-badge">🎒 x${selfQty} en inventaire</span>` : '';

  body.innerHTML = `
    <div class="sp-header rarity-${escHtml(rarity)}">
      <div class="sp-svg">${isUnlocked ? createPlantCharacterSvg(species) : '<div class="sp-silhouette">?</div>'}</div>
      <div class="sp-header-info">
        <h2 class="sp-name">${isUnlocked ? escHtml(species.name) : 'Espèce inconnue'}</h2>
        <div class="sp-badges">
          <span class="rarity-badge ${escHtml(rarity)}">${escHtml(rarityLabel)}</span>
          <span class="sp-tier-badge">Tier ${escHtml(species.tier ?? '?')}</span>
          <span class="sp-state-badge">${stateLabel}</span>
        </div>
        ${ownedBadge}
        ${species.was_first_server ? '<div class="first-discovery">🏅 1ère découverte mondiale</div>' : ''}
      </div>
    </div>

    ${isUnlocked && species.description ? `<p class="sp-desc">${escHtml(species.description)}</p>` : ''}

    <div class="sp-section">
      <h3>🧪 Recette de mutation</h3>
      ${recipeHtml}
    </div>

    <div class="sp-section">
      <h3>🪙 Prix NPC (par qualité)</h3>
      <table class="sp-price-table">${priceRows}</table>
    </div>
  `;

  // Bind bouton craft
  const craftBtn = body.querySelector('.sp-craft-btn');
  if (craftBtn && onCraft) {
    craftBtn.addEventListener('click', () => {
      onCraft(Number(craftBtn.dataset.speciesId), Number(craftBtn.dataset.parentA), Number(craftBtn.dataset.parentB));
      closePanel();
    });
  }

  panel.setAttribute('aria-hidden', 'false');
  panel.classList.add('species-panel--open');
}
