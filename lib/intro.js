import { createPlantCharacterSvg } from './plantSvg.js';
import { getFallbackSpeciesTree } from './speciesTree.js';

const INTRO_SKIP_KEY = 'botanica_intro_skip_forever';

const INTRO_STEPS = [
  {
    title: 'Sous la verriere',
    text: 'La serre s ouvre avant l aube. Dans la terre noire, quelques especes anciennes attendent un nouveau gardien.',
    speciesId: 4,
  },
  {
    title: 'Pousses obscures',
    text: 'Chaque croisement laisse une trace: couleur, rarete, temperament. Les plantes revelent leur lignee par patience.',
    speciesId: 15,
  },
  {
    title: 'Premier souffle',
    text: 'Le jardin retient les noms des botanistes qui trouvent une forme inconnue avant tous les autres.',
    speciesId: 17,
  },
];

export function shouldSkipIntro() {
  return localStorage.getItem(INTRO_SKIP_KEY) === '1';
}

export function showIntroIfNeeded() {
  if (shouldSkipIntro()) return Promise.resolve(false);
  return showIntro();
}

function showIntro() {
  return new Promise(resolve => {
    let stepIndex = 0;
    const speciesList = getFallbackSpeciesTree();
    const overlay = document.createElement('div');
    overlay.className = 'intro-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'intro-title');
    document.body.appendChild(overlay);

    function close(skipped) {
      const skipForever = overlay.querySelector('#intro-skip-forever')?.checked;
      if (skipForever) localStorage.setItem(INTRO_SKIP_KEY, '1');
      document.removeEventListener('keydown', onKeyDown);
      overlay.classList.add('intro-overlay--leaving');
      setTimeout(() => overlay.remove(), 180);
      resolve(!skipped);
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') close(true);
      if (event.key === 'ArrowRight') nextStep();
      if (event.key === 'ArrowLeft') previousStep();
    }

    function nextStep() {
      if (stepIndex >= INTRO_STEPS.length - 1) {
        close(false);
        return;
      }
      stepIndex += 1;
      render();
    }

    function previousStep() {
      stepIndex = Math.max(0, stepIndex - 1);
      render();
    }

    function render() {
      const step = INTRO_STEPS[stepIndex];
      const species = speciesList.find(item => item.id === step.speciesId) ?? speciesList[0];
      const isLast = stepIndex === INTRO_STEPS.length - 1;
      const skipForever = overlay.querySelector('#intro-skip-forever')?.checked ?? false;

      overlay.innerHTML = `
        <div class="intro-card">
          <div class="intro-scene" aria-hidden="true">
            <div class="intro-plant">${createPlantCharacterSvg(species)}</div>
            <div class="intro-floor"></div>
          </div>
          <div class="intro-copy">
            <div class="intro-kicker">Botanica Obscura</div>
            <h2 id="intro-title">${step.title}</h2>
            <p>${step.text}</p>
          </div>
          <div class="intro-progress" aria-label="Progression de l'intro">
            ${INTRO_STEPS.map((_, index) => `<span class="intro-dot${index === stepIndex ? ' active' : ''}"></span>`).join('')}
          </div>
          <label class="intro-skip-option">
            <input type="checkbox" id="intro-skip-forever" ${skipForever ? 'checked' : ''}>
            <span>Toujours passer cette intro</span>
          </label>
          <div class="intro-actions">
            <button type="button" class="intro-btn intro-btn-secondary" data-action="skip">Passer</button>
            ${stepIndex > 0 ? '<button type="button" class="intro-btn intro-btn-ghost" data-action="previous">Retour</button>' : ''}
            <button type="button" class="intro-btn intro-btn-primary" data-action="next">${isLast ? 'Entrer dans la serre' : 'Suivant'}</button>
          </div>
        </div>
      `;

      overlay.querySelector('[data-action="skip"]')?.addEventListener('click', () => close(true));
      overlay.querySelector('[data-action="previous"]')?.addEventListener('click', previousStep);
      overlay.querySelector('[data-action="next"]')?.addEventListener('click', nextStep);
      overlay.querySelector('.intro-btn-primary')?.focus();
    }

    document.addEventListener('keydown', onKeyDown);
    render();
  });
}
