// lib/pots.js — Rendu UI de la grille multi-pots
import { startMutationPot, harvestMutation, loadActivePots } from './mutation.js';
import { schedulePotNotification } from './notifications.js';
import { computeHarvestXp, addXpToPlayer } from './xp.js';

let _speciesList    = [];
let _playerData     = { coins: 0, level: 1, xp: 0, pot_slots: 1 };
let _onHarvest      = null; // callback(result, xpResult) déclenché après harvest
let _onSeedsChanged = null;
let _gardenBonuses  = {};
let _seedQuantities = new Map();
let _potTimers      = {};   // potId → intervalId
let _activePots     = [];   // cache local

// ── Init ────────────────────────────────────────────────────────────────────
export async function initPots(speciesList, playerData, onHarvestCb, gardenBonuses = {}, onSeedsChangedCb = null) {
  _speciesList    = speciesList;
  _playerData     = playerData;
  _onHarvest      = onHarvestCb;
  _gardenBonuses  = gardenBonuses ?? {};
  _onSeedsChanged = onSeedsChangedCb;

  _activePots = await loadActivePots(playerData.user_id ?? playerData.userId);
  renderPotsGrid();

  // Restaure les timers pour les pots en cours
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
      .filter(([speciesId, quantity]) => Number.isFinite(speciesId) && speciesId > 0 && quantity > 0)
  );
  renderPotsGrid();
}

export function selectSpeciesForNextPot(speciesId) {
  const id = String(speciesId);
  const numericId = Number(speciesId);
  const emptyCards = [...document.querySelectorAll('.multi-pot-card.pot-empty')];

  for (const card of emptyCards) {
    const selectA = card.querySelector('.pot-select-a');
    const selectB = card.querySelector('.pot-select-b');
    const targets = [selectA, selectB].filter(Boolean);

    for (const target of targets) {
      if (target.value) continue;
      if (![...target.options].some(option => option.value === id)) continue;

      const otherSelect = target === selectA ? selectB : selectA;
      const sameSpeciesAlreadySelected = Number(otherSelect?.value) === numericId;
      const hasEnoughForSelfCross = (_seedQuantities.get(numericId) ?? 0) >= 2;

      if (sameSpeciesAlreadySelected && !hasEnoughForSelfCross) continue;

      target.value = id;
      target.dispatchEvent(new Event('change', { bubbles: true }));
      card.classList.add('pot-placement-focus');
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => card.classList.remove('pot-placement-focus'), 900);
      return true;
    }
  }

  return false;
}

const SLOT_UNLOCK_LEVELS = [null, null, null, 4, 5, null, null, 8]; // index = slot index (0-based)

function _nextLockedSlot(currentSlots) {
  // Renvoie { slotIdx, unlockLevel } pour le prochain slot non débloqué, ou null si tous débloqués
  for (let i = currentSlots; i < SLOT_UNLOCK_LEVELS.length; i++) {
    if (SLOT_UNLOCK_LEVELS[i] != null) return { slotIdx: i, unlockLevel: SLOT_UNLOCK_LEVELS[i] };
  }
  return null;
}

function _speciesName(speciesId) {
  const species = _speciesList.find(s => Number(s.id) === Number(speciesId));
  return species?.name ?? '—';
}

function _validateSelection(aId, bId) {
  if (!aId || !bId) return { valid: false, message: 'Sélectionnez deux graines pour lancer une mutation.' };
  if (aId === bId && (_seedQuantities.get(aId) ?? 0) < 2) {
    return { valid: false, message: 'Il faut deux exemplaires pour croiser une espèce avec elle-même.' };
  }
  return { valid: true, message: `Croisement prêt : ${_speciesName(aId)} × ${_speciesName(bId)}` };
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

  // Affiche le prochain slot verrouillé
  const next = _nextLockedSlot(slots);
  if (next) container.appendChild(_buildLockedSlotCard(next.slotIdx, next.unlockLevel));
}

