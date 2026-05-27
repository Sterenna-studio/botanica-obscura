import { supabase, restoreStarSession } from './lib/supabaseClient.js';
import { createPlantCharacterSvg } from './lib/plantSvg.js';
import { getFallbackSpeciesTree } from './lib/speciesTree.js';
import { renderMutationTree, setTreeInventory } from './lib/mutationTree.js';
import { loadInventory, renderInventory } from './lib/inventory.js';
import { ensureTesters, renderTesters } from './lib/testers.js';
import { restorePotNotification } from './lib/notifications.js';
import { onAuthReady, getBotanicaUserId, requireAuth, getProfile } from './lib/auth.js';
import { loadGarden, renderGarden, buyGardenEffect } from './lib/garden.js';
import { loadPlayerData, renderPlayerStats } from './lib/playerData.js';
import { QUALITY_TIERS } from './lib/quality.js';
import { initMysterySeed } from './lib/mysterySeed.js';
import { computeHarvestXp } from './lib/xp.js';
import { computeHarvestQuantity } from './lib/harvestQuantity.js';
import { performSeedDrop } from './lib/seedDrop.js';
import { loadFlowers, addFlowers, renderFlowers, totalFlowerCount } from './lib/flowerInventory.js';
import { launchDeliveryGame } from './lib/deliveryGame.js';
import { loadBaseSpecies, renderSeedShop } from './lib/seedShop.js';
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
import { showDiscoveryNotice } from './lib/discoveryNotice.js';
import { renderSpeciesPanel } from './lib/speciesPanel.js';

export { supabase };
export function getUserId() { return getBotanicaUserId(); }

const codexGrid         = document.getElementById('codexGrid');
const codexSummary      = document.getElementById('codexSummary');
const codexTierFilter   = document.getElementById('codexTierFilter');
const codexRarityFilter = document.getElementById('codexRarityFilter');
const codexStateFilter  = document.getElementById('codexStateFilter');
const codexSearch       = document.getElementById('codexSearch');
const codexResetFilters = document.getElementById('codexResetFilters');

let speciesList           = [];
let playerCodexIds        = new Set();
let playerFirstServerIds  = new Set();
let testers               = [];
let lastHarvestedSp       = null;
let currentGarden         = {};
let currentPlayerData     = { coins: 0, level: 1, xp: 0, pot_slots: 1 };
let codexControlsReady    = false;
let currentInventorySeeds = [];
let currentFlowers        = [];
let baseSpecies           = [];

const codexFilters = { tier: 'all', rarity: 'all', state: 'all', search: '' };
const RARITY_LABELS = { common: 'Commune', rare: 'Rare', epic: 'Épique', legendary: 'Légendaire', mythic: 'Mythique' };
window.__botanicaCodexIds = playerCodexIds;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function getInventoryQties() {
  return new Map(
    currentInventorySeeds.map(s => [Number(s.species_id ?? s.species?.id), Number(s.quantity ?? 0)])
  );
}

function totalSeedCount() {
  return currentInventorySeeds.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
}

function openSpeciesPanel(species) {
  renderSpeciesPanel(
    species, speciesList, getInventoryQties(),
    (speciesId, parentAId, parentBId) => {
      const okA = selectSpeciesForNextPot(parentAId);
      const okB = selectSpeciesForNextPot(parentBId);
      if (!okA || !okB) showToast('Impossible de placer les graines — vérifie les pots libres.', 'error');
    },
    playerCodexIds
  );
}

