/**
 * lib/auth.js — Botanica auth bridge to Nitro shared auth.
 *
 * Botanica is expected to run under https://nitro.sterenna.fr/botanica/.
 * It reuses the Nitro Supabase session from /shared instead of keeping its own
 * isolated auth/config layer.
 */

import { supabase } from './supabaseClient.js';
import {
  getSession as sharedGetSession,
  getUser as sharedGetUser,
  signOut as sharedSignOut,
  onAuthChange,
} from '/shared/auth.js';
import {
  getProfile as getSharedProfile,
  getDisplayNameFromUser,
  invalidateProfileCache as invalidateSharedProfileCache,
} from '/shared/profile.js';

let _user = null;
let _session = null;
let _readyCallbacks = [];
let _ready = false;
let _profileCache = null;

async function _ensureBotanicaPlayerData(userId, profile = null) {
  // Sync display_name + avatar_url depuis le profil Nitro → leaderboard toujours à jour
  const displayName = _user ? getDisplayNameFromUser(_user, profile) : null;
  const avatarUrl   = profile?.avatar_url ?? _user?.user_metadata?.avatar_url ?? null;

  const payload = {
    user_id:     userId,
    last_active: new Date().toISOString(),
    ...(displayName ? { display_name: displayName } : {}),
    ...(avatarUrl   ? { avatar_url: avatarUrl }     : {}),
  };

  const { error } = await supabase
    .from('botanica_player_data')
    .upsert(payload, { onConflict: 'user_id', ignoreDuplicates: false });

  if (error) console.warn('[auth] botanica_player_data upsert:', error.message);
}

function _flushReadyCallbacks() {
  if (_ready) return;
  _ready = true;
  _readyCallbacks.forEach(cb => cb(_user));
  _readyCallbacks = [];
}

function _updateUI(loggedIn) {
  const authZone = document.getElementById('authZone');
  const userBadge = document.getElementById('userBadge');
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  if (!authZone) return;

  if (loggedIn && _user) {
    const name = getDisplayNameFromUser(_user, _profileCache);
    const avatar = _profileCache?.avatar_url ?? _user.user_metadata?.avatar_url;

    if (userBadge) {
      userBadge.innerHTML = `
        ${avatar ? `<img src="${avatar}" class="auth-avatar" alt="avatar" />` : '<span class="auth-avatar-placeholder">🌿</span>'}
        <span class="auth-username">${name}</span>
      `;
      userBadge.style.display = 'flex';
    }
    if (loginBtn) loginBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'inline-flex';
  } else {
    if (userBadge) userBadge.style.display = 'none';
    if (loginBtn) loginBtn.style.display = 'inline-flex';
    if (logoutBtn) logoutBtn.style.display = 'none';
  }
}

async function _hydrateSession() {
  _session = await sharedGetSession();
  _user = _session?.user ?? await sharedGetUser();

  if (_user) {
    _profileCache = await getSharedProfile(_user.id);
    await _ensureBotanicaPlayerData(_user.id, _profileCache);
    _updateUI(true);
  } else {
    _profileCache = null;
    _updateUI(false);
  }

  _flushReadyCallbacks();
  return _session;
}

export async function getProfile(forceRefresh = false) {
  if (!_user) await _hydrateSession();
  if (!_user) return null;

  if (forceRefresh) {
    invalidateSharedProfileCache();
    _profileCache = null;
  }

  if (_profileCache && !forceRefresh) return _profileCache;
  _profileCache = await getSharedProfile(_user.id, forceRefresh);
  return _profileCache;
}

export function invalidateProfileCache() {
  _profileCache = null;
  invalidateSharedProfileCache();
}

export async function requireAuth(redirectTo = '/login.html') {
  const session = await _hydrateSession();

  if (!session) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `${redirectTo}?next=${next}`;
    return null;
  }

  const profile = await getProfile();
  return { user: _user, session: _session, profile };
}

// Compatibility helpers: Botanica no longer owns signup/login UI.
// Login is centralized through Nitro at /login.html.
export function openAuthModal() {
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/login.html?next=${next}`;
}

export function closeAuthModal() {}

export async function submitAuth() {
  openAuthModal();
  return false;
}

export async function signOut() {
  await sharedSignOut('/login.html');
}

export function currentUser() { return _user; }
export function currentSession() { return _session; }
export function isLoggedIn() { return !!_user; }

export function onAuthReady(cb) {
  if (_ready) cb(_user);
  else _readyCallbacks.push(cb);
}

export function getBotanicaUserId() {
  if (_user) return _user.id;
  return null;
}

onAuthChange(async (_sessionFromEvent) => {
  await _hydrateSession();
});

_hydrateSession();
