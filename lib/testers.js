import { supabase } from '../app.js';
import { createPlantCharacterSvg } from './plantSvg.js';

const REACTIONS = {
  mythic:    { emoji: '🤩', texts: ['INCROYABLE !!', 'Je vois des étoiles !!!', 'La plante ultime...'], delta: 30 },
  legendary: { emoji: '😍', texts: ['Extraordinaire !', 'C\'est divin...', 'Jamais goûté ça !'], delta: 20 },
  epic:      { emoji: '😮', texts: ['Wow, intense !', 'Quelle saveur !', 'Épique !'], delta: 12 },
  rare:      { emoji: '😊', texts: ['Pas mal du tout !', 'J\'aime ça.', 'Sympa !'], delta: 6 },
  common:    { emoji: '😐', texts: ['Mouais...', 'Ordinaire.', 'Correct.'], delta: 2 },
};

const TESTER_NAMES = ['Gus', 'Miko', 'Zara', 'Pépé', 'Nox'];

export async function ensureTesters(userId) {
  const { data } = await supabase
    .from('botanica_testers')
    .select('*')
    .eq('user_id', userId);

  if (!data || data.length === 0) {
    const inserts = TESTER_NAMES.map(name => ({ user_id: userId, name, happiness: 50 }));
    const { data: created } = await supabase.from('botanica_testers').insert(inserts).select();
    return created || [];
  }
  return data;
}

export function renderTesters(testers, species) {
  const container = document.getElementById('testersContainer');
  if (!container) return;

  container.innerHTML = testers.map(t => `
    <div class="tester-card" id="tester-${t.id}">
      <div class="tester-face">${getTesterFace(t.happiness)}</div>
      <div class="tester-name">${t.name}</div>
      <div class="happiness-bar-wrap">
        <div class="happiness-bar" style="width:${Math.max(0, Math.min(100, t.happiness))}%"></div>
      </div>
      <div class="tester-happiness">${t.happiness}/100</div>
      ${species ? `<button class="taste-btn" data-tester-id="${t.id}">Faire goûter</button>` : '<div class="taste-hint">Récoltez une plante d\'abord</div>'}
    </div>
  `).join('');

  if (species) {
    container.querySelectorAll('.taste-btn').forEach(btn => {
      btn.addEventListener('click', e => tastePlant(e.currentTarget.dataset.testerId, testers, species));
    });
  }
}

function getTesterFace(happiness) {
  if (happiness >= 85) return '🤩';
  if (happiness >= 65) return '😊';
  if (happiness >= 40) return '😐';
  if (happiness >= 20) return '😕';
  return '😞';
}

async function tastePlant(testerId, testers, species) {
  const tester = testers.find(t => String(t.id) === String(testerId));
  if (!tester) return;

  const reaction = REACTIONS[species.rarity] || REACTIONS.common;
  const text = reaction.texts[Math.floor(Math.random() * reaction.texts.length)];
  const newHappiness = Math.min(100, tester.happiness + reaction.delta);

  const card = document.getElementById(`tester-${testerId}`);
  if (card) {
    card.classList.add('tasting');
    const bubble = document.createElement('div');
    bubble.className = 'reaction-bubble';
    bubble.innerHTML = `${reaction.emoji} <span>${text}</span>`;
    card.appendChild(bubble);
    setTimeout(() => { bubble.remove(); card.classList.remove('tasting'); }, 2500);
  }

  tester.happiness = newHappiness;
  const { error: testerErr } = await supabase
    .from('botanica_testers')
    .update({ happiness: newHappiness, last_tasted_at: new Date().toISOString() })
    .eq('id', testerId);
  if (testerErr) console.warn('[testers] Sync testeur échouée :', testerErr.message);

  if (tester.user_id) {
    const { error: logErr } = await supabase
      .from('botanica_tasting_log')
      .insert({
        user_id: tester.user_id,
        species_id: species.id,
        quality_tier_id: species.quality_tier_id ?? 1,
      });
    if (logErr) console.warn('[testers] Log dégustation échoué :', logErr.message);
  } else {
    console.warn('[testers] Log dégustation ignoré : user_id absent sur le testeur.');
  }

  const bar = card?.querySelector('.happiness-bar');
  const face = card?.querySelector('.tester-face');
  const val = card?.querySelector('.tester-happiness');
  if (bar) bar.style.width = `${newHappiness}%`;
  if (face) face.textContent = getTesterFace(newHappiness);
  if (val) val.textContent = `${newHappiness}/100`;
}
