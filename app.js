import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { createPlantCharacterSvg } from './lib/plantSvg.js';
import { getFallbackSpeciesTree } from './lib/speciesTree.js';
import { startMutationPot, loadActivePot, harvestMutation } from './lib/mutation.js';
import { loadInventory, renderInventory } from './lib/inventory.js';
import { ensureTesters, renderTesters } from './lib/testers.js';
import { requestNotifPermission, schedulePotNotification, cancelPotNotification, restorePotNotification } from './lib/notifications.js';
import { renderMutationTree } from './lib/mutationTree.js';
import { onAuthReady, getBotanicaUserId, isLoggedIn } from './lib/auth.js';
import { initAuthModal } from './lib/authModal.js';
import { loadGarden, renderGarden, buyGardenEffect } from './lib/garden.js';
import { loadPlayerData, renderPlayerStats } from './lib/playerData.js';
import { QUALITY_TIERS } from './lib/quality.js';

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

export function getUserId() { return getBotanicaUserId(); }

const speciesASelect   = document.getElementById('speciesA');
const speciesBSelect   = document.getElementById('speciesB');
const startMutationBtn = document.getElementById('startMutationBtn');
const harvestBtn       = document.getElementById('harvestBtn');
const mutationStatus   = document.getElementById('mutationStatus');
const progressBar      = document.getElementById('progressBar');
const codexGrid        = document.getElementById('codexGrid');
const plantCharacter   = document.getElementById('plantCharacter');
const plantDescription = document.getElementById('plantDescription');
const potVisual        = document.getElementById('potVisual');
const notifBtn         = document.getElementById('notifBtn');

let speciesList          = [];
let playerCodexIds       = new Set();
let activePot            = null;
let progressInterval     = null;
let testers              = [];
let lastHarvestedSpecies = null;
let currentGarden        = {};
let currentPlayerData    = { coins: 0, level: 1, xp: 0 };

// ── Espèces ──────────────────────────────────────────────────────────────
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

  speciesList = (!globalErr && globalData?.length)
    ? globalData
    : getFallbackSpeciesTree();

  populateSpeciesSelects();
  renderCodex();
  renderMutationTree(speciesList, playerCodexIds, renderPreview);
  renderPreview(speciesList.find(s => playerCodexIds.has(s.id)) ?? speciesList[0]);
}

function populateSpeciesSelects() {
  const unlocked = speciesList.filter(s => playerCodexIds.has(s.id));
  const options  = unlocked.map(s =>
    `<option value="${s.id}">${s.name} — T${s.tier} (${s.rarity})</option>`
  ).join('');
  const placeholder = '<option value="" disabled selected>— Aucune espèce débloquée —</option>';
  speciesASelect.innerHTML = unlocked.length ? options : placeholder;
  speciesBSelect.innerHTML = unlocked.length ? options : placeholder;
  speciesASelect.addEventListener('change', () => renderPreview(getSelected(speciesASelect)));
}

function getSelected(select) {
  return speciesList.find(s => String(s.id) === select.value) || speciesList[0];
}

function renderPreview(species) {
  if (!species) return;
  plantCharacter.innerHTML  = createPlantCharacterSvg(species);
  plantDescription.textContent = species.description || 'Aucune description.';
}

