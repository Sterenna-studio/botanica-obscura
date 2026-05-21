/**
 * lib/auth.js — Authentification Supabase pour Botanica Obscura
 */

import { supabase } from './supabaseClient.js';

let _user = null;
let _session = null;
let _readyCallbacks = [];
let _ready = false;

// ── Cache du profil partagé ──────────────────────────────────────────────────
let _profileCache = null;
let _profileFetchPromise = null;

/**
 * Récupère le profil Supabase de l'utilisateur courant.
 * Un seul appel réseau est effectué, le résultat est mis en cache.
 * Tous les modules doivent utiliser cette fonction plutôt que de
 * requêter /rest/v1/profiles directement.
 *
 * @param {boolean} forceRefresh — invalide le cache et refait un appel
 * @returns {Promise<object|null>}
 */
export async function getProfile(forceRefresh = false) {
  if (!_user) return null;
  if (_profileCache && !forceRefresh) return _profileCache;

  // Déduplique les appels simultanés : si un fetch est déjà en cours, on attend
  if (_profileFetchPromise) return _profileFetchPromise;

  _profileFetchPromise = supabase
    .from('profiles')
    .select('*')
    .eq('id', _user.id)
    .single()
    .then(({ data, error }) => {
      _profileFetchPromise = null;
      if (error) {
        console.warn('[auth] getProfile:', error.message);
        return null;
      }
      _profileCache = data;
      return data;
    });

  return _profileFetchPromise;
}

/** Invalide le cache profil (après une mise à jour) */
export function invalidateProfileCache() {
  _profileCache = null;
}

// ── Écoute des changements de session ───────────────────────────────────────
supabase.auth.onAuthStateChange(async (event, session) => {
  _session = session;
  _user    = session?.user ?? null;

  // Invalide le cache si l'utilisateur change
  invalidateProfileCache();

  if (_user) {
    await _ensureBotanicaPlayerData(_user.id);
    _updateUI(true);
  } else {
    _updateUI(false);
  }

  if (!_ready) {
    _ready = true;
    _readyCallbacks.forEach(cb => cb(_user));
    _readyCallbacks = [];
  }
});

// ── Garantit l'existence d'une ligne botanica_player_data ─────────────────
async function _ensureBotanicaPlayerData(userId) {
  const { error } = await supabase
    .from('botanica_player_data')
    .upsert({ user_id: userId, last_active: new Date().toISOString() }, {
      onConflict: 'user_id',
      ignoreDuplicates: false,
    });
  if (error) console.warn('[auth] botanica_player_data upsert:', error.message);
}

// ── Mise à jour de l'UI header ─────────────────────────────────────────────
function _updateUI(loggedIn) {
  const authZone   = document.getElementById('authZone');
  const userBadge  = document.getElementById('userBadge');
  const loginBtn   = document.getElementById('loginBtn');
  const logoutBtn  = document.getElementById('logoutBtn');
  if (!authZone) return;

  if (loggedIn) {
    const meta = _user.user_metadata;
    const name = meta?.username ?? meta?.full_name ?? _user.email?.split('@')[0] ?? 'Botaniste';
    const avatar = meta?.avatar_url;
    userBadge.innerHTML = `
      ${avatar ? `<img src="${avatar}" class="auth-avatar" alt="avatar" />` : '<span class="auth-avatar-placeholder">🌿</span>'}
      <span class="auth-username">${name}</span>
    `;
    userBadge.style.display = 'flex';
    loginBtn.style.display  = 'none';
    logoutBtn.style.display = 'inline-flex';
  } else {
    userBadge.style.display  = 'none';
    loginBtn.style.display   = 'inline-flex';
    logoutBtn.style.display  = 'none';
  }
}

// ── Modal login / signup ───────────────────────────────────────────────────
export function openAuthModal(mode = 'login') {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.dataset.mode = mode;
  document.getElementById('authModalTitle').textContent =
    mode === 'signup' ? '🌱 Créer un compte' : '🔑 Se connecter';
  document.getElementById('authError').textContent = '';
  modal.classList.add('open');
}

export function closeAuthModal() {
  document.getElementById('authModal')?.classList.remove('open');
}

export async function submitAuth(email, password, username) {
  const modal = document.getElementById('authModal');
  const mode  = modal?.dataset.mode ?? 'login';
  const errEl = document.getElementById('authError');
  errEl.textContent = '';

  if (mode === 'signup') {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: username || email.split('@')[0] } },
    });
    if (error) { errEl.textContent = error.message; return false; }
    errEl.style.color = 'var(--accent)';
    errEl.textContent = '✅ Compte créé ! Vérifie tes e-mails pour confirmer.';
    return true;
  } else {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { errEl.textContent = error.message; return false; }
    closeAuthModal();
    return true;
  }
}

export async function signOut() {
  await supabase.auth.signOut();
}

// ── API publique ─────────────────────────────────────────────────────────────────
export function currentUser()    { return _user; }
export function currentSession() { return _session; }
export function isLoggedIn()     { return !!_user; }

export function onAuthReady(cb) {
  if (_ready) cb(_user);
  else _readyCallbacks.push(cb);
}

export function getBotanicaUserId() {
  if (_user) return _user.id;
  let anonId = localStorage.getItem('botanica_anon_id');
  if (!anonId) { anonId = crypto.randomUUID(); localStorage.setItem('botanica_anon_id', anonId); }
  return anonId;
}
