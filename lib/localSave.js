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

function normalizeSeedRows(rows) {
  const bySpecies = new Map();

  for (const row of rows ?? []) {
    const speciesId = Number(row.species_id ?? row.species?.id);
    const quantity  = Number(row.quantity ?? 0);
    if (!Number.isFinite(speciesId) || speciesId <= 0) continue;
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    bySpecies.set(speciesId, (bySpecies.get(speciesId) ?? 0) + quantity);
  }

  return [...bySpecies.entries()].map(([species_id, quantity]) => ({ species_id, quantity }));
}

/** Snapshot local des graines depuis les lignes Supabase ou un format compatible. */
export function patchLocalSeeds(rows) {
  patchLocal('seeds', normalizeSeedRows(rows));
}

/** Définit la quantité locale d'une espèce, ou la retire si quantity <= 0. */
export function setLocalSeedQuantity(speciesId, quantity) {
  const id = Number(speciesId);
  const qty = Number(quantity);
  if (!Number.isFinite(id) || id <= 0) return [];

  const local = loadLocal();
  const seeds = normalizeSeedRows(local?.seeds ?? []);
  const existingIdx = seeds.findIndex(seed => seed.species_id === id);

  if (!Number.isFinite(qty) || qty <= 0) {
    if (existingIdx >= 0) seeds.splice(existingIdx, 1);
  } else if (existingIdx >= 0) {
    seeds[existingIdx] = { species_id: id, quantity: qty };
  } else {
    seeds.push({ species_id: id, quantity: qty });
  }

  patchLocal('seeds', seeds);
  return seeds;
}

/** Incrémente/décrémente une quantité locale sans requête réseau. */
export function adjustLocalSeedQuantity(speciesId, delta) {
  const id = Number(speciesId);
  const diff = Number(delta);
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(diff) || diff === 0) return [];

  const local = loadLocal();
  const seeds = normalizeSeedRows(local?.seeds ?? []);
  const existing = seeds.find(seed => seed.species_id === id);
  return setLocalSeedQuantity(id, (existing?.quantity ?? 0) + diff);
}
