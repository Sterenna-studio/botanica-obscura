// lib/pots.js — Rendu UI de la grille multi-pots
import { startMutationPot, harvestMutation, loadActivePots } from './mutation.js';
import { schedulePotNotification } from './notifications.js';
import { computeHarvestXp, addXpToPlayer } from './xp.js';
import { openSeedPicker } from './seedPicker.js';
import { createPlantCharacterSvg } from './plantSvg.js';
import { qualityOdds } from './quality.js';
import { harvestQuantityRange } from './harvestQuantity.js';
import { varietyDropChance } from './seedDrop.js';
import { recordMutationLaunched } from './stats.js';
import { recordQuestEvent } from './quests.js';
import { MAX_POT_SLOTS } from './labExpansion.js';

let _speciesList    = [];
let _playerData     = { coins: 0, level: 1, xp: 0, pot_slots: 1 };
let _onHarvest      = null;
let _onSeedsChanged = null;
let _gardenBonuses  = {};
let _seedQuantities = new Map();
let _potTimers      = {};
let _activePots     = [];

// Sélections en cours pour les slots vides : slotIdx → { a: speciesId|null, b: speciesId|null }
let _slotSelections = {};

// ── Badge "pot prêt" sur l'onglet Labo ────────────────────────────────
function _updateLabBadge() {
  const badge = document.getElementById('lab-ready-badge');
  if (!badge) return;
  const readyCount = _activePots.filter(pot => {
    if (!pot) return false;
    return pot.ready_at && new Date(pot.ready_at).getTime() <= Date.now();
  }).length;
  if (readyCount > 0) {
    badge.textContent = readyCount;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

// ── Init ────────────────────────────────────────────────────────────────────
export async function initPots(speciesList, playerData, onHarvestCb, gardenBonuses = {}, onSeedsChangedCb = null) {
  _speciesList    = speciesList;
  _playerData     = playerData;
  _onHarvest      = onHarvestCb;
  _gardenBonuses  = gardenBonuses ?? {};
  _onSeedsChanged = onSeedsChangedCb;

  _activePots = await loadActivePots(playerData.user_id ?? playerData.userId);
  renderPotsGrid();
  _activePots.forEach(pot => _startTimer(pot));
  _updateLabBadge();
}

export function updatePotsSpecies(speciesList) {
  _speciesList = speciesList;
  renderPotsGrid();
}

export function updatePotsPlayerData(playerData) {
  _playerData = playerData;
  renderPotsGrid();
}

export function updatePotsGarden(gardenBonuses = {}) {
  _gardenBonuses = gardenBonuses ?? {};
}

export function updatePotsInventory(seeds = []) {
  _seedQuantities = new Map(
    seeds
      .map(seed => [Number(seed.species_id ?? seed.species?.id), Number(seed.quantity ?? 0)])
      .filter(([id, qty]) => Number.isFinite(id) && id > 0 && qty > 0)
  );
  renderPotsGrid();
}

// Place une graine dans le prochain slot libre (appelé depuis l'inventaire)
export function selectSpeciesForNextPot(speciesId) {
  const numId = Number(speciesId);
  const slots = _playerData.pot_slots ?? 1;

  for (let i = 0; i < slots; i++) {
    if (_activePots[i]) continue; // slot occupé
    const sel = _slotSelections[i] ?? { a: null, b: null };

    if (!sel.a) {
      _slotSelections[i] = { ...sel, a: numId };
      _focusSlot(i);
      renderPotsGrid();
      return true;
    }
    if (!sel.b) {
      const sameSpecies = sel.a === numId;
      const hasEnough   = (_seedQuantities.get(numId) ?? 0) >= 2;
      if (sameSpecies && !hasEnough) continue;
      _slotSelections[i] = { ...sel, b: numId };
      _focusSlot(i);
      renderPotsGrid();
      return true;
    }
  }
  return false;
}

function _focusSlot(slotIdx) {
  requestAnimationFrame(() => {
    const cards = document.querySelectorAll('.multi-pot-card.pot-empty');
    const emptySlots = _getEmptySlotIndices();
    const posInEmpty = emptySlots.indexOf(slotIdx);
    const card = cards[posInEmpty];
    if (!card) return;
    card.classList.add('pot-placement-focus');
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => card.classList.remove('pot-placement-focus'), 900);
  });
}

function _getEmptySlotIndices() {
  const slots = _playerData.pot_slots ?? 1;
  const indices = [];
  for (let i = 0; i < slots; i++) {
    if (!_activePots[i]) indices.push(i);
  }
  return indices;
}

const NEXT_SLOT_UNLOCK_LEVEL = {
  1: 4,
  2: 5,
  3: 8,
  4: 11,
  5: 14,
};

function _nextLockedSlot(currentSlots, level = 1) {
  // Prochain pot débloqué par le niveau (s'il n'est pas encore atteint)
  const unlockLevel = NEXT_SLOT_UNLOCK_LEVEL[currentSlots];
  if (unlockLevel && level < unlockLevel) {
    return { slotIdx: currentSlots, type: 'level', unlockLevel };
  }
  // Sinon, possibilité d'agrandir le labo via la Boutique
  if (currentSlots < MAX_POT_SLOTS) {
    return { slotIdx: currentSlots, type: 'buy' };
  }
  return null;
}

function _speciesName(speciesId) {
  return _speciesList.find(s => Number(s.id) === Number(speciesId))?.name ?? '—';
}

function _validateSelection(aId, bId) {
  if (!aId || !bId) return { valid: false, message: 'Choisissez deux graines pour lancer une mutation.' };
  if (aId === bId && (_seedQuantities.get(aId) ?? 0) < 2) {
    return { valid: false, message: 'Il faut deux exemplaires pour croiser une espèce avec elle-même.' };
  }
  return { valid: true, message: `✓ ${_speciesName(aId)} × ${_speciesName(bId)}` };
}

// ── Rendu principal ────────────────────────────────────────────────
function renderPotsGrid() {
  const container = document.getElementById('pots-grid');
  if (!container) return;

  const slots = _playerData.pot_slots ?? 1;
  container.innerHTML = '';

  for (let i = 0; i < slots; i++) {
    container.appendChild(_buildPotCard(i, _activePots[i] ?? null));
  }

  const next = _nextLockedSlot(slots, _playerData.level ?? 1);
  if (next) container.appendChild(_buildLockedSlotCard(next));
}

function _buildPotCard(slotIdx, pot) {
  const card = document.createElement('div');
  card.className = `pot-card multi-pot-card ${pot ? 'pot-active' : 'pot-empty'}`;
  card.dataset.slotIdx = slotIdx;
  if (pot) card.dataset.potId = pot.id;

  if (!pot) {
    _renderEmptySlot(card, slotIdx);
  } else {
    card.innerHTML = _renderActiveSlot(pot, slotIdx);
    _bindHarvestBtn(card, pot);
    _startTimer(pot);
  }

  return card;
}

function _buildLockedSlotCard(next) {
  const card = document.createElement('div');
  card.className = 'pot-card multi-pot-card pot-locked';
  const label = next.type === 'level'
    ? `Débloqué au niveau ${next.unlockLevel}`
    : `Agrandis ton labo<br><span class="pot-locked-hint">→ Boutique 🏪</span>`;
  card.innerHTML = `
    <div class="pot-slot-header">
      <span class="pot-slot-label">🔒 Pot ${next.slotIdx + 1}</span>
    </div>
    <div class="pot-locked-body">
      <div class="pot-locked-icon">${next.type === 'level' ? '🪨' : '🧪'}</div>
      <div class="pot-locked-label">${label}</div>
    </div>
  `;
  return card;
}

// ── Slot vide : picker cards ─────────────────────────────────────────────
function _renderEmptySlot(card, slotIdx) {
  const sel     = _slotSelections[slotIdx] ?? { a: null, b: null };
  const spA     = sel.a ? _speciesList.find(s => Number(s.id) === sel.a) : null;
  const spB     = sel.b ? _speciesList.find(s => Number(s.id) === sel.b) : null;
  const valid   = _validateSelection(sel.a, sel.b);
  const hasAny  = (_seedQuantities.size > 0);

  card.innerHTML = `
    <div class="pot-slot-header">
      <span class="pot-slot-label">🪨 Pot ${slotIdx + 1}</span>
      <span class="pot-slot-state">Libre</span>
    </div>

    <div class="pot-parents-picker">
      <div class="pot-parent-wrap">
        <button class="pot-parent-slot ${spA ? 'has-seed' : 'empty-seed'} rarity-seed-${spA?.rarity ?? ''}" data-slot="a" aria-label="Choisir Mère A">
          ${spA
            ? `<div class="pot-parent-sprite">${createPlantCharacterSvg(spA)}</div>
               <div class="pot-parent-name">${spA.name}</div>
               <div class="pot-parent-qty">×${_seedQuantities.get(sel.a) ?? 0}</div>`
            : `<div class="pot-parent-empty-icon">＋</div>
               <div class="pot-parent-empty-label">Mère A</div>`
          }
        </button>
        ${spA ? `<button class="pot-parent-clear" data-clear="a" aria-label="Retirer Mère A" title="Retirer">×</button>` : ''}
      </div>

      <div class="pot-cross-big">${spA && spB ? '×' : '···'}</div>

      <div class="pot-parent-wrap">
        <button class="pot-parent-slot ${spB ? 'has-seed' : 'empty-seed'} rarity-seed-${spB?.rarity ?? ''}" data-slot="b" aria-label="Choisir Mère B">
          ${spB
            ? `<div class="pot-parent-sprite">${createPlantCharacterSvg(spB)}</div>
               <div class="pot-parent-name">${spB.name}</div>
               <div class="pot-parent-qty">×${_seedQuantities.get(sel.b) ?? 0}</div>`
            : `<div class="pot-parent-empty-icon">＋</div>
               <div class="pot-parent-empty-label">Mère B</div>`
          }
        </button>
        ${spB ? `<button class="pot-parent-clear" data-clear="b" aria-label="Retirer Mère B" title="Retirer">×</button>` : ''}
      </div>
    </div>

    <div class="pot-status-msg ${valid.valid ? 'pot-status-valid' : ''}">${valid.message}</div>

    <div class="pot-actions">
      ${hasAny
        ? `<button class="pot-start-btn" ${valid.valid ? '' : 'disabled'}>🌱 Lancer la mutation</button>`
        : `<div class="pot-growing-hint">Achetez des graines pour commencer</div>`
      }
    </div>
    ${(spA || spB) ? _renderInfoPanel(spA, spB) : ''}
  `;

  // ── Listeners ───────────────────────────────────────────────────────
  // Boutons picker (ouvre seedPicker)
  card.querySelectorAll('.pot-parent-slot').forEach(btn => {
    btn.addEventListener('click', () => {
      const slotKey = btn.dataset.slot; // 'a' ou 'b'
      openSeedPicker({
        speciesList:    _speciesList,
        seedQuantities: _seedQuantities,
        label:          slotKey === 'a' ? 'Mère A' : 'Mère B',
        currentId:      sel[slotKey] ?? null,
        excludeId:      slotKey === 'b' ? (sel.a ?? null) : null,
        sameSpeciesId:  slotKey === 'b' ? (sel.a ?? null) : null,
        onSelect: (speciesId) => {
          _slotSelections[slotIdx] = {
            ...(_slotSelections[slotIdx] ?? { a: null, b: null }),
            [slotKey]: Number(speciesId),
          };
          renderPotsGrid();
        },
        onClear: () => {
          const current = _slotSelections[slotIdx] ?? { a: null, b: null };
          _slotSelections[slotIdx] = { ...current, [slotKey]: null };
          renderPotsGrid();
        },
      });
    });
  });

  // Boutons × clear
  card.querySelectorAll('.pot-parent-clear').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const slotKey = btn.dataset.clear; // 'a' ou 'b'
      const current = _slotSelections[slotIdx] ?? { a: null, b: null };
      _slotSelections[slotIdx] = { ...current, [slotKey]: null };
      renderPotsGrid();
    });
  });

  // Bouton lancer
  const startBtn = card.querySelector('.pot-start-btn');
  if (startBtn && valid.valid) {
    startBtn.addEventListener('click', () => _launchMutation(slotIdx, sel.a, sel.b));
  }
}

