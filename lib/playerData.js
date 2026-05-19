// lib/playerData.js — Chargement/mise à jour des données joueur (coins, level, xp)
import { supabase } from '../app.js';

export async function loadPlayerData(userId) {
  const { data, error } = await supabase
    .from('botanica_player_data')
    .select('coins, level, xp, display_name, avatar_url')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    return { coins: 0, level: 1, xp: 0 };
  }
  return data;
}

export function renderPlayerStats(playerData) {
  const coinsEl = document.getElementById('coins');
  const levelEl = document.getElementById('level');
  if (coinsEl) coinsEl.textContent = `🪙 ${(playerData.coins ?? 0).toLocaleString()}`;
  if (levelEl) levelEl.textContent = `Lv. ${playerData.level ?? 1}`;
}
