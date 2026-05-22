import { supabase, restoreStarSession } from './lib/supabaseClient.js';
import { createPlantCharacterSvg } from './lib/plantSvg.js';
import { getFallbackSpeciesTree } from './lib/speciesTree.js';
import { renderMutationTree } from './lib/mutationTree.js';
import { loadInventory, renderInventory } from './lib/inventory.js';
import { ensureTesters, renderTesters } from './lib/testers.js';
import { restorePotNotification } from './lib/notifications.js';
import { onAuthReady, getBotanicaUserId, isLoggedIn, requireAuth, getProfile } from './lib/auth.js';
import { loadGarden, renderGarden, buyGardenEffect } from './lib/garden.js';
import { loadPlayerData, renderPlayerStats } from './lib/playerData.js';
import { QUALITY_TIERS } from './lib/quality.js';
import { initMysterySeed } from './lib/mysterySeed.js';
import { computeHarvestXp } from './lib/xp.js';
import {
  initPots,
  selectSpeciesForNextPot,
  updatePotsGarden,
  updatePotsInventory,
  updatePotsPlayerData,
  updatePotsSpecies,
} from './lib/pots.js';
import { initOnboarding } from './lib/onboarding.js';
import { adjustLocalSeedQuantity, loadLocal, patchLocal } from './lib/localSave.js';
import { showIntroIfNeeded } from './lib/intro.js';

export { supabase };
export function getUserId() { return getBotanicaUserId(); }

const codexGrid      = document.getElementById('codexGrid');
const plantCharacter = document.getElementById('plantCharacter');
const plantDesc      = document.getElementById('plantDescription');
const notifBtn       = document.getElementById('notifBtn');

let speciesList       = [];
let playerCodexIds    = new Set();
let testers           = [];
let lastHarvestedSp   = null;
let currentGarden     = {};
let currentPlayerData = { coins: 0, level: 1, xp: 0, pot_slots: 1 };

window.__botanicaCodexIds = playerCodexIds;

function showHarvestReveal(species, qualityTier, xpGained, isFirst, onClose) {
  const overlay    = document.getElementById('harvest-reveal-overlay');
  if (!overlay) { onClose?.(); return; }

  const firstBanner  = document.getElementById('harvest-reveal-first');
  const qualityBadge = document.getElementById('harvest-reveal-quality-badge');
  const svgEl        = document.getElementById('harvest-reveal-svg');
  const nameEl       = document.getElementById('harvest-reveal-name');
  const rarityEl     = document.getElementById('harvest-reveal-rarity');
  const xpEl         = document.getElementById('harvest-reveal-xp');
  const closeBtn     = document.getElementById('harvest-reveal-close');

  if (firstBanner)   firstBanner.style.display  = isFirst ? '' : 'none';
  if (qualityBadge)  { qualityBadge.textContent = qualityTier.label; qualityBadge.style.color = qualityTier.color; }
  if (svgEl)         svgEl.innerHTML = createPlantCharacterSvg(species);
  if (nameEl)        nameEl.textContent = species.name ?? '???';
  if (rarityEl)      rarityEl.innerHTML = `<span class="rarity-badge ${species.rarity ?? ''}">${species.rarity ?? '—'}</span>`;
  if (xpEl)          xpEl.textContent = `+${xpGained} XP`;

  overlay.style.display = 'flex';

  if (closeBtn) {
    closeBtn.onclick = () => {
      overlay.style.display = 'none';
      onClose?.();
    };
  }
}

function showLevelUpOverlay(newLevel, reward) {
  const overlay  = document.getElementById('levelup-overlay');
  const levelEl  = document.getElementById('levelup-level');
  const rewardEl = document.getElementById('levelup-reward');
  const closeBtn = document.getElementById('levelup-close');
  if (!overlay) return;
  levelEl.textContent  = `Niveau ${newLevel}`;
  rewardEl.textContent = reward?.label ?? '';
  overlay.style.display = 'flex';
  closeBtn.onclick = () => { overlay.style.display = 'none'; };
}

async function loadSpecies() {
  const { data: globalData, error: globalErr } = await supabase
    .from('botanica_species')
    .select('*')
    .order('tier', { ascending: true })
    .order('id',   { ascending: true });

  const userId = getUserId();
  const { data: codexData, error: codexErr } = await supabase
    .from('botanica_player_codex')
    .select('species_id, was_first_server')
    .eq('user_id', userId);

  if (codexErr) {
    console.warn('[app] Chargement codex cloud échoué, fallback local :', codexErr.message);
    playerCodexIds = new Set(loadLocal()?.codexIds ?? []);
  } else {
    playerCodexIds = new Set((codexData ?? []).map(r => r.species_id));
    patchLocal('codexIds', [...playerCodexIds]);
  }
  window.__botanicaCodexIds = playerCodexIds;

  speciesList = (!globalErr && globalData?.length)
    ? globalData.map(s => ({
        ...s,
        discoverer_name: s.discovered_by_username,
        discoverer_avatar: null,
      }))
    : getFallbackSpeciesTree();

  renderCodex();
  renderMutationTree(speciesList, playerCodexIds, renderPreview);
  renderPreview(speciesList.find(s => playerCodexIds.has(s.id)) ?? speciesList[0]);
  updatePotsSpecies(speciesList);
}