function showHarvestReveal(species, qualityTier, xpGained, flowerQty, seedDrops, isFirst, onClose) {
  const overlay      = document.getElementById('harvest-reveal-overlay');
  if (!overlay) { onClose?.(); return; }
  const firstBanner  = document.getElementById('harvest-reveal-first');
  const qualityBadge = document.getElementById('harvest-reveal-quality-badge');
  const svgEl        = document.getElementById('harvest-reveal-svg');
  const nameEl       = document.getElementById('harvest-reveal-name');
  const rarityEl     = document.getElementById('harvest-reveal-rarity');
  const xpEl         = document.getElementById('harvest-reveal-xp');
  const closeBtn     = document.getElementById('harvest-reveal-close');
  const qtyEl        = document.getElementById('harvest-reveal-qty');
  const seedDropEl   = document.getElementById('harvest-reveal-seeds');

  if (firstBanner)  firstBanner.style.display  = isFirst ? '' : 'none';
  if (qualityBadge) { qualityBadge.textContent = qualityTier.label; qualityBadge.style.color = qualityTier.color; }
  if (svgEl)        svgEl.innerHTML = createPlantCharacterSvg(species);
  if (nameEl)       nameEl.textContent = species.name ?? '???';
  if (rarityEl)     rarityEl.innerHTML = `<span class="rarity-badge ${species.rarity ?? ''}">${species.rarity ?? '—'}</span>`;
  if (xpEl)         xpEl.textContent = `+${xpGained} XP`;
  if (qtyEl)        qtyEl.textContent = `🌸 x${flowerQty} fleur${flowerQty > 1 ? 's' : ''} récoltée${flowerQty > 1 ? 's' : ''}`;

  if (seedDropEl) {
    if (seedDrops?.length) {
      // Enrichit les noms avec speciesList si disponible
      const labels = seedDrops.map(d => {
        const sp = speciesList.find(s => Number(s.id) === Number(d.speciesId));
        const spName = sp?.name ?? `espèce #${d.speciesId}`;
        return `🌱 +${d.qty} graine${d.qty > 1 ? 's' : ''} de ${spName}`;
      });
      seedDropEl.innerHTML = labels.join('<br>');
      seedDropEl.style.display = '';
    } else {
      seedDropEl.style.display = 'none';
    }
  }

  overlay.style.display = 'flex';
  if (closeBtn) closeBtn.onclick = () => { overlay.style.display = 'none'; onClose?.(); };
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
    .from('botanica_species').select('*')
    .order('tier', { ascending: true }).order('id', { ascending: true });

  const userId = getUserId();
  const { data: codexData, error: codexErr } = await supabase
    .from('botanica_player_codex').select('species_id, was_first_server')
    .eq('user_id', userId);

  if (codexErr) {
    console.warn('[app] Chargement codex cloud échoué, fallback local :', codexErr.message);
    playerCodexIds       = new Set(loadLocal()?.codexIds ?? []);
    playerFirstServerIds = new Set(loadLocal()?.firstServerCodexIds ?? []);
  } else {
    playerCodexIds       = new Set((codexData ?? []).map(r => r.species_id));
    playerFirstServerIds = new Set((codexData ?? []).filter(r => r.was_first_server).map(r => r.species_id));
    patchLocal('codexIds', [...playerCodexIds]);
    patchLocal('firstServerCodexIds', [...playerFirstServerIds]);
  }
  window.__botanicaCodexIds = playerCodexIds;

  speciesList = (!globalErr && globalData?.length)
    ? globalData.map(s => ({ ...s, was_first_server: playerFirstServerIds.has(s.id), discoverer_name: s.discovered_by_username, discoverer_avatar: null }))
    : getFallbackSpeciesTree().map(s => ({ ...s, was_first_server: playerFirstServerIds.has(s.id) }));

  renderCodex();
  setTreeInventory(getInventoryQties());
  renderMutationTree(speciesList, playerCodexIds, openSpeciesPanel);
  updatePotsSpecies(speciesList);
}

function getCodexState(species) {
  if (playerCodexIds.has(species.id)) return 'unlocked';
  return species.discovered_by ? 'server-known' : 'unknown';
}

function getCodexSearchText(species) {
  return [species.name, species.description, species.rarity, species.tier, species.discoverer_name].filter(Boolean).join(' ').toLowerCase();
}

function getFilteredSpecies() {
  const search = codexFilters.search.trim().toLowerCase();
  return speciesList.filter(s => {
    const state = getCodexState(s);
    if (codexFilters.tier   !== 'all' && String(s.tier)   !== codexFilters.tier)   return false;
    if (codexFilters.rarity !== 'all' && String(s.rarity) !== codexFilters.rarity) return false;
    if (codexFilters.state  !== 'all' && state             !== codexFilters.state)  return false;
    if (codexFilters.search.trim() && !getCodexSearchText(s).includes(codexFilters.search.trim().toLowerCase())) return false;
    return true;
  });
}

