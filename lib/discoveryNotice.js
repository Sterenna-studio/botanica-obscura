import { createPlantCharacterSvg } from './plantSvg.js';

export function showDiscoveryNotice(species) {
  if (!species) return;

  let container = document.getElementById('discovery-notice-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'discovery-notice-container';
    container.className = 'discovery-notice-container';
    document.body.appendChild(container);
  }

  const notice = document.createElement('article');
  notice.className = `discovery-notice rarity-${species.rarity ?? 'common'}`;
  notice.innerHTML = `
    <div class="discovery-notice-svg">${createPlantCharacterSvg(species)}</div>
    <div class="discovery-notice-copy">
      <strong>🏅 Première découverte serveur</strong>
      <span>${species.name ?? 'Espèce inconnue'} rejoint le Codex mondial.</span>
    </div>
    <button class="discovery-notice-close" type="button" aria-label="Fermer">×</button>
  `;

  container.appendChild(notice);
  requestAnimationFrame(() => notice.classList.add('visible'));

  const close = () => {
    notice.classList.remove('visible');
    notice.addEventListener('transitionend', () => notice.remove(), { once: true });
  };
  notice.querySelector('.discovery-notice-close')?.addEventListener('click', close);
  setTimeout(close, 6800);
}
