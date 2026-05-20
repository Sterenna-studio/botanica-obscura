// lib/playerData.js — Chargement/mise à jour des données joueur
import { supabase } from '../app.js';
import { resolveLevel } from './xp.js';

export async function loadPlayerData(userId) {
  const { data, error } = await supabase
    .from('botanica_player_data')
    .select('coins, level, xp, pot_slots, display_name, avatar_url')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return { coins: 0, level: 1, xp: 0, pot_slots: 1 };
  return { ...data, pot_slots: data.pot_slots ?? 1 };
}

export function renderPlayerStats(playerData) {
  const coinsEl  = document.getElementById('coins');
  const levelEl  = document.getElementById('level');
  const xpBarEl  = document.getElementById('xp-bar-fill');
  const xpTextEl = document.getElementById('xp-text');
  const slotsEl  = document.getElementById('pot-slots-badge');

  if (coinsEl) coinsEl.textContent = `🪙 ${(playerData.coins ?? 0).toLocaleString()}`;

  const totalXp = playerData.xp ?? 0;
  const { level, currentLevelXp, nextLevelXp, progress } = resolveLevel(totalXp);

  if (levelEl)  levelEl.textContent  = `Lv. ${level}`;
  if (xpBarEl)  xpBarEl.style.width  = `${progress.toFixed(1)}%`;
  if (xpTextEl) xpTextEl.textContent = nextLevelXp
    ? `${currentLevelXp} / ${nextLevelXp} XP`
    : `${totalXp} XP (MAX)`;

  if (slotsEl) {
    const slots = playerData.pot_slots ?? 1;
    slotsEl.textContent = `🪨 ${slots} slot${slots > 1 ? 's' : ''}`;
    slotsEl.title = `Vous avez ${slots} pot${slots > 1 ? 's' : ''} de mutation disponible${slots > 1 ? 's' : ''}`;
  }
}