// ── Slot actif ───────────────────────────────────────────────────────────
function _renderActiveSlot(pot, slotIdx) {
  const spA = _speciesList.find(s => Number(s.id) === Number(pot.species_a_id));
  const spB = _speciesList.find(s => Number(s.id) === Number(pot.species_b_id));
  const nameA = spA?.name ?? `#${pot.species_a_id}`;
  const nameB = spB?.name ?? `#${pot.species_b_id}`;

  const readyAt = new Date(pot.ready_at).getTime();
  const now     = Date.now();
  const isReady = now >= readyAt;

  return `
    <div class="pot-slot-header">
      <span class="pot-slot-label">🌿 Pot ${slotIdx + 1}</span>
      <span class="pot-slot-state">${isReady ? 'Prêt !' : 'En cours'}</span>
    </div>
    <div class="pot-parents">
      <span class="pot-parent">${nameA}</span>
      <span class="pot-cross">×</span>
      <span class="pot-parent">${nameB}</span>
    </div>
    <div class="pot-visual-mini ${isReady ? 'pot-glow' : ''}">
      <span class="pot-emoji-mini">${isReady ? '🌺' : '🌱'}</span>
      <span class="pot-stage-label">${isReady ? 'Mutation prête' : 'Pousse en cours…'}</span>
    </div>
    <div class="pot-progress-wrap">
      <div class="pot-progress-bar" id="pot-progress-${pot.id}" style="width:${_computeProgress(pot)}%"></div>
    </div>
    <div class="pot-timer ${isReady ? 'pot-timer-ready' : ''}" id="pot-timer-${pot.id}">
      ${isReady ? '✓ Prêt à récolter' : _formatCountdown(readyAt - now)}
    </div>
    ${isReady ? `<button class="pot-harvest-btn" data-pot-id="${pot.id}">🌸 Récolter</button>` : ''}
    ${_renderInfoPanel(spA, spB)}
  `;
}

