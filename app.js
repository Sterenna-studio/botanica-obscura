import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { createPlantCharacterSvg } from './lib/plantSvg.js';
import { getFallbackSpeciesTree } from './lib/speciesTree.js';
import { startMutationPot, loadActivePot, harvestMutation } from './lib/mutation.js';

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// Temp anonymous user ID stored in localStorage
let userId = localStorage.getItem('botanica_user_id');
if (!userId) {
  userId = crypto.randomUUID();
  localStorage.setItem('botanica_user_id', userId);
}
export { userId };

const speciesASelect = document.getElementById('speciesA');
const speciesBSelect = document.getElementById('speciesB');
const startMutationBtn = document.getElementById('startMutationBtn');
const harvestBtn = document.getElementById('harvestBtn');
const mutationStatus = document.getElementById('mutationStatus');
const progressBar = document.getElementById('progressBar');
const codexGrid = document.getElementById('codexGrid');
const plantCharacter = document.getElementById('plantCharacter');
const plantDescription = document.getElementById('plantDescription');
const potVisual = document.getElementById('potVisual');

let speciesList = [];
let activePot = null;
let progressInterval = null;

async function loadSpecies() {
  const { data, error } = await supabase
    .from('species')
    .select('*')
    .order('tier', { ascending: true })
    .order('id', { ascending: true });

  speciesList = (!error && data?.length) ? data : getFallbackSpeciesTree();
  populateSpeciesSelects();
  renderCodex();
  renderPreview(speciesList[0]);
}

function populateSpeciesSelects() {
  const options = speciesList
    .map(s => `<option value="${s.id}">${s.name} — T${s.tier} (${s.rarity})</option>`)
    .join('');
  speciesASelect.innerHTML = options;
  speciesBSelect.innerHTML = options;
  speciesASelect.addEventListener('change', () => renderPreview(getSelectedSpecies(speciesASelect)));
}

function getSelectedSpecies(select) {
  return speciesList.find(s => String(s.id) === select.value) || speciesList[0];
}

function renderPreview(species) {
  if (!species) return;
  plantCharacter.innerHTML = createPlantCharacterSvg(species);
  plantDescription.textContent = species.description || 'Aucune description.';
}

function renderCodex() {
  codexGrid.innerHTML = speciesList.map(s => `
    <article class="codex-card rarity-${s.rarity}" data-id="${s.id}">
      <div class="codex-sprite">${createPlantCharacterSvg(s)}</div>
      <h3>${s.name}</h3>
      <div class="codex-meta">Tier ${s.tier} • <span class="rarity-badge ${s.rarity}">${s.rarity}</span></div>
      <p>${s.description || ''}</p>
      ${s.discovered_by ? `<div class="first-discovery">🏅 1ère découverte serveur</div>` : ''}
    </article>
  `).join('');

  document.querySelectorAll('.codex-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      renderPreview(speciesList.find(s => String(s.id) === id));
    });
  });
}

// ─── GROW ANIMATION ───────────────────────────────────────────
export function updateGrowAnimation(pot) {
  if (!pot) { resetPotVisual(); return; }

  const now = Date.now();
  const start = new Date(pot.started_at).getTime();
  const end = new Date(pot.ready_at).getTime();
  const total = end - start;
  const elapsed = Math.min(now - start, total);
  const pct = Math.min((elapsed / total) * 100, 100);

  const stage = pct >= 100 ? 4
    : pct >= 75 ? 3
    : pct >= 50 ? 2
    : pct >= 25 ? 1 : 0;

  progressBar.style.width = `${pct.toFixed(1)}%`;
  renderPotStage(stage, pct >= 100);

  const remainMs = Math.max(end - now, 0);
  const h = Math.floor(remainMs / 3600000);
  const m = Math.floor((remainMs % 3600000) / 60000);

  if (pct >= 100) {
    mutationStatus.textContent = '✅ Mutation prête ! Récoltez !';
    harvestBtn.style.display = 'block';
    startMutationBtn.style.display = 'none';
    clearInterval(progressInterval);
  } else {
    mutationStatus.textContent = `🌱 Mutation en cours... ${h}h ${m}m restant (stade ${stage}/4)`;
    harvestBtn.style.display = 'none';
    startMutationBtn.style.display = 'none';
  }
}

function renderPotStage(stage, ready) {
  const stageEmojis = ['🪨', '🌱', '🌿', '🌳', '🌺'];
  const stageLabels = ['Sol préparé', 'Germination', 'Pousse', 'Croissance', 'Floraison complète'];
  const colors = ['#4a3728', '#5a7a3a', '#6a9a4a', '#4a8a3a', '#d870c0'];

  potVisual.innerHTML = `
    <div class="pot-stage stage-${stage}" style="--stage-color: ${colors[stage]}">
      <div class="pot-emoji">${stageEmojis[stage]}</div>
      <div class="pot-label">${stageLabels[stage]}</div>
      ${ready ? '<div class="pot-ready-glow"></div>' : ''}
    </div>
  `;
}

function resetPotVisual() {
  potVisual.innerHTML = `<div class="pot-stage stage-0"><div class="pot-emoji">🪴</div><div class="pot-label">Pot vide</div></div>`;
  progressBar.style.width = '0%';
  harvestBtn.style.display = 'none';
  startMutationBtn.style.display = 'block';
  mutationStatus.textContent = 'Choisissez deux espèces mères pour lancer une mutation.';
}

// ─── MUTATION EVENTS ──────────────────────────────────────────
startMutationBtn.addEventListener('click', async () => {
  const aId = Number(speciesASelect.value);
  const bId = Number(speciesBSelect.value);
  if (!aId || !bId) return;

  mutationStatus.textContent = '⏳ Lancement de la mutation...';
  startMutationBtn.disabled = true;

  const result = await startMutationPot(userId, aId, bId);

  if (result.error) {
    mutationStatus.textContent = `❌ Erreur: ${result.error}`;
    startMutationBtn.disabled = false;
    return;
  }

  activePot = result.pot;
  startMutationBtn.disabled = false;
  tickProgress();
});

harvestBtn.addEventListener('click', async () => {
  if (!activePot) return;
  harvestBtn.disabled = true;
  mutationStatus.textContent = '🎲 Résolution du gacha...';

  const result = await harvestMutation(activePot.id, userId);

  if (result.error) {
    mutationStatus.textContent = `❌ ${result.error}`;
    harvestBtn.disabled = false;
    return;
  }

  const species = result.result_species;
  const firstMsg = result.first_server_discovery ? ' 🏅 PREMIÈRE DÉCOUVERTE SERVEUR !' : '';
  mutationStatus.textContent = `🌺 Obtenu : ${species.name} (${species.rarity})${firstMsg}`;

  activePot = null;
  harvestBtn.disabled = false;
  clearInterval(progressInterval);
  await loadSpecies();
  resetPotVisual();
});

function tickProgress() {
  clearInterval(progressInterval);
  updateGrowAnimation(activePot);
  progressInterval = setInterval(() => updateGrowAnimation(activePot), 10000);
}

// ─── INIT ─────────────────────────────────────────────────────
async function init() {
  await loadSpecies();
  resetPotVisual();

  const pot = await loadActivePot(userId);
  if (pot) {
    activePot = pot;
    tickProgress();
  }
}

init();
