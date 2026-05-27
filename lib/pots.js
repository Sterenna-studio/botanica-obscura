// lib/pots.js — Rendu UI de la grille multi-pots
import { startMutationPot, harvestMutation, loadActivePots } from './mutation.js';
import { schedulePotNotification } from './notifications.js';
import { computeHarvestXp, addXpToPlayer } from './xp.js';
import { openSeedPicker } from './seedPicker.js';
import { createPlantCharacterSvg } from './plantSvg.js';

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

const SLOT_UNLOCK_LEVELS = [null, null, null, 4, 5, null, null, 8];

function _nextLockedSlot(currentSlots) {
  for (let i = currentSlots; i < SLOT_UNLOCK_LEVELS.length; i++) {
    if (SLOT_UNLOCK_LEVELS[i] != null) return { slotIdx: i, unlockLevel: SLOT_UNLOCK_LEVELS[i] };
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

// ── Rendu principal ────────────────────────────────────────────────────
function renderPotsGrid() {
  const container = document.getElementById('pots-grid');
  if (!container) return;

  const slots = _playerData.pot_slots ?? 1;
  container.innerHTML = '';

  for (let i = 0; i < slots; i++) {
    container.appendChild(_buildPotCard(i, _activePots[i] ?? null));
  }

  const next = _nextLockedSlot(slots);
  if (next) container.appendChild(_buildLockedSlotCard(next.slotIdx, next.unlockLevel));
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

function _buildLockedSlotCard(slotIdx, unlockLevel) {
  const card = document.createElement('div');
  card.className = 'pot-card multi-pot-card pot-locked';
  card.innerHTML = `
    <div class="pot-slot-header">
      <span class="pot-slot-label">🔒 Pot ${slotIdx + 1}</span>
    </div>
    <div class="pot-locked-body">
      <div class="pot-locked-icon">🪨</div>
      <div class="pot-locked-label">Débloqué au niveau ${unlockLevel}</div>
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
      <button class="pot-parent-slot ${spA ? 'has-seed' : 'empty-seed'} rarity-seed-${spA?.rarity ?? ''}" data-slot="a" aria-label="Choisir Mère A">
        ${spA
          ? `<div class="pot-parent-sprite">${createPlantCharacterSvg(spA)}</div>
             <div class="pot-parent-name">${spA.name}</div>
             <div class="pot-parent-qty">×${_seedQuantities.get(sel.a) ?? 0}</div>`
          : `<div class="pot-parent-empty-icon">＋</div>
             <div class="pot-parent-empty-label">Mère A</div>`
        }
      </button>

      <div class="pot-cross-big">${spA && spB ? '×' : '···'}</div>

      <button class="pot-parent-slot ${spB ? 'has-seed' : 'empty-seed'} rarity-seed-${spB?.rarity ?? ''}" data-slot="b" aria-label="Choisir Mère B">
        ${spB
          ? `<div class="pot-parent-sprite">${createPlantCharacterSvg(spB)}</div>
             <div class="pot-parent-name">${spB.name}</div>
             <div class="pot-parent-qty">×${_seedQuantities.get(sel.b) ?? 0}</div>`
          : `<div class="pot-parent-empty-icon">＋</div>
             <div class="pot-parent-empty-label">Mère B</div>`
        }
      </button>
    </div>

    <button class="pot-start-btn" ${valid.valid ? '' : 'disabled'}>
      ${hasAny ? (valid.valid ? '🧪 Lancer la mutation' : 'Choisir deux graines') : 'Aucune graine'}
    </button>
    <div class="pot-status-msg">${valid.valid ? valid.message : ''}</div>
  `;

  // Ouvre le picker au clic sur un slot parent
  card.querySelectorAll('.pot-parent-slot').forEach(btn => {
    btn.addEventListener('click', () => {
      const which   = btn.dataset.slot; // 'a' | 'b'
      const otherId = which === 'a' ? sel.b : sel.a;
      const label   = which === 'a' ? 'Mère A' : 'Mère B';
      const curId   = which === 'a' ? sel.a   : sel.b;

      openSeedPicker(
        _seedQuantities,
        _speciesList,
        label,
        curId,
        (chosenId) => {
          _slotSelections[slotIdx] = which === 'a'
            ? { a: chosenId, b: sel.b }
            : { a: sel.a,   b: chosenId };
          renderPotsGrid();
        },
        () => {
          _slotSelections[slotIdx] = which === 'a'
            ? { a: null, b: sel.b }
            : { a: sel.a, b: null };
          renderPotsGrid();
        }
      );
    });
  });

  // Bouton Lancer
  card.querySelector('.pot-start-btn')?.addEventListener('click', async () => {
    if (!valid.valid) return;
    const btn      = card.querySelector('.pot-start-btn');
    const statusEl = card.querySelector('.pot-status-msg');
    btn.disabled = true;
    if (statusEl) statusEl.textContent = '⏳ Lancement...';

    const uid    = _playerData.user_id ?? _playerData.userId;
    const result = await startMutationPot(uid, sel.a, sel.b, _playerData.level ?? 1);

    if (result.error) {
      if (statusEl) statusEl.textContent = `❌ ${result.error}`;
      btn.disabled = false;
      return;
    }

    _activePots.push(result.pot);
    delete _slotSelections[slotIdx];
    schedulePotNotification(result.pot.ready_at);
    if (_onSeedsChanged) await _onSeedsChanged();
    renderPotsGrid();
  });
}

// ── Slot actif ───────────────────────────────────────────────────────────
function _renderActiveSlot(pot, idx) {
  const now   = Date.now();
  const start = new Date(pot.started_at).getTime();
  const end   = new Date(pot.ready_at).getTime();
  const pct   = Math.min(((now - start) / (end - start)) * 100, 100);
  const stage = pct >= 100 ? 4 : pct >= 75 ? 3 : pct >= 50 ? 2 : pct >= 25 ? 1 : 0;
  const ready = pct >= 100;

  const emojis = ['🪨','🌱','🌿','🌳','🌺'];
  const labels = ['Sol préparé','Germination','Pousse','Croissance','Floraison'];

  const spA = _speciesList.find(s => s.id === pot.species_a_id);
  const spB = _speciesList.find(s => s.id === pot.species_b_id);

  return `
    <div class="pot-slot-header">
      <span class="pot-slot-label">🪨 Pot ${idx + 1}</span>
      <span class="pot-timer ${ready ? 'pot-timer-ready' : ''}" data-pot-id="${pot.id}">${ready ? '✅ Prêt !' : _formatTimer(end - now)}</span>
    </div>
    <div class="pot-parents">
      <span class="pot-parent">${spA?.name ?? 'A'}</span>
      <span class="pot-cross">×</span>
      <span class="pot-parent">${spB?.name ?? 'B'}</span>
    </div>
    <div class="pot-visual-mini stage-${stage} ${ready ? 'pot-glow' : ''}">
      <span class="pot-emoji-mini">${emojis[stage]}</span>
      <span class="pot-stage-label">${labels[stage]}</span>
    </div>
    <div class="pot-progress-wrap">
      <div class="pot-progress-bar" style="width:${pct.toFixed(1)}%"></div>
    </div>
    ${
      ready
        ? `<button class="pot-harvest-btn" data-pot-id="${pot.id}">🌺 Récolter</button>`
        : `<div class="pot-growing-hint">Reviens dans ${_formatTimer(end - now)}</div>`
    }
    <div class="pot-status-msg"></div>
  `;
}

// ── Timer helpers ────────────────────────────────────────────────────────
function _formatTimer(remainMs) {
  const ms = Math.max(remainMs, 0);
  if (ms < 60_000) {
    return `${Math.ceil(ms / 1000)}s`;
  }
  if (ms < 3_600_000) {
    const m = Math.floor(ms / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    return `${m}m ${s}s`;
  }
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

function _bindHarvestBtn(card, pot) {
  const btn = card.querySelector('.pot-harvest-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const statusEl = card.querySelector('.pot-status-msg');
    if (statusEl) statusEl.textContent = '🎲 Résolution...';

    const uid    = _playerData.user_id ?? _playerData.userId;
    const result = await harvestMutation(pot.id, uid, _gardenBonuses);

    if (result.error) {
      if (statusEl) statusEl.textContent = `❌ ${result.error}`;
      btn.disabled = false;
      return;
    }

    const xpGained = computeHarvestXp(
      result.result_species?.rarity ?? 'common',
      result.quality_tier_id ?? 1
    );
    const xpResult = await addXpToPlayer(uid, xpGained, _playerData);

    _activePots = _activePots.filter(p => p.id !== pot.id);
    clearInterval(_potTimers[pot.id]);
    delete _potTimers[pot.id];

    if (_onHarvest) _onHarvest(result, xpResult);
    renderPotsGrid();
  });
}

// ── Timer temps réel ─────────────────────────────────────────────────────
function _startTimer(pot) {
  if (_potTimers[pot.id]) return;

  _potTimers[pot.id] = setInterval(() => {
    const now  = Date.now();
    const end  = new Date(pot.ready_at).getTime();
    const done = now >= end;

    const timerEl = document.querySelector(`.pot-timer[data-pot-id="${pot.id}"]`);
    if (!timerEl) return;

    if (done) {
      timerEl.textContent = '✅ Prêt !';
      timerEl.classList.add('pot-timer-ready');
      clearInterval(_potTimers[pot.id]);
      delete _potTimers[pot.id];

      const card   = timerEl.closest('.multi-pot-card');
      const hintEl = card?.querySelector('.pot-growing-hint');
      if (hintEl) hintEl.outerHTML = `<button class="pot-harvest-btn" data-pot-id="${pot.id}">🌺 Récolter</button>`;
      const newBtn = card?.querySelector('.pot-harvest-btn');
      if (newBtn) _bindHarvestBtn(card, pot);
      card?.querySelector('.pot-visual-mini')?.classList.add('pot-glow');
    } else {
      const rem = end - now;
      timerEl.textContent = _formatTimer(rem);

      const start = new Date(pot.started_at).getTime();
      const pct   = Math.min(((now - start) / (end - start)) * 100, 100);
      const card  = timerEl.closest('.multi-pot-card');
      const barEl = card?.querySelector('.pot-progress-bar');
      if (barEl) barEl.style.width = `${pct.toFixed(1)}%`;

      const stage   = pct >= 75 ? 3 : pct >= 50 ? 2 : pct >= 25 ? 1 : 0;
      const emojis  = ['🪨','🌱','🌿','🌳'];
      const labels  = ['Sol préparé','Germination','Pousse','Croissance'];
      const visual  = card?.querySelector('.pot-visual-mini');
      const emojiEl = card?.querySelector('.pot-emoji-mini');
      const lblEl   = card?.querySelector('.pot-stage-label');
      if (visual)  visual.className    = `pot-visual-mini stage-${stage}`;
      if (emojiEl) emojiEl.textContent = emojis[stage];
      if (lblEl)   lblEl.textContent   = labels[stage];
    }
  }, 1000); // refresh chaque seconde (pour afficher les secondes)
}
