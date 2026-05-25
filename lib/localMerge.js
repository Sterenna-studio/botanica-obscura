/**
 * lib/localMerge.js — Merge save locale → Supabase au login
 *
 * Appelé depuis auth.js juste après que l'user est authentifié.
 * Affiche une bannière non-bloquante proposant d'importer la save locale.
 * Sur confirmation : upsert playerData + seeds + codexIds dans Supabase.
 * Ensuite (ou sur refus) : clearLocal().
 */

import { supabase }          from '../app.js';
import { loadLocal, clearLocal, hasLocalSave } from './localSave.js';

// ── Styles injectés une seule fois ─────────────────────────────────────────
function _injectStyles() {
  if (document.getElementById('lm-style')) return;
  const style = document.createElement('style');
  style.id = 'lm-style';
  style.textContent = `
    #lm-banner {
      position: fixed;
      bottom: 1.25rem;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      background: #1c1c19;
      border: 1px solid rgba(111,179,138,.35);
      border-radius: .75rem;
      padding: .9rem 1.2rem;
      display: flex;
      align-items: center;
      gap: .75rem;
      box-shadow: 0 8px 32px rgba(0,0,0,.55);
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: .875rem;
      color: #d8d6d0;
      max-width: min(92vw, 460px);
      animation: lm-slide-in 250ms cubic-bezier(.16,1,.3,1) both;
    }
    @keyframes lm-slide-in {
      from { opacity:0; transform: translateX(-50%) translateY(12px); }
      to   { opacity:1; transform: translateX(-50%) translateY(0); }
    }
    #lm-banner .lm-icon  { font-size: 1.3rem; flex-shrink: 0; }
    #lm-banner .lm-msg   { flex: 1; line-height: 1.4; }
    #lm-banner .lm-msg strong { color: #6fb38a; }
    #lm-banner .lm-actions { display: flex; gap: .5rem; flex-shrink: 0; }
    #lm-banner .lm-btn {
      padding: .35rem .8rem;
      border-radius: .45rem;
      border: 1px solid transparent;
      font-size: .8rem;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 120ms ease;
    }
    #lm-btn-yes  { background: #2e4a38; color: #6fb38a; border-color: rgba(111,179,138,.3); }
    #lm-btn-skip { background: transparent; color: #6e6d68; border-color: rgba(255,255,255,.1); }
    #lm-btn-yes:hover  { opacity: .8; }
    #lm-btn-skip:hover { color: #d8d6d0; }
    #lm-banner.lm-loading .lm-actions { pointer-events: none; opacity: .5; }
    #lm-banner.lm-done { border-color: rgba(111,179,138,.6); }
  `;
  document.head.appendChild(style);
}

function _removeBanner() {
  document.getElementById('lm-banner')?.remove();
}

function _showBanner() {
  _injectStyles();
  _removeBanner();

  const el = document.createElement('div');
  el.id = 'lm-banner';
  el.innerHTML = `
    <span class="lm-icon">💾</span>
    <div class="lm-msg">
      <strong>Save locale détectée</strong><br>
      Importer ta progression dans ton compte ?
    </div>
    <div class="lm-actions">
      <button id="lm-btn-yes"  class="lm-btn">Importer</button>
      <button id="lm-btn-skip" class="lm-btn">Ignorer</button>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}

// ── Merge Supabase ──────────────────────────────────────────────────────────
async function _mergeToCloud(userId, localSave) {
  const errors = [];

  // 1. playerData — upsert coins / xp / level / pot_slots
  if (localSave.playerData && Object.keys(localSave.playerData).length) {
    const { error } = await supabase
      .from('botanica_player_data')
      .upsert(
        { user_id: userId, ...localSave.playerData },
        { onConflict: 'user_id', ignoreDuplicates: false }
      );
    if (error) errors.push('playerData: ' + error.message);
  }

  // 2. Seeds — upsert chaque espèce
  if (localSave.seeds?.length) {
    const rows = localSave.seeds
      .filter(s => s.quantity > 0)
      .map(s => ({ user_id: userId, species_id: s.species_id, quantity: s.quantity }));

    if (rows.length) {
      const { error } = await supabase
        .from('botanica_player_seeds')
        .upsert(rows, { onConflict: 'user_id,species_id', ignoreDuplicates: false });
      if (error) errors.push('seeds: ' + error.message);
    }
  }

  // 3. Codex — insert uniquement les nouvelles espèces (ignore les doublons)
  if (localSave.codexIds?.length) {
    const rows = localSave.codexIds.map(id => ({ user_id: userId, species_id: id }));
    const { error } = await supabase
      .from('botanica_player_codex')
      .upsert(rows, { onConflict: 'user_id,species_id', ignoreDuplicates: true });
    if (error) errors.push('codex: ' + error.message);
  }

  return errors;
}

// ── Point d'entrée public ───────────────────────────────────────────────────
/**
 * À appeler depuis auth.js après authentification.
 * @param {string} userId
 */
export async function offerLocalMerge(userId) {
  if (!hasLocalSave()) return;

  const localSave = loadLocal();
  if (!localSave) return;

  return new Promise(resolve => {
    const banner = _showBanner();

    const btnYes  = document.getElementById('lm-btn-yes');
    const btnSkip = document.getElementById('lm-btn-skip');

    btnYes.addEventListener('click', async () => {
      banner.classList.add('lm-loading');
      btnYes.textContent = '⏳';

      const errors = await _mergeToCloud(userId, localSave);

      clearLocal();
      _removeBanner();

      if (errors.length) {
        console.warn('[localMerge] Erreurs partielles :', errors);
      }

      resolve({ merged: true, errors });
    });

    btnSkip.addEventListener('click', () => {
      clearLocal();
      _removeBanner();
      resolve({ merged: false, errors: [] });
    });
  });
}
