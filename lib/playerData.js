// lib/playerData.js — Chargement/mise à jour des données joueur (coins, level, xp)
import { supabase } from '../app.js';
import { resolveLevel } from './xp.js';

export async function loadPlayerData(userId) {
  const { data, error } = await supabase
    .from('botanica_player_data')
    .select('coins, level, xp, display_name, avatar_url')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return { coins: 0, level: 1, xp: 0 };
  return data;
}

// ── Rendu header ──────────────────────────────────────────────────────────
export function renderPlayerStats(playerData) {
  const coinsEl   = document.getElementById('coins');
  const levelEl   = document.getElementById('level');
  const xpBarEl   = document.getElementById('xp-bar-fill');
  const xpTextEl  = document.getElementById('xp-text');

  if (coinsEl) coinsEl.textContent = `🪙 ${(playerData.coins ?? 0).toLocaleString()}`;

  const totalXp = playerData.xp ?? 0;
  const { level, currentLevelXp, nextLevelXp, progress } = resolveLevel(totalXp);

  if (levelEl) levelEl.textContent = `Lv. ${level}`;

  if (xpBarEl) xpBarEl.style.width = `${progress.toFixed(1)}%`;
  if (xpTextEl) {
    xpTextEl.textContent = nextLevelXp
      ? `${currentLevelXp} / ${nextLevelXp} XP`
      : `${totalXp} XP (MAX)`;
  }
}