function replaceSelectOptions(selectEl, options, firstLabel) {
  if (!selectEl) return;
  const previous = selectEl.value || 'all';
  selectEl.innerHTML = [`<option value="all">${firstLabel}</option>`, ...options.map(({ value, label }) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)].join('');
  selectEl.value = [...options.map(o => String(o.value)), 'all'].includes(previous) ? previous : 'all';
}

function syncCodexFilterOptions() {
  const tiers = [...new Set(speciesList.map(s => s.tier).filter(v => v !== undefined && v !== null))]
    .sort((a, b) => Number(a) - Number(b)).map(tier => ({ value: String(tier), label: `Tier ${tier}` }));
  const rarities = [...new Set(speciesList.map(s => s.rarity).filter(Boolean))]
    .sort((a, b) => Object.keys(RARITY_LABELS).indexOf(a) - Object.keys(RARITY_LABELS).indexOf(b))
    .map(rarity => ({ value: rarity, label: RARITY_LABELS[rarity] ?? rarity }));
  replaceSelectOptions(codexTierFilter,   tiers,   'Tous');
  replaceSelectOptions(codexRarityFilter, rarities,'Toutes');
}

function renderCodexSummary(visibleSpecies) {
  if (!codexSummary) return;
  const total       = speciesList.length;
  const unlocked    = speciesList.filter(s => getCodexState(s) === 'unlocked').length;
  const serverKnown = speciesList.filter(s => getCodexState(s) === 'server-known').length;
  const unknown     = Math.max(total - unlocked - serverKnown, 0);
  const firsts      = speciesList.filter(s => playerFirstServerIds.has(s.id)).length;
  const percent     = total > 0 ? Math.round((unlocked / total) * 100) : 0;
  codexSummary.innerHTML = `
    <div class="codex-progress-card codex-progress-main"><span class="codex-progress-value">${unlocked}/${total}</span><span class="codex-progress-label">Collection joueur</span><div class="codex-progress-bar" aria-hidden="true"><span style="width:${percent}%"></span></div></div>
    <div class="codex-progress-card"><span class="codex-progress-value">${serverKnown}</span><span class="codex-progress-label">Connues serveur</span></div>
    <div class="codex-progress-card"><span class="codex-progress-value">${unknown}</span><span class="codex-progress-label">Mystères</span></div>
    <div class="codex-progress-card"><span class="codex-progress-value">${firsts}</span><span class="codex-progress-label">1ères mondiales</span></div>
    <div class="codex-progress-card"><span class="codex-progress-value">${visibleSpecies.length}</span><span class="codex-progress-label">Affichées</span></div>`;
}

function renderCodexCard(species) {
  const state       = getCodexState(species);
  const rarity      = species.rarity ?? 'common';
  const tier        = species.tier   ?? '—';
  const rarityLabel = RARITY_LABELS[rarity] ?? rarity;
  if (state === 'unlocked') return `
    <article class="codex-card rarity-${escapeHtml(rarity)} state-unlocked codex-card-clickable" data-id="${escapeHtml(species.id)}" title="Voir le détail">
      <div class="codex-card-topline"><span class="codex-tier-pill">Tier ${escapeHtml(tier)}</span><span class="rarity-badge ${escapeHtml(rarity)}">${escapeHtml(rarityLabel)}</span></div>
      <div class="codex-sprite">${createPlantCharacterSvg(species)}</div>
      <h3>${escapeHtml(species.name)}</h3><p>${escapeHtml(species.description || '')}</p>
      ${playerFirstServerIds.has(species.id) ? '<div class="first-discovery">🏅 1ère découverte serveur</div>' : ''}
    </article>`;
  if (state === 'server-known') return `
    <article class="codex-card state-server-known codex-card-clickable" data-id="${escapeHtml(species.id)}" title="Voir la recette">
      <div class="codex-card-topline"><span class="codex-tier-pill">Tier ?</span><span class="rarity-badge ${escapeHtml(rarity)}">${escapeHtml(rarityLabel)}</span></div>
      <div class="codex-sprite codex-silhouette">${createPlantCharacterSvg(species)}</div>
      <h3 class="codex-unknown-name">Espèce observée</h3>
      <div class="codex-server-badge">${species.discoverer_avatar ? `<img src="${escapeHtml(species.discoverer_avatar)}" class="codex-discoverer-avatar" alt="" />` : '🌐'}<span>Découverte par <strong>${escapeHtml(species.discoverer_name ?? '???')}</strong></span></div>
    </article>`;
  return `
    <article class="codex-card state-unknown" data-id="${escapeHtml(species.id)}">
      <div class="codex-card-topline"><span class="codex-tier-pill">Tier ?</span><span class="codex-state-pill">Inconnue</span></div>
      <div class="codex-sprite codex-mystery">?</div><h3 class="codex-unknown-name">Espèce inconnue</h3><p>Mutation non répertoriée dans votre collection.</p>
    </article>`;
}