// ── Codex ─────────────────────────────────────────────────────────────────
function renderCodex() {
  codexGrid.innerHTML = speciesList.map(s => {
    const state = playerCodexIds.has(s.id)
      ? 'unlocked'
      : s.discovered_by ? 'server-known' : 'unknown';

    if (state === 'unlocked') {
      return `
        <article class="codex-card rarity-${s.rarity} state-unlocked" data-id="${s.id}">
          <div class="codex-sprite">${createPlantCharacterSvg(s)}</div>
          <h3>${s.name}</h3>
          <div class="codex-meta">Tier ${s.tier} • <span class="rarity-badge ${s.rarity}">${s.rarity}</span></div>
          <p>${s.description || ''}</p>
          ${s.was_first_server ? '<div class="first-discovery">🏅 1ère découverte serveur</div>' : ''}
        </article>`;
    }
    if (state === 'server-known') {
      return `
        <article class="codex-card state-server-known" data-id="${s.id}" title="Découverte par ${s.discoverer_name ?? 'un autre joueur'}">
          <div class="codex-sprite codex-silhouette">${createPlantCharacterSvg(s)}</div>
          <h3 class="codex-unknown-name">???</h3>
          <div class="codex-meta">Tier ${s.tier} • <span class="rarity-badge ${s.rarity}">${s.rarity}</span></div>
          <div class="codex-server-badge">
            ${s.discoverer_avatar ? `<img src="${s.discoverer_avatar}" class="codex-discoverer-avatar" alt="" />` : '🌐'}
            <span>Découverte par <strong>${s.discoverer_name ?? '???'}</strong></span>
          </div>
        </article>`;
    }
    return `
      <article class="codex-card state-unknown" data-id="${s.id}">
        <div class="codex-sprite codex-mystery">?</div>
        <h3 class="codex-unknown-name">Espèce inconnue</h3>
        <div class="codex-meta">Tier ${s.tier}</div>
      </article>`;
  }).join('');

  document.querySelectorAll('.codex-card.state-unlocked').forEach(card => {
    card.addEventListener('click', () => {
      renderPreview(speciesList.find(s => String(s.id) === card.dataset.id));
    });
  });
}

