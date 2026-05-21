import { supabase } from '../app.js';
import { loadLocal, patchLocal, setLocalSeedQuantity } from './localSave.js';

const BASE_PRICES = {
  common:    10,
  rare:      30,
  epic:      80,
  legendary: 200,
  mythic:    500,
};

const QUALITY_MULTIPLIERS = [0.5, 1.0, 1.8, 3.0, 6.0];

export function computeNpcPrice(rarity, qualityTierId = 1) {
  const base = BASE_PRICES[rarity] ?? 10;
  const mult = QUALITY_MULTIPLIERS[qualityTierId] ?? 1.0;
  return Math.round(base * mult);
}

export async function sellSeedToNpc(userId, seedId, speciesId, rarity, qualityTierId = 1) {
  const price = computeNpcPrice(rarity, qualityTierId);
  const numericSpeciesId = Number(speciesId);
  const localSeed = (loadLocal()?.seeds ?? [])
    .find(seed => Number(seed.species_id) === numericSpeciesId);

  let seed = null;
  if (seedId && !String(seedId).startsWith('local-')) {
    const { data, error } = await supabase
      .from('botanica_player_seeds')
      .select('id, quantity')
      .eq('id', seedId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) console.warn('[npcShop] Lecture graine cloud échouée :', error.message);
    seed = data;
  }

  const currentQuantity = seed?.quantity ?? localSeed?.quantity ?? 0;
  if (currentQuantity <= 0) return { error: 'Graine introuvable.' };

  const nextQuantity = currentQuantity - 1;
  setLocalSeedQuantity(numericSpeciesId, nextQuantity);

  if (seed) {
    const writeResult = seed.quantity > 1
      ? await supabase
        .from('botanica_player_seeds')
        .update({ quantity: nextQuantity })
        .eq('id', seedId)
        .eq('user_id', userId)
      : await supabase
        .from('botanica_player_seeds')
        .delete()
        .eq('id', seedId)
        .eq('user_id', userId);

    if (writeResult.error) {
      console.warn('[npcShop] Sync graine cloud échouée :', writeResult.error.message);
    }
  }

  const localPlayerData = loadLocal()?.playerData ?? {};
  const { data: playerData, error: playerErr } = await supabase
    .from('botanica_player_data')
    .select('coins')
    .eq('user_id', userId)
    .maybeSingle();

  if (playerErr) console.warn('[npcShop] Lecture pièces cloud échouée :', playerErr.message);

  const newCoins = (playerData?.coins ?? localPlayerData.coins ?? 0) + price;
  patchLocal('playerData', { ...localPlayerData, ...(playerData ?? {}), coins: newCoins });

  const { error: playerWriteErr } = await supabase
    .from('botanica_player_data')
    .upsert({ user_id: userId, coins: newCoins }, { onConflict: 'user_id' });
  if (playerWriteErr) console.warn('[npcShop] Sync pièces cloud échouée :', playerWriteErr.message);

  const { error: logErr } = await supabase
    .from('botanica_npc_sales_log')
    .insert({ user_id: userId, species_id: numericSpeciesId, quality_tier_id: qualityTierId, price_sold: price });
  if (logErr) console.warn('[npcShop] Log vente NPC échoué :', logErr.message);

  return { coins: newCoins, price };
}