function _buildPotCard(slotIdx, pot) {
  const card = document.createElement('div');
  card.className = `pot-card multi-pot-card ${pot ? 'pot-active' : 'pot-empty'}`;
  card.dataset.slotIdx = slotIdx;
  if (pot) card.dataset.potId = pot.id;

  if (!pot) {
    // Slot libre : formulaire de lancement
    card.innerHTML = _renderEmptySlot(slotIdx);
    _bindEmptySlotControls(card);
    _bindStartBtn(card);
  } else {
    // Slot occupé : timer + progression
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

// ── Slot vide : formulaire ───────────────────────────────────────────────
function _getUnlockedOptions() {
  // On affiche toutes les espèces pour lesquelles le joueur a des graines.
  // Pas de filtre codex : un joueur peut utiliser une graine qu'il possède
  // même s'il ne l'a pas encore récoltée (cas onboarding et colis mystère).
  return _speciesList
    .filter(s => (_seedQuantities.get(Number(s.id)) ?? 0) > 0)
    .map(s =>
      `<option value="${s.id}">${s.name} x${_seedQuantities.get(Number(s.id))} — T${s.tier} (${s.rarity})</option>`
    ).join('');
}

function _renderEmptySlot(idx) {
  const opts = _getUnlockedOptions();
  const placeholder = '<option value="" selected>— Choisir une graine —</option>';
  const hasSeeds = !!opts;
  return `
    <div class="pot-slot-header">
      <span class="pot-slot-label">🪨 Pot ${idx + 1}</span>
      <span class="pot-slot-state">Libre</span>
    </div>
    <div class="pot-placement-helper">
      Clique sur <strong>Placer</strong> dans l'inventaire ou choisis manuellement deux parents.
    </div>
    <div class="pot-selection-preview" aria-live="polite">
      <span class="pot-parent-preview pot-parent-a">A : —</span>
      <span class="pot-cross">×</span>
      <span class="pot-parent-preview pot-parent-b">B : —</span>
    </div>
    <label class="pot-select-label">Mère A
      <select class="pot-select-a">${placeholder}${opts}</select>
    </label>
    <label class="pot-select-label">Mère B
      <select class="pot-select-b">${placeholder}${opts}</select>
    </label>
    <button class="pot-start-btn" disabled>${hasSeeds ? 'Lancer la mutation' : 'Aucune graine'}</button>
    <div class="pot-status-msg">${hasSeeds ? 'En attente de deux graines.' : 'Aucune graine disponible.'}</div>
  `;
}

function _bindEmptySlotControls(card) {
  const selectA = card.querySelector('.pot-select-a');
  const selectB = card.querySelector('.pot-select-b');
  const btn = card.querySelector('.pot-start-btn');
  const statusEl = card.querySelector('.pot-status-msg');
  const previewA = card.querySelector('.pot-parent-a');
  const previewB = card.querySelector('.pot-parent-b');

  const update = () => {
    const aId = Number(selectA?.value);
    const bId = Number(selectB?.value);
    const validation = _validateSelection(aId, bId);

    if (previewA) previewA.textContent = `A : ${aId ? _speciesName(aId) : '—'}`;
    if (previewB) previewB.textContent = `B : ${bId ? _speciesName(bId) : '—'}`;
    if (statusEl) statusEl.textContent = validation.message;
    if (btn) btn.disabled = !validation.valid;
    card.classList.toggle('pot-ready-to-start', validation.valid);
  };

  selectA?.addEventListener('change', update);
  selectB?.addEventListener('change', update);
  update();
}

function _bindStartBtn(card) {
  const btn      = card.querySelector('.pot-start-btn');
  const statusEl = card.querySelector('.pot-status-msg');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const aId = Number(card.querySelector('.pot-select-a')?.value);
    const bId = Number(card.querySelector('.pot-select-b')?.value);
    const validation = _validateSelection(aId, bId);
    if (!validation.valid) { statusEl.textContent = `⚠️ ${validation.message}`; return; }

    btn.disabled = true;
    statusEl.textContent = '⏳ Lancement...';

    const uid    = _playerData.user_id ?? _playerData.userId;
    const result = await startMutationPot(uid, aId, bId, _playerData.level ?? 1);

    if (result.error) {
      statusEl.textContent = `❌ ${result.error}`;
      btn.disabled = false;
      return;
    }

    // Ajoute au cache + re-render
    _activePots.push(result.pot);
    schedulePotNotification(result.pot.ready_at);

    if (_onSeedsChanged) await _onSeedsChanged();
    renderPotsGrid();
  });
}

