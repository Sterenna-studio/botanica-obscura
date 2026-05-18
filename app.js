import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { createPlantCharacterSvg } from './lib/plantSvg.js';
import { getFallbackSpeciesTree } from './lib/speciesTree.js';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const speciesASelect = document.getElementById('speciesA');
const speciesBSelect = document.getElementById('speciesB');
const startMutationBtn = document.getElementById('startMutationBtn');
const mutationStatus = document.getElementById('mutationStatus');
const progressBar = document.getElementById('progressBar');
const codexGrid = document.getElementById('codexGrid');
const plantCharacter = document.getElementById('plantCharacter');
const plantDescription = document.getElementById('plantDescription');

let speciesList = [];
let previewSpecies = null;

async function loadSpecies() {
  const { data, error } = await supabase
    .from('species')
    .select('*')
    .order('tier', { ascending: true })
    .order('id', { ascending: true });

  if (error || !data?.length) {
    speciesList = getFallbackSpeciesTree();
  } else {
    speciesList = data;
  }

  populateSpeciesSelects();
  renderCodex();
  previewSpecies = speciesList[0] || null;
  renderPreview();
}

function populateSpeciesSelects() {
  const options = speciesList
    .map(species => `<option value="${species.id}">${species.name} — T${species.tier}</option>`)
    .join('');

  speciesASelect.innerHTML = options;
  speciesBSelect.innerHTML = options;

  speciesASelect.addEventListener('change', handlePreviewChange);
  speciesBSelect.addEventListener('change', handlePreviewChange);
}

function handlePreviewChange() {
  const selectedId = Number(speciesASelect.value);
  previewSpecies = speciesList.find(item => Number(item.id) === selectedId) || speciesList[0];
  renderPreview();
}

function renderPreview() {
  if (!previewSpecies) return;
  plantCharacter.innerHTML = createPlantCharacterSvg(previewSpecies);
  plantDescription.textContent = previewSpecies.description || 'Aucune description.';
}

function renderCodex() {
  codexGrid.innerHTML = speciesList.map(species => {
    const discoverer = species.discovered_by ? `Découverte serveur enregistrée` : 'Pas encore découverte';
    return `
      <article class="codex-card" data-id="${species.id}">
        <h3>${species.name}</h3>
        <div class="codex-meta">Tier ${species.tier} • ${species.rarity}</div>
        <p>${species.description || ''}</p>
        <div class="codex-meta">${discoverer}</div>
      </article>
    `;
  }).join('');

  document.querySelectorAll('.codex-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = Number(card.dataset.id);
      previewSpecies = speciesList.find(item => Number(item.id) === id) || null;
      renderPreview();
    });
  });
}

function startFakeMutationTimer() {
  const totalSeconds = 24 * 60 * 60;
  let elapsed = 0;
  mutationStatus.textContent = 'Mutation lancée. Croissance en cours...';

  const interval = setInterval(() => {
    elapsed += 60;
    const percent = Math.min((elapsed / totalSeconds) * 100, 100);
    progressBar.style.width = `${percent}%`;

    if (percent >= 100) {
      mutationStatus.textContent = 'La mutation est prête à être récoltée.';
      clearInterval(interval);
    }
  }, 250);
}

startMutationBtn.addEventListener('click', () => {
  const a = speciesASelect.value;
  const b = speciesBSelect.value;

  if (!a || !b) {
    mutationStatus.textContent = 'Choisis deux espèces mères.';
    return;
  }

  progressBar.style.width = '0%';
  startFakeMutationTimer();
});

loadSpecies();
