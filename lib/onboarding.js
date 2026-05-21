import { supabase } from './supabaseClient.js';

const STARTER_POOL_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const STARTER_PICK_COUNT = 5;
const STARTER_QTY = 2;

export async function needsOnboarding(userId) {
  const { data } = await supabase
    .from('player_seeds')
    .select('id')
    .eq('user_id', userId)
    .limit(1);
  return !data || data.length === 0;
}

export async function runOnboardingGrant(userId, pickedIds) {
  const rows = pickedIds.map(speciesId => ({
    user_id: userId,
    species_id: speciesId,
    quantity: STARTER_QTY,
  }));
  const { error } = await supabase
    .from('player_seeds')
    .upsert(rows, { onConflict: 'user_id,species_id', ignoreDuplicates: false });
  if (error) console.error('[onboarding] grant error:', error);
  return !error;
}

async function loadPoolSpecies() {
  const { data, error } = await supabase
    .from('codex_botanique_global')
    .select('id, name, emoji, tier, rarity, description')
    .in('id', STARTER_POOL_IDS)
    .order('tier', { ascending: true });
  if (error || !data?.length) {
    return STARTER_POOL_IDS.map(id => ({ id, name: `Esp\u00e8ce #${id}`, emoji: '\ud83c\udf31', tier: 0, rarity: 'common' }));
  }
  return data.sort(() => Math.random() - 0.5);
}

export function showOnboardingTutorial(poolSpecies, onConfirm) {
  let overlay = document.getElementById('onboarding-overlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'onboarding-overlay';
  overlay.className = 'onboarding-overlay';
  document.body.appendChild(overlay);

  function renderStep1() {
    overlay.innerHTML = `
      <div class="onboarding-card">
        <div class="onboarding-emoji">\ud83c\udf3f</div>
        <div class="onboarding-step-indicator">
          <span class="onboarding-dot active"></span>
          <span class="onboarding-dot"></span>
        </div>
        <h2 class="onboarding-title">Bienvenue dans Botanica Obscura !</h2>
        <div class="onboarding-steps-list">
          <div class="ob-rule"><span class="ob-rule-icon">\ud83e\uddea</span><div><strong>Mutez vos graines</strong><br>Combinez deux esp\u00e8ces dans un pot. Plus les esp\u00e8ces sont rares, plus le r\u00e9sultat est surprenant.</div></div>
          <div class="ob-rule"><span class="ob-rule-icon">\ud83d\udcd6</span><div><strong>Compl\u00e9tez le Codex</strong><br>Chaque esp\u00e8ce d\u00e9couverte en premier sur le serveur vous donne un badge exclusif \ud83c\udfc5.</div></div>
          <div class="ob-rule"><span class="ob-rule-icon">\ud83e\ude99</span><div><strong>Gagnez des pi\u00e8ces</strong><br>Vendez vos r\u00e9coltes, faites-les go\u00fbter \u00e0 vos testeurs, montez de niveau.</div></div>
          <div class="ob-rule"><span class="ob-rule-icon">\ud83c\udf31</span><div><strong>Choisissez vos graines de d\u00e9part</strong><br>\u00c0 l'\u00e9tape suivante, choisissez <strong>${STARTER_PICK_COUNT} graines</strong> parmi ${poolSpecies.length} esp\u00e8ces (\u00d7${STARTER_QTY} exemplaires chacune).</div></div>
        </div>
        <div class="onboarding-actions">
          <button id="ob-next" class="onboarding-btn primary">Choisir mes graines \u2192</button>
        </div>
      </div>`;
    document.getElementById('ob-next').onclick = renderStep2;
  }

  const selected = new Set();

  function renderStep2() {
    overlay.innerHTML = `
      <div class="onboarding-card onboarding-card--wide">
        <div class="onboarding-emoji">\ud83c\udf31</div>
        <div class="onboarding-step-indicator">
          <span class="onboarding-dot"></span>
          <span class="onboarding-dot active"></span>
        </div>
        <h2 class="onboarding-title">Choisis tes <span id="ob-pick-count">${STARTER_PICK_COUNT - selected.size}</span> graines</h2>
        <p class="onboarding-text">Clique sur exactement <strong>${STARTER_PICK_COUNT}</strong> esp\u00e8ces.</p>
        <div class="ob-seed-grid">
          ${poolSpecies.map(sp => `<button class="ob-seed-card${selected.has(sp.id) ? ' selected' : ''}" data-id="${sp.id}"><div class="ob-seed-emoji">${sp.emoji ?? '\ud83c\udf31'}</div><div class="ob-seed-name">${sp.name}</div><div class="ob-seed-meta">Tier ${sp.tier} \u00b7 <span class="rarity-badge ${sp.rarity}">${sp.rarity}</span></div></button>`).join('')}
        </div>
        <div class="onboarding-actions">
          <button id="ob-back" class="onboarding-btn secondary">\u2190 Retour</button>
          <button id="ob-confirm" class="onboarding-btn primary" ${selected.size < STARTER_PICK_COUNT ? 'disabled' : ''}>\ud83c\udf3f Commencer !</button>
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
      overlay.innerHTML = '<div class="onboarding-card"><div class="onboarding-emoji" style="animation:spin 1s linear infinite">\ud83c\udf3f</div><p class="onboarding-text" style="text-align:center;margin-top:1rem">Plantation en cours\u2026</p></div>';
      await onConfirm([...selected]);
      overlay.remove();
    };
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