function renderCodex() {
  if (!codexGrid) return;
  syncCodexFilterOptions();
  const visibleSpecies = getFilteredSpecies();
  renderCodexSummary(visibleSpecies);
  if (visibleSpecies.length === 0) {
    codexGrid.innerHTML = '<div class="codex-empty-state">Aucune espèce ne correspond aux filtres actuels.</div>';
    return;
  }
  codexGrid.innerHTML = visibleSpecies.map(renderCodexCard).join('');
  codexGrid.querySelectorAll('.codex-card-clickable').forEach(card => {
    card.addEventListener('click', () => {
      const id = Number(card.dataset.id);
      const species = speciesList.find(s => Number(s.id) === id);
      if (species) openSpeciesPanel(species);
    });
  });
}

function setupCodexControls() {
  if (codexControlsReady) return;
  codexControlsReady = true;
  codexTierFilter?.addEventListener('change',  () => { codexFilters.tier   = codexTierFilter.value;   renderCodex(); });
  codexRarityFilter?.addEventListener('change',() => { codexFilters.rarity = codexRarityFilter.value; renderCodex(); });
  codexStateFilter?.addEventListener('change', () => { codexFilters.state  = codexStateFilter.value;  renderCodex(); });
  codexSearch?.addEventListener('input',       () => { codexFilters.search = codexSearch.value;        renderCodex(); });
  codexResetFilters?.addEventListener('click', () => {
    Object.assign(codexFilters, { tier: 'all', rarity: 'all', state: 'all', search: '' });
    if (codexTierFilter)   codexTierFilter.value   = 'all';
    if (codexRarityFilter) codexRarityFilter.value = 'all';
    if (codexStateFilter)  codexStateFilter.value  = 'all';
    if (codexSearch)       codexSearch.value        = '';
    renderCodex();
  });
}

function renderDeliverBtn() {
  const btn = document.getElementById('deliver-btn');
  if (!btn) return;
  const total = totalFlowerCount(currentFlowers);
  btn.disabled = total === 0;
  btn.innerHTML = `🚗 Livrer (${total} fleur${total !== 1 ? 's' : ''})`;
}

// ── Rafraîchissement boutique ─────────────────────────────────────────────────────────
async function refreshShop() {
  if (!baseSpecies.length) baseSpecies = await loadBaseSpecies();
  renderSeedShop(baseSpecies, currentPlayerData.coins, getUserId(), async (newCoins) => {
    currentPlayerData.coins = newCoins;
    renderPlayerStats(currentPlayerData);
    renderGarden(currentGarden, newCoins, onBuyGardenEffect);
    // Reaffiche la boutique avec les nouvelles pièces (boutons disabled/enabled)
    renderSeedShop(baseSpecies, currentPlayerData.coins, getUserId(), arguments.callee);
    await refreshInventory();
  });
}