// ── Inventaire & Testers ──────────────────────────────────────────────────
async function refreshInventory() {
  const seeds = await loadInventory(getUserId());
  renderInventory(
    seeds,
    (speciesId) => {
      const optA = speciesASelect.querySelector(`option[value="${speciesId}"]`);
      if (optA) { speciesASelect.value = speciesId; renderPreview(getSelected(speciesASelect)); }
      else       { speciesBSelect.value = speciesId; }
      document.querySelector('.panel')?.scrollIntoView({ behavior: 'smooth' });
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
  renderTesters(testers, lastHarvestedSpecies);
}

// ── Jardin ────────────────────────────────────────────────────────────────
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

// ── Animation pot ─────────────────────────────────────────────────────────
export function updateGrowAnimation(pot) {
  if (!pot) { resetPotVisual(); return; }
  const now   = Date.now();
  const start = new Date(pot.started_at).getTime();
  const end   = new Date(pot.ready_at).getTime();
  const pct   = Math.min(((now - start) / (end - start)) * 100, 100);
  const stage = pct >= 100 ? 4 : pct >= 75 ? 3 : pct >= 50 ? 2 : pct >= 25 ? 1 : 0;

  progressBar.style.width = `${pct.toFixed(1)}%`;
  renderPotStage(stage, pct >= 100);

  const remainMs = Math.max(end - now, 0);
  const h = Math.floor(remainMs / 3600000);
  const m = Math.floor((remainMs % 3600000) / 60000);

  if (pct >= 100) {
    mutationStatus.textContent = '✅ Mutation prête ! Récoltez !';
    harvestBtn.style.display   = 'block';
    startMutationBtn.style.display = 'none';
    clearInterval(progressInterval);
  } else {
    mutationStatus.textContent = `🌱 En cours... ${h}h ${m}m restant (stade ${stage}/4)`;
    harvestBtn.style.display   = 'none';
    startMutationBtn.style.display = 'none';
  }
}

function renderPotStage(stage, ready) {
  const emojis = ['🪨','🌱','🌿','🌳','🌺'];
  const labels = ['Sol préparé','Germination','Pousse','Croissance','Floraison'];
  const colors = ['#4a3728','#5a7a3a','#6a9a4a','#4a8a3a','#d870c0'];
  potVisual.innerHTML = `
    <div class="pot-stage stage-${stage}" style="--stage-color:${colors[stage]}">
      <div class="pot-emoji">${emojis[stage]}</div>
      <div class="pot-label">${labels[stage]}</div>
      ${ready ? '<div class="pot-ready-glow"></div>' : ''}
    </div>`;
}

function resetPotVisual() {
  potVisual.innerHTML = `<div class="pot-stage stage-0"><div class="pot-emoji">🪴</div><div class="pot-label">Pot vide</div></div>`;
  progressBar.style.width        = '0%';
  harvestBtn.style.display       = 'none';
  startMutationBtn.style.display = 'block';
  mutationStatus.textContent     = 'Choisissez deux espèces mères pour lancer une mutation.';
}

// ── Mutation : lancement & récolte ────────────────────────────────────────
startMutationBtn.addEventListener('click', async () => {
  if (!isLoggedIn()) {
    mutationStatus.textContent = '🔒 Connectez-vous pour lancer une mutation.';
    import('./lib/auth.js').then(({ openAuthModal }) => openAuthModal('login'));
    return;
  }
  const aId = Number(speciesASelect.value);
  const bId = Number(speciesBSelect.value);
  if (!aId || !bId) return;
  mutationStatus.textContent  = '⏳ Lancement...';
  startMutationBtn.disabled   = true;

  const result = await startMutationPot(getUserId(), aId, bId);
  startMutationBtn.disabled = false;
  if (result.error) { mutationStatus.textContent = `❌ ${result.error}`; return; }

  activePot = result.pot;
  schedulePotNotification(activePot.ready_at);
  tickProgress();
});

harvestBtn.addEventListener('click', async () => {
  if (!activePot) return;
  harvestBtn.disabled        = true;
  mutationStatus.textContent = '🎲 Résolution du gacha...';

  const result = await harvestMutation(activePot.id, getUserId(), currentGarden);
  if (result.error) { mutationStatus.textContent = `❌ ${result.error}`; harvestBtn.disabled = false; return; }

  lastHarvestedSpecies = result.result_species;
  const quality  = QUALITY_TIERS.find(t => t.id === result.quality_tier_id) ?? QUALITY_TIERS[1];
  const firstMsg = result.first_server_discovery ? ' 🏅 PREMIÈRE DÉCOUVERTE SERVEUR !' : '';
  mutationStatus.textContent = `🌺 Obtenu : ${lastHarvestedSpecies.name} (${lastHarvestedSpecies.rarity}) — ${quality.label}${firstMsg}`;

  activePot           = null;
  harvestBtn.disabled = false;
  cancelPotNotification();
  clearInterval(progressInterval);

  await Promise.all([loadSpecies(), refreshInventory(), refreshTesters()]);
  resetPotVisual();

  currentPlayerData = await loadPlayerData(getUserId());
  renderPlayerStats(currentPlayerData);
  renderGarden(currentGarden, currentPlayerData.coins, onBuyGardenEffect);
});

function tickProgress() {
  clearInterval(progressInterval);
  updateGrowAnimation(activePot);
  progressInterval = setInterval(() => updateGrowAnimation(activePot), 10000);
}

if (notifBtn) {
  notifBtn.addEventListener('click', async () => {
    const granted = await requestNotifPermission();
    notifBtn.textContent = granted ? '🔔 Notifs activées' : '🔕 Notifs refusées';
    notifBtn.disabled    = granted;
    if (granted && activePot) schedulePotNotification(activePot.ready_at);
  });
}

// ── Init ──────────────────────────────────────────────────────────────────
async function init() {
  initAuthModal();
  restorePotNotification();

  onAuthReady(async () => {
    currentPlayerData = await loadPlayerData(getUserId());
    renderPlayerStats(currentPlayerData);

    await loadSpecies();
    resetPotVisual();
    await Promise.all([refreshInventory(), refreshTesters(), refreshGarden()]);

    const pot = await loadActivePot(getUserId());
    if (pot) { activePot = pot; tickProgress(); }
  });
}

init();