// ── Panneau d'infos détaillé (probas qualité, quantité, graines) ─────────────
const RARITY_FR = { common: 'commune', rare: 'rare', epic: 'épique', legendary: 'légendaire', mythic: 'mythique' };

function _estimatedResultTier(spA, spB) {
  const tiers = [spA?.tier, spB?.tier].map(Number).filter(Number.isFinite);
  if (!tiers.length) return 1;
  return Math.min(5, Math.max(...tiers));
}

function _renderInfoPanel(spA, spB) {
  const odds        = qualityOdds(_gardenBonuses);
  const estTier     = _estimatedResultTier(spA, spB);
  const activeGarden = Object.entries(_gardenBonuses).filter(([, v]) => v > 0).length;

  const oddsRows = odds.map(({ tier, probability }) => {
    const pct = Math.round(probability * 100);
    const range = harvestQuantityRange(tier.id, _gardenBonuses, estTier);
    const qtyTxt = range.min === range.max ? `${range.min}` : `${range.min}–${range.max}`;
    const varPct = Math.round(varietyDropChance(tier.id, _gardenBonuses) * 100);
    return `
      <div class="pot-odds-row">
        <span class="pot-odds-name" style="color:${tier.color}">${tier.label}</span>
        <span class="pot-odds-bar"><span style="width:${pct}%;background:${tier.color}"></span></span>
        <span class="pot-odds-pct">${pct}%</span>
        <span class="pot-odds-extra">🌸${qtyTxt} · 🧬${varPct}%</span>
      </div>`;
  }).join('');

  const parentLine = (sp, slot) => sp
    ? `<li><strong>${slot}</strong> ${sp.name} <span class="rarity-badge ${sp.rarity}">${RARITY_FR[sp.rarity] ?? sp.rarity}</span> · Tier ${sp.tier}</li>`
    : `<li><strong>${slot}</strong> —</li>`;

  return `
    <details class="pot-info">
      <summary>ℹ️ Détails de la pousse</summary>
      <div class="pot-info-body">
        <ul class="pot-info-parents">
          ${parentLine(spA, 'Mère A')}
          ${parentLine(spB, 'Mère B')}
        </ul>
        <div class="pot-info-subtitle">Probabilités de qualité ${activeGarden ? '(avec bonus jardin)' : ''}</div>
        <div class="pot-odds-list">${oddsRows}</div>
        <div class="pot-info-note">
          🌱 Chaque mère a 70% de chance de redonner ses graines.<br>
          🧬 = chance de récolter des graines de la variété obtenue (croît avec la qualité).
        </div>
      </div>
    </details>`;
}

