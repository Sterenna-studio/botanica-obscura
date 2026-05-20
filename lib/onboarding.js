import { supabase } from './supabaseClient.js';

const STARTER_SPECIES_IDS = [1, 2, 3]; // IDs Tier 1 common à offrir

/**
 * Vérifie si le joueur a besoin de l'onboarding
 * (jamais reçu de graines de départ)
 */
export async function needsOnboarding(userId) {
  const { data } = await supabase
    .from('player_seeds')
    .select('id')
    .eq('user_id', userId)
    .limit(1);
  return !data || data.length === 0;
}

/**
 * Offre 3 graines de départ au nouveau joueur
 */
export async function runOnboardingGrant(userId) {
  const rows = STARTER_SPECIES_IDS.map(speciesId => ({
    user_id: userId,
    species_id: speciesId,
    quantity: 2,
  }));

  const { error } = await supabase
    .from('player_seeds')
    .upsert(rows, { onConflict: 'user_id,species_id', ignoreDuplicates: false });

  if (error) console.error('[onboarding] grant error:', error);
  return !error;
}

/**
 * Affiche l'overlay tutoriel en 3 étapes
 */
export function showOnboardingTutorial(onClose) {
  const steps = [
    {
      emoji: '🌱',
      title: 'Bienvenue dans Botanica Obscura !',
      text: 'Tu viens de recevoir <strong>6 graines de départ</strong> (2 de chaque espèce Tier 1). Elles apparaissent dans ton <strong>Inventaire</strong> en bas de page.',
    },
    {
      emoji: '🧪',
      title: 'Lance ta première mutation',
      text: 'Dans la section <strong>Pots de mutation</strong>, sélectionne une Espèce A et une Espèce B, puis clique sur <strong>Lancer</strong>. La mutation dure quelques heures.',
    },
    {
      emoji: '🏅',
      title: 'Découvre et collecte',
      text: 'Quand la mutation est prête, <strong>Récolte</strong> ta plante. Elle rejoint ton Codex. Sois le premier à découvrir une espèce sur le serveur pour gagner un badge !',
    },
  ];

  let currentStep = 0;

  // Injecte l'overlay s'il n'existe pas
  let overlay = document.getElementById('onboarding-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'onboarding-overlay';
    overlay.className = 'onboarding-overlay';
    document.body.appendChild(overlay);
  }

  function render() {
    const step = steps[currentStep];
    const isLast = currentStep === steps.length - 1;
    overlay.innerHTML = `
      <div class="onboarding-card">
        <div class="onboarding-emoji">${step.emoji}</div>
        <div class="onboarding-step-indicator">
          ${steps.map((_, i) => `<span class="onboarding-dot${i === currentStep ? ' active' : ''}"></span>`).join('')}
        </div>
        <h2 class="onboarding-title">${step.title}</h2>
        <p class="onboarding-text">${step.text}</p>
        <div class="onboarding-actions">
          ${currentStep > 0 ? '<button id="onboarding-prev" class="onboarding-btn secondary">← Retour</button>' : ''}
          <button id="onboarding-next" class="onboarding-btn primary">
            ${isLast ? '🌿 Commencer !' : 'Suivant →'}
          </button>
        </div>
      </div>
    `;
    document.getElementById('onboarding-next').onclick = () => {
      if (isLast) {
        overlay.remove();
        if (onClose) onClose();
      } else {
        currentStep++;
        render();
      }
    };
    const prevBtn = document.getElementById('onboarding-prev');
    if (prevBtn) prevBtn.onclick = () => { currentStep--; render(); };
  }

  render();
}

/**
 * Point d'entrée principal — à appeler dans init() après auth
 */
export async function initOnboarding(userId, onDone) {
  const required = await needsOnboarding(userId);
  if (!required) return;
  const granted = await runOnboardingGrant(userId);
  if (granted) showOnboardingTutorial(onDone);
}