function renderPreview(species) {
  if (!species) return;
  plantCharacter.innerHTML = createPlantCharacterSvg(species);
  plantDesc.textContent    = species.description || 'Aucune description.';
}

function renderCodex() {
  codexGrid.innerHTML = speciesList.map(s => {
    const state = playerCodexIds.has(s.id) ? 'unlocked'
      : s.discovered_by ? 'server-known' : 'unknown';
    if (state === 'unlocked') return `
      <article class="codex-card rarity-${s.rarity} state-unlocked" data-id="${s.id}">
        <div class="codex-sprite">${createPlantCharacterSvg(s)}</div>
        <h3>${s.name}</h3>
        <div class="codex-meta">Tier ${s.tier} • <span class="rarity-badge ${s.rarity}">${s.rarity}</span></div>
        <p>${s.description || ''}</p>
        ${s.was_first_server ? '<div class="first-discovery">🏅 1ère découverte serveur</div>' : ''}
      </article>`;
    if (state === 'server-known') return `
      <article class="codex-card state-server-known" data-id="${s.id}" title="Découverte par ${s.discoverer_name ?? '???'}">
        <div class="codex-sprite codex-silhouette">${createPlantCharacterSvg(s)}</div>
        <h3 class="codex-unknown-name">???</h3>
        <div class="codex-meta">Tier ${s.tier} • <span class="rarity-badge ${s.rarity}">${s.rarity}</span></div>
        <div class="codex-server-badge">
          ${s.discoverer_avatar ? `<img src="${s.discoverer_avatar}" class="codex-discoverer-avatar" alt="" />` : '🌐'}
          <span>Découverte par <strong>${s.discoverer_name ?? '???'}</strong></span>
        </div>
      </article>`;
    return `
      <article class="codex-card state-unknown" data-id="${s.id}">
        <div class="codex-sprite codex-mystery">?</div>
        <h3 class="codex-unknown-name">Espèce inconnue</h3>
        <div class="codex-meta">Tier ${s.tier}</div>
      </article>`;
  }).join('');
  document.querySelectorAll('.codex-card.state-unlocked').forEach(card => {
    card.addEventListener('click', () =>
      renderPreview(speciesList.find(s => String(s.id) === card.dataset.id))
    );
  });
}

async function refreshInventory() {
  const seeds = await loadInventory(getUserId());
  updatePotsInventory(seeds);
  renderInventory(
    seeds,
    (speciesId) => {
      const selected = selectSpeciesForNextPot(speciesId);
      if (!selected) {
        console.warn('[app] Impossible de sélectionner cette graine dans un pot libre.');
      }
      return selected;
    },
    (newCoins) => {
      currentPlayerData.coins = newCoins;
      renderPlayerStats(currentPlayerData);
      renderGarden(currentGarden, newCoins, onBuyGardenEffect);
    },
    getUserId()
  );
}

async function refreshTesters() {
  testers = await ensureTesters(getUserId());
  renderTesters(testers, lastHarvestedSp);
}

async function refreshGarden() {
  currentGarden = await loadGarden(getUserId());
  updatePotsGarden(currentGarden);
  renderGarden(currentGarden, currentPlayerData.coins, onBuyGardenEffect);
}

function showToast(msg, type = 'error') {
  let tc = document.getElementById('toast-container');
  if (!tc) { tc = document.createElement('div'); tc.id = 'toast-container'; document.body.appendChild(tc); }
  const t = document.createElement('div');
  t.className = `toast toast-${type} toast-visible`;
  t.textContent = msg;
  tc.appendChild(t);
  setTimeout(() => { t.classList.remove('toast-visible'); t.addEventListener('transitionend', () => t.remove(), { once: true }); }, 3000);
}

function applyLevelGating(level) {
  const gardenSection  = document.getElementById('garden-section');
  const testersSection = document.getElementById('testers-section');
  if (gardenSection)  gardenSection.style.display  = level >= 3 ? '' : 'none';
  if (testersSection) testersSection.style.display = level >= 3 ? '' : 'none';
}