function _computeProgress(pot) {
  const start  = new Date(pot.started_at ?? pot.created_at).getTime();
  const end    = new Date(pot.ready_at).getTime();
  const now    = Date.now();
  const pct    = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
  return Math.round(pct);
}

function _formatCountdown(ms) {
  if (ms <= 0) return '✓ Prêt';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

// ── Timer (countdown + progress) ────────────────────────────────────────
function _startTimer(pot) {
  if (!pot) return;
  if (_potTimers[pot.id]) return; // déjà actif

  const readyAt = new Date(pot.ready_at).getTime();

  const tick = () => {
    const now  = Date.now();
    const diff = readyAt - now;

    const timerEl    = document.getElementById(`pot-timer-${pot.id}`);
    const progressEl = document.getElementById(`pot-progress-${pot.id}`);

    if (!timerEl) { clearInterval(_potTimers[pot.id]); delete _potTimers[pot.id]; return; }

    if (diff <= 0) {
      timerEl.textContent = '✓ Prêt à récolter';
      timerEl.classList.add('pot-timer-ready');
      if (progressEl) progressEl.style.width = '100%';
      clearInterval(_potTimers[pot.id]);
      delete _potTimers[pot.id];
      // Rafraîchir la carte pour afficher le bouton Récolter
      renderPotsGrid();
      _updateLabBadge();
      return;
    }

    timerEl.textContent = _formatCountdown(diff);
    if (progressEl) progressEl.style.width = `${_computeProgress(pot)}%`;
  };

  tick();
  _potTimers[pot.id] = setInterval(tick, 1000);
}

// ── Listeners harvest ────────────────────────────────────────────────────
function _bindHarvestBtn(card, pot) {
  const btn = card.querySelector('.pot-harvest-btn');
  if (!btn) return;
  btn.addEventListener('click', () => _doHarvest(pot));
}

async function _doHarvest(pot) {
  try {
    const userId = _playerData.user_id ?? _playerData.userId;
    const result = await harvestMutation(pot.id, userId);
    if (!result) return;
    if (result.error) {
      console.warn('[pots] harvest failed:', result.error);
      return;
    }

    // Retire le pot de la liste locale
    const idx = _activePots.findIndex(p => p?.id === pot.id);
    if (idx !== -1) _activePots[idx] = null;
    _slotSelections[idx] = { a: null, b: null };

    const xpGained = computeHarvestXp(result.result_species?.rarity ?? 'common', result.quality_tier_id ?? 1);
    const xpResult = await addXpToPlayer(userId, xpGained, _playerData);
    _playerData = {
      ..._playerData,
      xp: xpResult.newXp,
      level: xpResult.newLevel,
      coins: xpResult.newCoins,
      pot_slots: xpResult.newPotSlots ?? _playerData.pot_slots,
    };

    renderPotsGrid();
    _updateLabBadge();
    if (_onHarvest) await _onHarvest(result, xpResult);
    if (_onSeedsChanged) _onSeedsChanged();
  } catch (err) {
    console.error('[pots] harvest error', err);
  }
}

// ── Lancement mutation ───────────────────────────────────────────────────
async function _launchMutation(slotIdx, speciesAId, speciesBId) {
  try {
    const userId = _playerData.user_id ?? _playerData.userId;
    const result = await startMutationPot(userId, speciesAId, speciesBId, _playerData.level ?? 1, _playerData.pot_slots ?? 1);
    if (!result) return;
    if (result.error) {
      console.warn('[pots] launch failed:', result.error);
      return;
    }

    const pot = result.pot ?? result;
    if (!pot?.id) {
      console.warn('[pots] launch returned no pot:', result);
      return;
    }

    _activePots[slotIdx] = pot;
    _slotSelections[slotIdx] = { a: null, b: null };

    recordMutationLaunched(1);
    recordQuestEvent('launch', 1);

    schedulePotNotification(pot.ready_at);
    renderPotsGrid();
    _startTimer(pot);
    _updateLabBadge();
    if (_onSeedsChanged) _onSeedsChanged();
  } catch (err) {
    console.error('[pots] launch error', err);
  }
}
