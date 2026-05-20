import { SUPABASE_URL, SUPABASE_ANON } from '../config.js';
import { supabase } from './lib/supabaseClient.js';
import { createPlantCharacterSvg } from './lib/plantSvg.js';
import { getFallbackSpeciesTree } from './lib/speciesTree.js';
import { renderMutationTree } from './lib/mutationTree.js';
import { loadInventory, renderInventory } from './lib/inventory.js';
import { ensureTesters, renderTesters } from './lib/testers.js';
import { requestNotifPermission, restorePotNotification } from './lib/notifications.js';
import { onAuthReady, getBotanicaUserId, isLoggedIn } from './lib/auth.js';
import { initAuthModal } from './lib/authModal.js';
import { loadGarden, renderGarden, buyGardenEffect } from './lib/garden.js';
import { loadPlayerData, renderPlayerStats } from './lib/playerData.js';
import { QUALITY_TIERS } from './lib/quality.js';
import { initMysterySeed } from './lib/mysterySeed.js';
import { addXpToPlayer, computeHarvestXp } from './lib/xp.js';
import { initPots, updatePotsSpecies, updatePotsPlayerData } from './lib/pots.js';

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

// Expose les IDs du codex pour lib/pots.js (filtrage des espèces débloquées)
window.__botanicaCodexIds = playerCodexIds;

// ── Level-up overlay ─────────────────────────────────────────────────────
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

// ── Espèces ─────────────────────────────────────────────────────────────
async function loadSpecies() {
  const { data: globalData, error: globalErr } = await supabase
    .from('codex_botanique_global')
    .select('*')
    .order('tier', { ascending: true })
    .order('id',   { ascending: true });

  const userId = getUserId();
  const { data: codexData } = await supabase
    .from('player_codex')
    .select('species_id, was_first_server')
    .eq('user_id', userId);

  playerCodexIds = new Set((codexData ?? []).map(r => r.species_id));
  window.__botanicaCodexIds = playerCodexIds; // mise à jour de l'exposé global

  speciesList = (!globalErr && globalData?.length)
    ? globalData
    : getFallbackSpeciesTree();

  renderCodex();
  renderMutationTree(speciesList, playerCodexIds, renderPreview);
  renderPreview(speciesList.find(s => playerCodexIds.has(s.id)) ?? speciesList[0]);
  updatePotsSpecies(speciesList);
}

function renderPreview(species) {
  if (!species) return;
  plantCharacter.innerHTML     = createPlantCharacterSvg(species);
  plantDesc.textContent        = species.description || 'Aucune description.';
}

// ── Codex ─────────────────────────────────────────────────────────────────
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

// ── Inventaire & Testers ─────────────────────────────────────────────────
async function refreshInventory() {
  const seeds = await loadInventory(getUserId());
  renderInventory(
    seeds,
    (_speciesId) => { /* navigation vers pot gérée dans pots.js */ },
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

// ── Jardin ───────────────────────────────────────────────────────────────
async function refreshGarden() {
  currentGarden = await loadGarden(getUserId());
  renderGarden(currentGarden, currentPlayerData.coins, onBuyGardenEffect);
}

async function onBuyGardenEffect(effectId) {
  const result = await buyGardenEffect(getUserId(), effectId, currentPlayerData.coins, currentGarden);
  if (result.error) { alert(result.error); return; }
  currentGarden           = result.newGarden;
  currentPlayerData.coins = result.newCoins;
  renderPlayerStats(currentPlayerData);
  renderGarden(currentGarden, currentPlayerData.coins, onBuyGardenEffect);
}

// ── Callback harvest (depuis lib/pots.js) ─────────────────────────────────
async function onHarvest(harvestResult, xpResult) {
  lastHarvestedSp = harvestResult.result_species;

  // Mise à jour playerData local
  currentPlayerData = {
    ...currentPlayerData,
    xp:        xpResult.newXp,
    level:     xpResult.newLevel,
    coins:     xpResult.newCoins,
    pot_slots: xpResult.newPotSlots ?? currentPlayerData.pot_slots,
  };
  renderPlayerStats(currentPlayerData);
  updatePotsPlayerData(currentPlayerData);

  // Toast XP
  const xpGained = computeHarvestXp(
    lastHarvestedSp?.rarity ?? 'common',
    harvestResult.quality_tier_id ?? 1
  );
  const quality = QUALITY_TIERS.find(t => t.id === harvestResult.quality_tier_id) ?? QUALITY_TIERS[1];
  const firstMsg = harvestResult.first_server_discovery ? ' 🏅 PREMIÈRE MONDIALE !' : '';

  let tc = document.getElementById('toast-container');
  if (!tc) { tc = document.createElement('div'); tc.id = 'toast-container'; document.body.appendChild(tc); }

  const toastHarvest = document.createElement('div');
  toastHarvest.className = 'toast toast-success toast-visible';
  toastHarvest.textContent = `🌺 ${lastHarvestedSp?.name} (${lastHarvestedSp?.rarity}) — ${quality.label}${firstMsg}`;
  tc.appendChild(toastHarvest);
  setTimeout(() => { toastHarvest.classList.remove('toast-visible'); toastHarvest.addEventListener('transitionend', () => toastHarvest.remove(), { once: true }); }, 3500);

  const toastXp = document.createElement('div');
  toastXp.className = 'toast toast-xp toast-visible';
  toastXp.textContent = `+${xpGained} XP`;
  tc.appendChild(toastXp);
  setTimeout(() => { toastXp.classList.remove('toast-visible'); toastXp.addEventListener('transitionend', () => toastXp.remove(), { once: true }); }, 2000);

  if (xpResult.leveledUp) showLevelUpOverlay(xpResult.newLevel, xpResult.reward);

  // Refresh codex, inventaire, testeurs
  await Promise.all([loadSpecies(), refreshInventory(), refreshTesters()]);
  renderGarden(currentGarden, currentPlayerData.coins, onBuyGardenEffect);
}

if (notifBtn) {
  notifBtn.addEventListener('click', async () => {
    const { requestNotifPermission } = await import('./lib/notifications.js');
    const granted = await requestNotifPermission();
    notifBtn.textContent = granted ? '🔔 Notifs activées' : '🔕 Notifs refusées';
    notifBtn.disabled    = granted;
  });
}

// ── Init ─────────────────────────────────────────────────────────────────
async function init() {
  initAuthModal();
  restorePotNotification();

  onAuthReady(async () => {
    currentPlayerData = await loadPlayerData(getUserId());
    renderPlayerStats(currentPlayerData);

    // Injecte user_id dans playerData pour lib/pots.js
    currentPlayerData.user_id = getUserId();

    await loadSpecies();

    await Promise.all([
      refreshInventory(),
      refreshTesters(),
      refreshGarden(),
    ]);

    // Init multi-pots
    await initPots(speciesList, currentPlayerData, onHarvest);

    initMysterySeed(refreshInventory);
  });
}

init();
