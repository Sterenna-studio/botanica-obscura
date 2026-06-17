/**
 * lib/quests.js — Bonus de connexion (streak) + quêtes journalières
 *
 * - Bonus quotidien : réclamable une fois par jour, récompense croissante avec
 *   la série (streak) de jours consécutifs, plafonnée.
 * - Quêtes journalières : 3 objectifs (récolter / lancer / vendre) qui se
 *   réinitialisent chaque jour. Chaque quête complétée se réclame pour XP+pièces.
 *
 * État stocké en local (clés `daily` et `quests`). Les récompenses XP/pièces
 * sont appliquées via grantPlayerRewards (sync cloud inclus).
 */

import { loadLocal, patchLocal } from './localSave.js';
import { grantPlayerRewards } from './xp.js';

// ── Date du jour (locale) au format YYYY-MM-DD ───────────────────────────────
function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayDiff(aKey, bKey) {
  const a = new Date(`${aKey}T00:00:00`);
  const b = new Date(`${bKey}T00:00:00`);
  return Math.round((b - a) / 86400000);
}

// ── Bonus quotidien ──────────────────────────────────────────────────────────
const DAILY_BASE_COINS = 25;
const DAILY_BASE_XP    = 15;
const DAILY_STREAK_CAP = 7; // les récompenses plafonnent à J7

function loadDaily() {
  return loadLocal()?.daily ?? { lastClaim: null, streak: 0 };
}

export function dailyReward(streak) {
  const s = Math.min(Math.max(1, streak), DAILY_STREAK_CAP);
  return { coins: DAILY_BASE_COINS + (s - 1) * 10, xp: DAILY_BASE_XP + (s - 1) * 5 };
}

export function getDailyStatus() {
  const daily = loadDaily();
  const today = todayKey();
  const claimedToday = daily.lastClaim === today;
  // Streak prévisionnel si on réclame maintenant
  let nextStreak = 1;
  if (daily.lastClaim) {
    const diff = dayDiff(daily.lastClaim, today);
    if (diff === 0)      nextStreak = daily.streak;          // déjà réclamé
    else if (diff === 1) nextStreak = (daily.streak ?? 0) + 1; // jour consécutif
    else                 nextStreak = 1;                       // série cassée
  }
  return {
    claimedToday,
    currentStreak: daily.streak ?? 0,
    nextStreak,
    reward: dailyReward(claimedToday ? daily.streak : nextStreak),
  };
}

export async function claimDaily(userId, playerData) {
  const status = getDailyStatus();
  if (status.claimedToday) return { error: 'Déjà réclamé aujourd’hui.' };

  const reward = dailyReward(status.nextStreak);
  const result = await grantPlayerRewards(userId, playerData, reward);

  patchLocal('daily', { lastClaim: todayKey(), streak: status.nextStreak });
  return { ...result, reward, streak: status.nextStreak };
}

// ── Quêtes journalières ────────────────────────────────────────────────────
export const QUEST_DEFS = [
  { id: 'harvest3', event: 'harvest', target: 3, label: 'Récolter 3 plantes', emoji: '🌸', reward: { xp: 40, coins: 30 } },
  { id: 'launch2',  event: 'launch',  target: 2, label: 'Lancer 2 mutations',  emoji: '🧪', reward: { xp: 25, coins: 20 } },
  { id: 'sell5',    event: 'sell',    target: 5, label: 'Vendre 5 fleurs',     emoji: '💰', reward: { xp: 30, coins: 25 } },
];

function freshQuestState() {
  return { day: todayKey(), progress: {}, claimed: {} };
}

function loadQuestState() {
  const raw = loadLocal()?.quests;
  if (!raw || raw.day !== todayKey()) {
    const fresh = freshQuestState();
    patchLocal('quests', fresh);
    return fresh;
  }
  return { day: raw.day, progress: { ...(raw.progress ?? {}) }, claimed: { ...(raw.claimed ?? {}) } };
}