function updateNextActionHint() {
  const hintEl = document.getElementById('next-action-hint');
  if (!hintEl) return;

  const activePotCards = document.querySelectorAll('.multi-pot-card.pot-active');
  const readyPotCards  = document.querySelectorAll('.pot-harvest-btn');
  const hasSeeds       = document.querySelectorAll('.inv-card').length > 0;
  const emptyPotCards  = document.querySelectorAll('.multi-pot-card.pot-empty');

  if (readyPotCards.length > 0) {
    hintEl.textContent = '🌺 Un pot est prêt à récolter !';
    hintEl.style.display = '';
  } else if (activePotCards.length === 0 && hasSeeds && emptyPotCards.length > 0) {
    hintEl.textContent = '🌱 Lance ta première mutation : sélectionne deux graines dans l\'inventaire puis clique "Lancer la mutation".';
    hintEl.style.display = '';
  } else if (activePotCards.length === 0 && !hasSeeds) {
    hintEl.textContent = '📦 Récupère ton colis mystère pour obtenir ta première graine !';
    hintEl.style.display = '';
  } else {
    hintEl.style.display = 'none';
  }
}

async function onBuyGardenEffect(effectId) {
  const result = await buyGardenEffect(getUserId(), effectId, currentPlayerData.coins, currentGarden);
  if (result.error) { showToast(result.error); return; }
  currentGarden           = result.newGarden;
  currentPlayerData.coins = result.newCoins;
  updatePotsGarden(currentGarden);
  renderPlayerStats(currentPlayerData);
  renderGarden(currentGarden, currentPlayerData.coins, onBuyGardenEffect);
}

async function onHarvest(harvestResult, xpResult) {
  lastHarvestedSp = harvestResult.result_species
    ? { ...harvestResult.result_species, quality_tier_id: harvestResult.quality_tier_id ?? 1 }
    : null;

  if (lastHarvestedSp?.id) {
    adjustLocalSeedQuantity(lastHarvestedSp.id, harvestResult.seed_quantity_delta ?? 1);
    playerCodexIds.add(lastHarvestedSp.id);
    window.__botanicaCodexIds = playerCodexIds;
    patchLocal('codexIds', [...playerCodexIds]);
  }

  currentPlayerData = {
    ...currentPlayerData,
    xp:        xpResult.newXp,
    level:     xpResult.newLevel,
    coins:     xpResult.newCoins,
    pot_slots: xpResult.newPotSlots ?? currentPlayerData.pot_slots,
  };
  renderPlayerStats(currentPlayerData);
  applyLevelGating(currentPlayerData.level ?? 1);
  updatePotsPlayerData(currentPlayerData);

  const xpGained = computeHarvestXp(
    lastHarvestedSp?.rarity ?? 'common',
    harvestResult.quality_tier_id ?? 1
  );
  const quality = QUALITY_TIERS.find(t => t.id === harvestResult.quality_tier_id) ?? QUALITY_TIERS[1];
  const isFirst = harvestResult.first_server_discovery === true;

  showHarvestReveal(
    lastHarvestedSp ?? { name: '???', rarity: 'common' },
    quality,
    xpGained,
    isFirst,
    () => { if (xpResult.leveledUp) showLevelUpOverlay(xpResult.newLevel, xpResult.reward); }
  );

  await Promise.all([loadSpecies(), refreshInventory(), refreshTesters()]);
  renderGarden(currentGarden, currentPlayerData.coins, onBuyGardenEffect);
  updateNextActionHint();
}

if (notifBtn) {
  notifBtn.addEventListener('click', async () => {
    const { requestNotifPermission } = await import('./lib/notifications.js');
    const granted = await requestNotifPermission();
    notifBtn.textContent = granted ? '🔔 Notifs activées' : '🔕 Notifs refusées';
    notifBtn.disabled    = granted;
  });
}

async function init() {
  restorePotNotification();
  await restoreStarSession();

  const auth = await requireAuth('/login.html');
  if (!auth) return;

  onAuthReady(async () => {
    await getProfile();
    await showIntroIfNeeded();

    currentPlayerData = await loadPlayerData(getUserId());
    renderPlayerStats(currentPlayerData);
    applyLevelGating(currentPlayerData.level ?? 1);
    currentPlayerData.user_id = getUserId();

    await loadSpecies();

    await Promise.all([
      refreshInventory(),
      refreshTesters(),
      refreshGarden(),
    ]);

    // L'onboarding doit s'exécuter avant initPots pour que les graines soient
    // en DB avant le premier render des selects de pots.
    await initOnboarding(getUserId(), async () => {
      await refreshInventory();
    });
    await initPots(speciesList, currentPlayerData, onHarvest, currentGarden, refreshInventory);

    initMysterySeed(async () => {
      await refreshInventory();
      updateNextActionHint();
    });

    updateNextActionHint();
  });
}

init();