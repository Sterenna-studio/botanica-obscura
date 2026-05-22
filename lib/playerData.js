/**
 * lib/playerData.js — Chargement et rendu des données joueur
 * Priorité : Supabase (si connecté) → localStorage (fallback)
 */
import { supabase } from './supabaseClient.js';
import { loadLocal, patchLocal } from './localSave.js';
import { resolveLevel } from './xp.js';

const DEFAULT_DATA = { coins: 0, xp: 0, level: 1, pot_slots: 1 };

/**
 * Charge les données joueur.
 * 1. Si userId est un vrai UUID Supabase → fetch cloud
 * 2. Si erreur réseau ou anon UUID → charge depuis localStorage
 * 3. Si rien → retourne DEFAULT_DATA
 */
export async function loadPlayerData(userId) {
  // Détecte un anon id (pas un UUID v4 Supabase réel)
  const isAnonId = !userId || userId.startsWith('anon-') || !isValidUUID(userId);

  if (!isAnonId) {
    try {
      const { data, error } = await supabase
        .from('botanica_player_data')
        .select('coins, xp, level, pot_slots, last_active')
        .eq('user_id', userId)
        .maybeSingle();

      if (!error && data) {
        // Snapshot local à jour avec les données cloud
        patchLocal('playerData', data);
        patchLocal('userId', userId);
        return data;
      }
    } catch (e) {
      console.warn('[playerData] Fetch cloud échoué, fallback local :', e);
    }
  }

  // Fallback localStorage
  const local = loadLocal();
  if (local?.playerData && Object.keys(local.playerData).length > 0) {
    console.info('[playerData] Données chargées depuis localStorage');
    return local.playerData;
  }

  return { ...DEFAULT_DATA };
}

/**
 * Persiste les données joueur :
 * - Toujours dans localStorage (snapshot)
 * - Dans Supabase si l'userId est authentifié
 */
export async function savePlayerData(userId, data) {
  patchLocal('playerData', data);

  if (!userId || !isValidUUID(userId)) return;

  try {
    await supabase
      .from('botanica_player_data')
      .upsert(
        { user_id: userId, ...data, last_active: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
  } catch (e) {
    console.warn('[playerData] Sync cloud échoué (sauvé en local) :', e);
  }
}

/** Affiche les stats dans la topbar */
export function renderPlayerStats(data) {
  const coinsEl     = document.getElementById('coins');
  const levelEl     = document.getElementById('level');
  const xpBarFill   = document.getElementById('xp-bar-fill');
  const xpText      = document.getElementById('xp-text');
  const potBadge    = document.getElementById('pot-slots-badge');

  const coins    = data.coins    ?? 0;
  const level    = data.level    ?? 1;
  const xp       = data.xp      ?? 0;
  const potSlots = data.pot_slots ?? 1;

  // Calcul progression XP dans le niveau — source unique : resolveLevel() de xp.js
  const { progress: pct, currentLevelXp, nextLevelXp } = resolveLevel(xp);
  const xpDisplay = nextLevelXp != null
    ? `${currentLevelXp} / ${nextLevelXp} XP`
    : `${xp} XP (max)`;

  if (coinsEl)   coinsEl.textContent   = `🪙 ${coins.toLocaleString('fr-FR')}`;
  if (levelEl)   levelEl.textContent   = `Lv. ${level}`;
  if (xpBarFill) xpBarFill.style.width = `${pct}%`;
  if (xpText)    xpText.textContent    = xpDisplay;
  if (potBadge)  potBadge.textContent  = `🪨 ${potSlots} slot${potSlots > 1 ? 's' : ''}`;
}

function isValidUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}
