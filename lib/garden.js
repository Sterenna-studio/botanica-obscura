// lib/garden.js — Effets jardin : chargement, rendu, achat
import { supabase } from '../app.js';
import { loadLocal, patchLocal } from './localSave.js';

export const GARDEN_EFFECTS = [
  {
    id: 'waterBonus',
    name: 'Arrosoir automatique',
    emoji: '🚿',
    description: '+10% chances tier ≥ Frape à la récolte',
    price: 150,
    maxLevel: 3,
  },
  {
    id: 'lightBonus',
    name: 'Lampe LED Spectre',
    emoji: '💡',
    description: '+15% chances tier ≥ Banger à la récolte',
    price: 400,
    maxLevel: 3,
  },
  {
    id: 'thermoBonus',
    name: 'Thermostat Pro',
    emoji: '🌡️',
    description: 'Réduit fortement les chances de Guezmer',
    price: 550,
    maxLevel: 2,
  },
  {
    id: 'fanBonus',
    name: 'Ventilateur oscillant',
    emoji: '🌬️',
    description: '+20% chances tier ≥ Banger',
    price: 1000,
    maxLevel: 3,
  },
  {
    id: 'uvBonus',
    name: 'Loupe UV',
    emoji: '🔬',
    description: '+15% chances Comète ☄️',
    price: 2000,
    maxLevel: 2,
  },
  {
    id: 'yieldBonus',
    name: 'Engrais Florissant',
    emoji: '🌸',
    description: '+1 fleur récoltée par niveau',
    price: 750,
    maxLevel: 3,
  },
  {
    id: 'seedLuck',
    name: 'Pollen Fertile',
    emoji: '🧬',
    description: '+8% chances de graines de la variété récoltée',
    price: 600,
    maxLevel: 3,
  },
];

function getDefaultGarden() {
  return Object.fromEntries(GARDEN_EFFECTS.map(effect => [effect.id, 0]));
}

function normalizeGarden(rowOrEffects) {
  const rawEffects = rowOrEffects?.effects ?? rowOrEffects ?? {};
  const defaults = getDefaultGarden();
  return Object.fromEntries(GARDEN_EFFECTS.map(effect => {
    const value = Number(rawEffects[effect.id] ?? defaults[effect.id]);
    return [effect.id, Math.max(0, Math.min(effect.maxLevel, Number.isFinite(value) ? value : 0))];
  }));
}

export async function loadGarden(userId) {
  try {
    const { data, error } = await supabase
      .from('botanica_player_garden')
      .select('user_id, effects')
      .eq('user_id', userId)
      .maybeSingle();

    if (!error && data) {
      const garden = normalizeGarden(data);
      patchLocal('garden', garden);
      return garden;
    }

    if (error) console.warn('[garden] Chargement cloud échoué, fallback local :', error.message);
  } catch (e) {
    console.warn('[garden] Chargement cloud échoué, fallback local :', e);
  }

  const localGarden = loadLocal()?.garden;
  if (localGarden && Object.keys(localGarden).length > 0) {
    return normalizeGarden(localGarden);
  }

  return getDefaultGarden();
}

export async function buyGardenEffect(userId, effectId, currentCoins, currentGarden) {
  const effect = GARDEN_EFFECTS.find(e => e.id === effectId);
  if (!effect) return { error: 'Effet inconnu.' };

  const currentLevel = currentGarden[effectId] ?? 0;
  if (currentLevel >= effect.maxLevel) return { error: 'Niveau maximum atteint.' };

  const cost = effect.price * (currentLevel + 1);
  if (currentCoins < cost) return { error: 'Pièces insuffisantes.' };

  const newGarden = normalizeGarden({ ...currentGarden, [effectId]: currentLevel + 1 });
  const newCoins  = currentCoins - cost;
  const localPlayerData = loadLocal()?.playerData ?? {};

  patchLocal('garden', newGarden);
  patchLocal('playerData', { ...localPlayerData, coins: newCoins });

  const { error: gardenErr } = await supabase
    .from('botanica_player_garden')
    .upsert(
      { user_id: userId, effects: newGarden, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );

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
