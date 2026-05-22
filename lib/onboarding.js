import { supabase } from './supabaseClient.js';
import { adjustLocalSeedQuantity, loadLocal, patchLocal } from './localSave.js';

const STARTER_POOL_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const STARTER_PICK_COUNT = 5;
const STARTER_QTY = 2;

function isValidUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str ?? '');
}

async function readOnboardingFlag(userId) {
  if (!userId || !isValidUUID(userId)) return null;

  const { data, error } = await supabase
    .from('botanica_player_data')
    .select('onboarding_completed')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[onboarding] Flag cloud indisponible, fallback local :', error.message);
    return null;
  }

  return data?.onboarding_completed === true;
}

async function markOnboardingCompleted(userId) {
  patchLocal('onboardingCompleted', true);

  if (!userId || !isValidUUID(userId)) return;

  const { error } = await supabase
    .from('botanica_player_data')
    .upsert(
      {
        user_id: userId,
        onboarding_completed: true,
        last_active: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (error) {
    console.warn('[onboarding] Impossible de persister le flag cloud :', error.message);
  }
}

export async function needsOnboarding(userId) {
  const localFlag = loadLocal()?.onboardingCompleted === true;
  const cloudFlag = await readOnboardingFlag(userId);

  if (cloudFlag === true || localFlag === true) return false;

  // Compatibilité avec les anciens joueurs V0.2 : s'ils ont déjà un inventaire,
  // on considère l'onboarding comme terminé et on persiste le flag.
  const { data } = await supabase
    .from('botanica_player_seeds')
    .select('id')
    .eq('user_id', userId)
    .limit(1);

  if (data?.length > 0) {
    await markOnboardingCompleted(userId);
    return false;
  }

  return true;
}

export async function runOnboardingGrant(userId, pickedIds) {
  const rows = pickedIds.map(speciesId => ({
    user_id: userId,
    species_id: speciesId,
    quantity: STARTER_QTY,
  }));

  rows.forEach(row => adjustLocalSeedQuantity(row.species_id, row.quantity));

  const { error } = await supabase
    .from('botanica_player_seeds')
    .upsert(rows, { onConflict: 'user_id,species_id', ignoreDuplicates: false });
  if (error) {
    console.error('[onboarding] grant error:', error);
    return false;
  }

  await markOnboardingCompleted(userId);
  return true;
}

async function loadPoolSpecies() {
  const { data, error } = await supabase
    .from('botanica_species')
    .select('id, name, description')
    .in('id', STARTER_POOL_IDS)
    .order('id', { ascending: true });
  if (error || !data?.length) {
    return STARTER_POOL_IDS.map(id => ({ id, name: `Espèce #${id}`, emoji: '🌱' }));
  }
  return data.sort(() => Math.random() - 0.5).map(sp => ({ ...sp, emoji: '🌱' }));
}

function stepIndicator(active) {
  return `
    <div class="onboarding-step-indicator">
      ${[1, 2, 3].map(i => `<span class="onboarding-dot ${i === active ? 'active' : ''}"></span>`).join('')}
    </div>`;
}

export function showOnboardingTutorial(poolSpecies, onConfirm) {
  let overlay = document.getElementById('onboarding-overlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'onboarding-overlay';
  overlay.className = 'onboarding-overlay';
  document.body.appendChild(overlay);

  const selected = new Set();

  function renderStep1() {
    overlay.innerHTML = `
      <div class="onboarding-card">
        <div class="onboarding-emoji">🌿</div>
        ${stepIndicator(1)}
        <h2 class="onboarding-title">Bienvenue dans Botanica Obscura !</h2>
        <div class="onboarding-steps-list">
          <div class="ob-rule"><span class="ob-rule-icon">🧪</span><div><strong>Mutez vos graines</strong><br>Combinez deux espèces dans un pot. Plus les espèces sont rares, plus le résultat est surprenant.</div></div>
          <div class="ob-rule"><span class="ob-rule-icon">📖</span><div><strong>Complétez le Codex</strong><br>Chaque espèce découverte en premier sur le serveur vous donne un badge exclusif 🏅.</div></div>
          <div class="ob-rule"><span class="ob-rule-icon">🪙</span><div><strong>Gagnez des pièces</strong><br>Vendez vos récoltes, faites-les goûter à vos testeurs, montez de niveau.</div></div>
        </div>
        <div class="onboarding-actions">
          <button id="ob-next" class="onboarding-btn primary">Choisir mes graines →</button>
        </div>
      </div>`;
    document.getElementById('ob-next').onclick = renderStep2;
  }

  function renderStep2() {
    overlay.innerHTML = `
      <div class="onboarding-card onboarding-card--wide">
        <div class="onboarding-emoji">🌱</div>
        ${stepIndicator(2)}
        <h2 class="onboarding-title">Choisis tes <span id="ob-pick-count">${STARTER_PICK_COUNT - selected.size}</span> graines de départ</h2>
        <p class="onboarding-text">Sélectionne exactement <strong>${STARTER_PICK_COUNT}</strong> espèces (×${STARTER_QTY} chacune). Le tier et la rareté restent cachés jusqu'à obtention.</p>
        <div class="ob-seed-grid">
          ${poolSpecies.map(sp => `
            <button class="ob-seed-card${selected.has(sp.id) ? ' selected' : ''}" data-id="${sp.id}">
              <div class="ob-seed-emoji">${sp.emoji ?? '🌱'}</div>
              <div class="ob-seed-name">${sp.name}</div>
              <div class="ob-seed-meta ob-seed-meta-hidden">Tier ? · Rareté ?</div>
            </button>`).join('')}
        </div>
        <div class="onboarding-actions">
          <button id="ob-back" class="onboarding-btn secondary">← Retour</button>
          <button id="ob-confirm" class="onboarding-btn primary" ${selected.size < STARTER_PICK_COUNT ? 'disabled' : ''}>Continuer →</button>
        </div>
      </div>`;

    document.querySelectorAll('.ob-seed-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        if (selected.has(id)) { selected.delete(id); btn.classList.remove('selected'); }
        else { if (selected.size >= STARTER_PICK_COUNT) return; selected.add(id); btn.classList.add('selected'); }
        document.getElementById('ob-pick-count').textContent = STARTER_PICK_COUNT - selected.size;
        const c = document.getElementById('ob-confirm');
        if (c) c.disabled = selected.size < STARTER_PICK_COUNT;
      });
    });
    document.getElementById('ob-back').onclick = renderStep1;
    document.getElementById('ob-confirm').onclick = async () => {
      if (selected.size < STARTER_PICK_COUNT) return;
      overlay.innerHTML = `
        <div class="onboarding-card">
          <div class="onboarding-emoji" style="animation:spin 1s linear infinite">🌿</div>
          <p class="onboarding-text" style="text-align:center;margin-top:1rem">Plantation en cours…</p>
        </div>`;
      await onConfirm([...selected]);
      renderStep3();
    };
  }

  function renderStep3() {
    overlay.innerHTML = `
      <div class="onboarding-card">
        <div class="onboarding-emoji">🧪</div>
        ${stepIndicator(3)}
        <h2 class="onboarding-title">Tes graines sont prêtes !</h2>
        <div class="onboarding-steps-list">
          <div class="ob-rule"><span class="ob-rule-icon">1️⃣</span><div>Va dans <strong>Inventaire des graines</strong> et clique sur <strong>🌱 Placer</strong> pour charger une graine dans le pot.</div></div>
          <div class="ob-rule"><span class="ob-rule-icon">2️⃣</span><div>Sélectionne <strong>deux graines</strong> dans le pot puis clique sur <strong>Lancer la mutation</strong>.</div></div>
          <div class="ob-rule"><span class="ob-rule-icon">⏳</span><div>Reviens dans <strong>12h</strong> pour récolter ta première mutation et gagner XP + pièces.</div></div>
          <div class="ob-rule"><span class="ob-rule-icon">📦</span><div>Pense aussi à récupérer ton <strong>colis mystère</strong> pour une graine bonus !</div></div>
        </div>
        <div class="onboarding-actions">
          <button id="ob-done" class="onboarding-btn primary">🌿 C'est parti !</button>
        </div>
      </div>`;
    document.getElementById('ob-done').onclick = () => overlay.remove();
  }

  renderStep1();
}

export async function initOnboarding(userId, onDone) {
  const required = await needsOnboarding(userId);
  if (!required) return;
  const poolSpecies = await loadPoolSpecies();
  showOnboardingTutorial(poolSpecies, async (pickedIds) => {
    const granted = await runOnboardingGrant(userId, pickedIds);
    if (granted && onDone) await onDone();
  });
}