export function getQuests() {
  const state = loadQuestState();
  return QUEST_DEFS.map(def => {
    const progress  = Math.min(state.progress[def.id] ?? 0, def.target);
    const completed = progress >= def.target;
    const claimed   = !!state.claimed[def.id];
    return { ...def, progress, completed, claimed };
  });
}

/**
 * Incrémente la progression de toutes les quêtes liées à un type d'événement.
 * @param {'harvest'|'launch'|'sell'} eventType
 * @param {number} amount
 */
export function recordQuestEvent(eventType, amount = 1) {
  const state = loadQuestState();
  let changed = false;
  for (const def of QUEST_DEFS) {
    if (def.event !== eventType) continue;
    if (state.claimed[def.id]) continue;
    const current = state.progress[def.id] ?? 0;
    if (current >= def.target) continue;
    state.progress[def.id] = Math.min(def.target, current + Math.max(0, amount));
    changed = true;
  }
  if (changed) patchLocal('quests', state);
  return getQuests();
}

export async function claimQuest(questId, userId, playerData) {
  const state = loadQuestState();
  const def = QUEST_DEFS.find(q => q.id === questId);
  if (!def) return { error: 'Quête inconnue.' };
  if (state.claimed[questId]) return { error: 'Récompense déjà réclamée.' };
  if ((state.progress[questId] ?? 0) < def.target) return { error: 'Quête non terminée.' };

  const result = await grantPlayerRewards(userId, playerData, def.reward);
  state.claimed[questId] = true;
  patchLocal('quests', state);
  return { ...result, reward: def.reward };
}

// ── Rendu UI ───────────────────────────────────────────────────────────────
export function renderDaily(playerData, onClaim) {
  const container = document.getElementById('dailyContainer');
  if (!container) return;
  const status = getDailyStatus();
  const r = status.reward;

  container.innerHTML = `
    <div class="daily-card ${status.claimedToday ? 'daily-claimed' : 'daily-ready'}">
      <div class="daily-streak">🔥 Série : <strong>${status.claimedToday ? status.currentStreak : status.nextStreak} jour${(status.claimedToday ? status.currentStreak : status.nextStreak) > 1 ? 's' : ''}</strong></div>
      <div class="daily-reward">${status.claimedToday ? 'Reviens demain pour continuer ta série !' : `Récompense du jour : <strong>+${r.coins} 🪙 · +${r.xp} XP</strong>`}</div>
      <button class="daily-claim-btn" ${status.claimedToday ? 'disabled' : ''}>
        ${status.claimedToday ? '✓ Réclamé' : '🎁 Réclamer'}
      </button>
    </div>`;

  const btn = container.querySelector('.daily-claim-btn:not([disabled])');
  if (btn) btn.addEventListener('click', () => onClaim());
}

export function renderQuests(playerData, onClaim) {
  const container = document.getElementById('questsContainer');
  if (!container) return;
  const quests = getQuests();

  container.innerHTML = quests.map(q => {
    const pct = Math.round((q.progress / q.target) * 100);
    const btn = q.claimed
      ? `<span class="quest-done">✓ Fait</span>`
      : q.completed
        ? `<button class="quest-claim-btn" data-quest-id="${q.id}">🎁 +${q.reward.coins}🪙 +${q.reward.xp}XP</button>`
        : `<span class="quest-progress-num">${q.progress}/${q.target}</span>`;
    return `
      <div class="quest-card ${q.claimed ? 'quest-claimed' : q.completed ? 'quest-ready' : ''}">
        <div class="quest-emoji">${q.emoji}</div>
        <div class="quest-body">
          <div class="quest-label">${q.label}</div>
          <div class="quest-bar"><span style="width:${pct}%"></span></div>
        </div>
        <div class="quest-action">${btn}</div>
      </div>`;
  }).join('');

  container.querySelectorAll('.quest-claim-btn').forEach(b => {
    b.addEventListener('click', () => onClaim(b.dataset.questId));
  });
}
