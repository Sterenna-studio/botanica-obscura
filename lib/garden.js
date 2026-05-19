// lib/garden.js — Effets jardin : chargement, rendu, achat
import { supabase } from '../app.js';

export const GARDEN_EFFECTS = [
  {
    id: 'waterBonus',
    name: 'Arrosoir automatique',
    emoji: '🚿',
    description: '+10% chances tier ≥ Frape à la récolte',
    price: 50,
    maxLevel: 3,
  },
  {
    id: 'lightBonus',
    name: 'Lampe LED Spectre',
    emoji: '💡',
    description: '+15% chances tier ≥ Banger à la récolte',
    price: 150,
    maxLevel: 3,
  },
  {
    id: 'thermoBonus',
    name: 'Thermostat Pro',
    emoji: '🌡️',
    description: 'Réduit fortement les chances de Guezmer',
    price: 200,
    maxLevel: 2,
  },
  {
    id: 'fanBonus',
    name: 'Ventilateur oscillant',
    emoji: '🌬️',
    description: '+20% chances tier ≥ Banger',
    price: 400,
    maxLevel: 3,
  },
  {
    id: 'uvBonus',
    name: 'Loupe UV',
    emoji: '🔬',
    description: '+15% chances Comète ☄️',
    price: 800,
    maxLevel: 2,
  },
];

export async function loadGarden(userId) {
  const { data, error } = await supabase
    .from('player_garden')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    return Object.fromEntries(GARDEN_EFFECTS.map(e => [e.id, 0]));
  }
  return data;
}

export async function buyGardenEffect(userId, effectId, currentCoins, currentGarden) {
  const effect = GARDEN_EFFECTS.find(e => e.id === effectId);
  if (!effect) return { error: 'Effet inconnu.' };

  const currentLevel = currentGarden[effectId] ?? 0;
  if (currentLevel >= effect.maxLevel) return { error: 'Niveau maximum atteint.' };

  const cost = effect.price * (currentLevel + 1);
  if (currentCoins < cost) return { error: 'Pièces insuffisantes.' };

  const newGarden = { ...currentGarden, [effectId]: currentLevel + 1, user_id: userId };
  const newCoins  = currentCoins - cost;

  const { error: gardenErr } = await supabase
    .from('player_garden')
    .upsert(newGarden, { onConflict: 'user_id' });

  if (gardenErr) return { error: gardenErr.message };

  const { error: coinsErr } = await supabase
    .from('botanica_player_data')
    .update({ coins: newCoins })
    .eq('user_id', userId);

  if (coinsErr) return { error: coinsErr.message };

  return { newGarden, newCoins };
}

export function renderGarden(garden, coins, onBuy) {
  const container = document.getElementById('gardenContainer');
  if (!container) return;

  container.innerHTML = GARDEN_EFFECTS.map(effect => {
    const level   = garden[effect.id] ?? 0;
    const maxed   = level >= effect.maxLevel;
    const cost    = maxed ? 0 : effect.price * (level + 1);
    const canBuy  = !maxed && coins >= cost;

    return `
      <div class="garden-card ${maxed ? 'garden-maxed' : ''}">
        <div class="garden-emoji">${effect.emoji}</div>
        <div class="garden-info">
          <div class="garden-name">${effect.name}</div>
          <div class="garden-desc">${effect.description}</div>
          <div class="garden-level">${'★'.repeat(level)}${'☆'.repeat(effect.maxLevel - level)} Niv. ${level}/${effect.maxLevel}</div>
        </div>
        ${maxed
          ? '<div class="garden-maxed-label">MAX</div>'
          : `<button class="garden-buy-btn ${canBuy ? '' : 'disabled'}" data-effect-id="${effect.id}" ${canBuy ? '' : 'disabled'}>
               🪙 ${cost}
             </button>`
        }
      </div>`;
  }).join('');

  container.querySelectorAll('.garden-buy-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', e => onBuy(e.currentTarget.dataset.effectId));
  });
}
