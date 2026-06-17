/**
 * lib/stats.js — Statistiques de jeu (locales)
 *
 * Suit l'activité du joueur : récoltes, qualités obtenues, graines droppées,
 * mutations lancées, fleurs vendues. Stocké dans le save local (clé `stats`).
 * Sert au panneau « 📊 Statistiques » et aux quêtes.
 */

import { loadLocal, patchLocal } from './localSave.js';
import { QUALITY_TIERS } from './quality.js';

const DEFAULT_STATS = {
  totalHarvests:     0,
  totalFlowers:      0,
  totalSeeds:        0,
  totalVarietySeeds: 0,
  mutationsLaunched: 0,
  flowersSold:       0,
  coinsEarned:       0,
  byQuality:         [0, 0, 0, 0, 0],
  bestQuality:       -1,
};

export function loadStats() {
  const raw = loadLocal()?.stats ?? {};
  const byQuality = Array.isArray(raw.byQuality)
    ? [0, 1, 2, 3, 4].map(i => Number(raw.byQuality[i] ?? 0))
    : [...DEFAULT_STATS.byQuality];
  return { ...DEFAULT_STATS, ...raw, byQuality };
}

function save(stats) {
  patchLocal('stats', stats);
}

export function recordHarvest({ qualityTierId = 1, flowerQty = 0, seedCount = 0, varietySeedCount = 0 } = {}) {
  const s = loadStats();
  s.totalHarvests     += 1;
  s.totalFlowers      += Math.max(0, flowerQty);
  s.totalSeeds        += Math.max(0, seedCount);
  s.totalVarietySeeds += Math.max(0, varietySeedCount);
  const q = Math.min(4, Math.max(0, qualityTierId));
  s.byQuality[q]      += 1;
  if (q > s.bestQuality) s.bestQuality = q;
  save(s);
  return s;
}

export function recordMutationLaunched(n = 1) {
  const s = loadStats();
  s.mutationsLaunched += Math.max(0, n);
  save(s);
  return s;
}

export function recordSale({ count = 0, coins = 0 } = {}) {
  const s = loadStats();
  s.flowersSold += Math.max(0, count);
  s.coinsEarned += Math.max(0, coins);
  save(s);
  return s;
}

// ── Rendu UI ───────────────────────────────────────────────────────────────
export function renderStats() {
  const container = document.getElementById('statsContainer');
  if (!container) return;
  const s = loadStats();

  const bestLabel = s.bestQuality >= 0
    ? (QUALITY_TIERS[s.bestQuality]?.label ?? '—')
    : '—';

  const qualityRows = QUALITY_TIERS.map(t => {
    const n = s.byQuality[t.id] ?? 0;
    const pct = s.totalHarvests > 0 ? Math.round((n / s.totalHarvests) * 100) : 0;
    return `
      <div class="stat-quality-row">
        <span class="stat-quality-label" style="color:${t.color}">${t.label}</span>
        <span class="stat-quality-bar"><span style="width:${pct}%;background:${t.color}"></span></span>
        <span class="stat-quality-count">${n}</span>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-num">${s.totalHarvests}</div><div class="stat-lbl">Récoltes</div></div>
      <div class="stat-card"><div class="stat-num">🌸 ${s.totalFlowers}</div><div class="stat-lbl">Fleurs récoltées</div></div>
      <div class="stat-card"><div class="stat-num">🌱 ${s.totalSeeds}</div><div class="stat-lbl">Graines droppées</div></div>
      <div class="stat-card"><div class="stat-num">🧬 ${s.totalVarietySeeds}</div><div class="stat-lbl">Graines de variété</div></div>
      <div class="stat-card"><div class="stat-num">🧪 ${s.mutationsLaunched}</div><div class="stat-lbl">Mutations lancées</div></div>
      <div class="stat-card"><div class="stat-num">💰 ${s.coinsEarned}</div><div class="stat-lbl">Pièces gagnées (ventes)</div></div>
    </div>
    <div class="stats-best">Meilleure qualité : <strong>${bestLabel}</strong></div>
    <div class="stats-quality-breakdown">
      <div class="stats-subtitle">Répartition des qualités</div>
      ${qualityRows}
    </div>`;
}
