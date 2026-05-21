/**
 * lib/localSave.js — Save locale Botanica Obscura
 * Stocke un snapshot du state joueur dans localStorage.
 * Utilisé comme fallback si Supabase est injoignable, ou si le joueur
 * n'est pas connecté (mode anonyme).
 *
 * Structure du save :
 * {
 *   version: 1,
 *   savedAt: ISO string,
 *   userId: string | null,          // null = anonyme
 *   playerData: { coins, xp, level, pot_slots },
 *   seeds: [{ species_id, quantity }],
 *   codexIds: number[],
 *   garden: {},
 *   pots: [],
 *   mysterySeedLastClaim: ISO string | null,
 * }
 */

const SAVE_KEY    = 'botanica_local_save';
const SAVE_VERSION = 1;

/** Sauvegarde un snapshot complet de l'état courant */
export function saveLocal(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      version:              SAVE_VERSION,
      savedAt:              new Date().toISOString(),
      userId:               state.userId ?? null,
      playerData:           state.playerData ?? {},
      seeds:                state.seeds ?? [],
      codexIds:             state.codexIds ?? [],
      garden:               state.garden ?? {},
      pots:                 state.pots ?? [],
      mysterySeedLastClaim: state.mysterySeedLastClaim ?? null,
    }));
  } catch (e) {
    console.warn('[localSave] Impossible d\'écrire :', e);
  }
}

/** Charge le save local. Retourne null si inexistant ou corrompu. */
export function loadLocal() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== SAVE_VERSION) return null;
    return data;
  } catch {
    return null;
  }
}

/** Supprime le save local (après merge cloud réussi) */
export function clearLocal() {
  localStorage.removeItem(SAVE_KEY);
}

/** Retourne true si un save local non-cloud existe */
export function hasLocalSave() {
  const save = loadLocal();
  return !!save;
}

/**
 * Met à jour un sous-champ du save local sans tout écraser.
 * Exemple : patchLocal('playerData', { coins: 150 })
 */
export function patchLocal(key, value) {
  const current = loadLocal() ?? {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    userId: null,
    playerData: {},
    seeds: [],
    codexIds: [],
    garden: {},
    pots: [],
    mysterySeedLastClaim: null,
  };
  current[key]    = value;
  current.savedAt = new Date().toISOString();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(current));
  } catch (e) {
    console.warn('[localSave] patchLocal échoué :', e);
  }
}
