// lib/npcShop.js — Vente de graines récoltées au NPC
import { supabase } from '../app.js';
import { QUALITY_TIERS, computeSellPrice } from './quality.js';

export async function sellSeedToNpc(userId, seedId, species, qualityTierId) {
  const qualityTier = QUALITY_TIERS.find(t => t.id === qualityTierId) ?? QUALITY_TIERS[1];
  const price       = computeSellPrice(species, qualityTier);

  // Retire 1 graine de l'inventaire
  const { data: seed } = await supabase
    .from('player_seeds')
    .select('quantity')
    .eq('id', seedId)
    .maybeSingle();

  if (!seed || seed.quantity <= 0) return { error: 'Graine introuvable.' };

  if (seed.quantity === 1) {
    await supabase.from('player_seeds').delete().eq('id', seedId);
  } else {
    await supabase.from('player_seeds').update({ quantity: seed.quantity - 1 }).eq('id', seedId);
  }

  // Ajoute les pièces
  const { data: player } = await supabase
    .from('botanica_player_data')
    .select('coins')
    .eq('user_id', userId)
    .maybeSingle();

  const currentCoins = player?.coins ?? 0;
  const newCoins     = currentCoins + price;

  await supabase
    .from('botanica_player_data')
    .upsert({ user_id: userId, coins: newCoins }, { onConflict: 'user_id' });

  // Log de vente
  await supabase.from('npc_sales_log').insert({
    user_id: userId,
    species_id: species.id,
    quality_tier_id: qualityTierId,
    price_sold: price,
    sold_at: new Date().toISOString(),
  });

  return { price, newCoins };
}