// ── Slot actif : timer & stade ───────────────────────────────────────────
function _renderActiveSlot(pot, idx) {
  const now   = Date.now();
  const start = new Date(pot.started_at).getTime();
  const end   = new Date(pot.ready_at).getTime();
  const pct   = Math.min(((now - start) / (end - start)) * 100, 100);
  const stage = pct >= 100 ? 4 : pct >= 75 ? 3 : pct >= 50 ? 2 : pct >= 25 ? 1 : 0;
  const ready = pct >= 100;

  const emojis = ['🪨','🌱','🌿','🌳','🌺'];
  const labels = ['Sol préparé','Germination','Pousse','Croissance','Floraison'];

  const remainMs  = Math.max(end - now, 0);
  const h         = Math.floor(remainMs / 3600000);
  const m         = Math.floor((remainMs % 3600000) / 60000);
  const timeLabel = ready ? '✅ Prêt !' : `${h}h ${m}m`;

  // Récupère les noms des espèces
  const spA = _speciesList.find(s => s.id === pot.species_a_id);
  const spB = _speciesList.find(s => s.id === pot.species_b_id);

  return `
    <div class="pot-slot-header">
      <span class="pot-slot-label">🪨 Pot ${idx + 1}</span>
      <span class="pot-timer ${ready ? 'pot-timer-ready' : ''}" data-pot-id="${pot.id}">${timeLabel}</span>
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
    ${ready
      ? `<button class="pot-harvest-btn" data-pot-id="${pot.id}">🌺 Récolter</button>`
      : `<div class="pot-growing-hint">Reviens dans ${timeLabel}</div>`
    }
    <div class="pot-status-msg"></div>
  `;
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

    // XP
    const xpGained = computeHarvestXp(
      result.result_species?.rarity ?? 'common',
      result.quality_tier_id ?? 1
    );
    const xpResult = await addXpToPlayer(uid, xpGained, _playerData);

    // Retire le pot du cache
    _activePots = _activePots.filter(p => p.id !== pot.id);
    clearInterval(_potTimers[pot.id]);
    delete _potTimers[pot.id];

    // Callback parent
    if (_onHarvest) _onHarvest(result, xpResult);

    renderPotsGrid();
  });
}

// ── Timer de progression en temps réel ─────────────────────────────────
function _startTimer(pot) {
  if (_potTimers[pot.id]) return; // déjà actif

  _potTimers[pot.id] = setInterval(() => {
    const now  = Date.now();
    const end  = new Date(pot.ready_at).getTime();
    const done = now >= end;

    // Mise à jour du timer affiché
    const timerEl = document.querySelector(`.pot-timer[data-pot-id="${pot.id}"]`);
    if (timerEl) {
      if (done) {
        timerEl.textContent = '✅ Prêt !';
        timerEl.classList.add('pot-timer-ready');
        clearInterval(_potTimers[pot.id]);
        delete _potTimers[pot.id];
        // Affiche le bouton récolte sans re-render complet
        const card      = timerEl.closest('.multi-pot-card');
        const hintEl    = card?.querySelector('.pot-growing-hint');
        if (hintEl) hintEl.outerHTML = `<button class="pot-harvest-btn" data-pot-id="${pot.id}">🌺 Récolter</button>`;
        const newBtn = card?.querySelector('.pot-harvest-btn');
        if (newBtn) _bindHarvestBtn(card, pot);
        // Met à jour le glow
        const visual = card?.querySelector('.pot-visual-mini');
        if (visual) visual.classList.add('pot-glow');
      } else {
        const rem = Math.max(end - now, 0);
        const h   = Math.floor(rem / 3600000);
        const m   = Math.floor((rem % 3600000) / 60000);
        timerEl.textContent = `${h}h ${m}m`;

        // Mise à jour barre de progression
        const start   = new Date(pot.started_at).getTime();
        const pct     = Math.min(((now - start) / (end - start)) * 100, 100);
        const card    = timerEl.closest('.multi-pot-card');
        const barEl   = card?.querySelector('.pot-progress-bar');
        if (barEl) barEl.style.width = `${pct.toFixed(1)}%`;

        // Mise à jour emoji/stade
        const stage   = pct >= 75 ? 3 : pct >= 50 ? 2 : pct >= 25 ? 1 : 0;
        const emojis  = ['🪨','🌱','🌿','🌳'];
        const labels  = ['Sol préparé','Germination','Pousse','Croissance'];
        const visual  = card?.querySelector('.pot-visual-mini');
        const emojiEl = card?.querySelector('.pot-emoji-mini');
        const lblEl   = card?.querySelector('.pot-stage-label');
        if (visual)  visual.className  = `pot-visual-mini stage-${stage}`;
        if (emojiEl) emojiEl.textContent = emojis[stage];
        if (lblEl)   lblEl.textContent   = labels[stage];
      }
    }
  }, 10000); // refresh toutes les 10s
}