async function refreshInventory() {
  const seeds = await loadInventory(getUserId());
  currentInventorySeeds = seeds;
  updatePotsInventory(seeds);
  setTreeInventory(getInventoryQties());
  renderInventory(seeds,
    (speciesId) => {
      const selected = selectSpeciesForNextPot(speciesId);
      if (!selected) console.warn('[app] Impossible de sélectionner cette graine dans un pot libre.');
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

async function refreshFlowers() {
  currentFlowers = await loadFlowers(getUserId());
  renderFlowers(currentFlowers,
    (newCoins) => {
      currentPlayerData.coins = newCoins;
      renderPlayerStats(currentPlayerData);
      renderGarden(currentGarden, newCoins, onBuyGardenEffect);
    },
    getUserId()
  );
  renderDeliverBtn();
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

  // ── 1. Fleurs récoltées (espèce mutée) ────────────────────────────────────
  const flowerQty = computeHarvestQuantity(
    harvestResult.quality_tier_id ?? 1,
    currentGarden,
    lastHarvestedSp?.tier ?? 1
  );

  if (lastHarvestedSp?.id) {
    await addFlowers(getUserId(), lastHarvestedSp.id, harvestResult.quality_tier_id ?? 1, flowerQty);
    playerCodexIds.add(lastHarvestedSp.id);
    if (harvestResult.first_server_discovery === true) playerFirstServerIds.add(lastHarvestedSp.id);
    window.__botanicaCodexIds = playerCodexIds;
    patchLocal('codexIds', [...playerCodexIds]);
    patchLocal('firstServerCodexIds', [...playerFirstServerIds]);
  }

  // ── 2. Graines parentes (drop 1-3, 70% par parent) ──────────────────────────
  // species_a_id / species_b_id maintenant retournés par l'edge function v9
  const { drops: seedDrops } = await performSeedDrop(
    getUserId(),
    harvestResult.species_a_id,
    harvestResult.species_b_id
  );

  // ── 3. XP / level ─────────────────────────────────────────────────────────
  currentPlayerData = { ...currentPlayerData, xp: xpResult.newXp, level: xpResult.newLevel, coins: xpResult.newCoins, pot_slots: xpResult.newPotSlots ?? currentPlayerData.pot_slots };
  renderPlayerStats(currentPlayerData);
  applyLevelGating(currentPlayerData.level ?? 1);
  updatePotsPlayerData(currentPlayerData);

  const xpGained = computeHarvestXp(lastHarvestedSp?.rarity ?? 'common', harvestResult.quality_tier_id ?? 1);
  const quality  = QUALITY_TIERS.find(t => t.id === harvestResult.quality_tier_id) ?? QUALITY_TIERS[1];
  const isFirst  = harvestResult.first_server_discovery === true;
  if (isFirst && lastHarvestedSp) showDiscoveryNotice(lastHarvestedSp);

  showHarvestReveal(
    lastHarvestedSp ?? { name: '???', rarity: 'common' },
    quality, xpGained, flowerQty, seedDrops, isFirst,
    () => { if (xpResult.leveledUp) showLevelUpOverlay(xpResult.newLevel, xpResult.reward); }
  );

  await Promise.all([loadSpecies(), refreshInventory(), refreshFlowers(), refreshTesters()]);
  refreshShop(); // re-render boutique avec coins à jour
  renderGarden(currentGarden, currentPlayerData.coins, onBuyGardenEffect);
}

async function init() {
  restorePotNotification();
  setupCodexControls();
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
    await Promise.all([refreshInventory(), refreshFlowers(), refreshTesters(), refreshGarden()]);
    await refreshShop(); // charge et affiche la boutique
    await initOnboarding(getUserId(), async () => { await refreshInventory(); });
    await initPots(speciesList, currentPlayerData, onHarvest, currentGarden, refreshInventory);
    initMysterySeed(async () => { await refreshInventory(); }, () => currentPlayerData.level ?? 1);

    // ── Bouton Livrer (cargo = fleurs) ────────────────────────────────────────
    const deliverBtn = document.getElementById('deliver-btn');
    if (deliverBtn) {
      deliverBtn.addEventListener('click', () => {
        const cargo = totalFlowerCount(currentFlowers);
        if (cargo === 0) { showToast('Aucune fleur à livrer !', 'error'); return; }
        launchDeliveryGame(
          cargo,
          async (coinsEarned) => {
            currentPlayerData.coins += coinsEarned;
            renderPlayerStats(currentPlayerData);
            renderGarden(currentGarden, currentPlayerData.coins, onBuyGardenEffect);
            showToast(`🚗 Livraison réussie ! +🪙 ${coinsEarned} pièces`, 'success');
            await supabase.from('botanica_player_data')
              .update({ coins: currentPlayerData.coins })
              .eq('user_id', getUserId());
            refreshShop(); // Debloquer des achats si on avait peu de pièces
          },
          () => showToast('🚨 Arrêté par la police ! Cargo confisqué.', 'error')
        );
      });
    }
  });
}

init();
