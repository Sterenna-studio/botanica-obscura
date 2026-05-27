/**
 * tabs.js — Navigation par onglets pour Botanica Obscura
 * Vanilla JS, aucune dépendance.
 */

export function initTabs() {
  const tabs    = document.querySelectorAll('.tab-btn');
  const panels  = document.querySelectorAll('.tab-panel');

  if (!tabs.length) return;

  function activate(id) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === id));
    panels.forEach(p => p.classList.toggle('active', p.dataset.tab === id));
    try { localStorage.setItem('botanica_tab', id); } catch {}
  }

  tabs.forEach(t => t.addEventListener('click', () => activate(t.dataset.tab)));

  // Restaure l'onglet précédent ou ouvre Labo par défaut
  const saved = (() => { try { return localStorage.getItem('botanica_tab'); } catch { return null; } })();
  const first = saved && document.querySelector(`[data-tab="${saved}"]`) ? saved : 'lab';
  activate(first);
}
