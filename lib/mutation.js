// lib/mutation.js — Gestion des pots de mutation (multi-slots)
import { supabase, getUserId } from '../app.js';
import { SUPABASE_URL } from '../config.js';

const GROW_DURATION_MS = 12 * 60 * 60 * 1000;

export function getSlotsForLevel(level = 1) {
  if (level >= 8) return 4;
  if (level >= 5) return 3;
  if (level >= 4) return 2;
  return 1;
}

export async function startMutationPot(uid, speciesAId, speciesBId, playerLevel = 1) {
  const maxSlots = getSlotsForLevel(playerLevel);

  const { data: active } = await supabase
    .from('botanica_mutation_pots')
    .select('id')
    .eq('user_id', uid)
    .in('status', ['growing', 'ready']);

  if ((active?.length ?? 0) >= maxSlots) {
    return { error: `Tous vos pots sont occupés (${maxSlots} slot${maxSlots > 1 ? 's' : ''}).` };
  }

  const now     = new Date();
  const readyAt = new Date(now.getTime() + GROW_DURATION_MS);

  const { data, error } = await supabase
    .from('botanica_mutation_pots')
    .insert({
      user_id:      uid,
      species_a_id: speciesAId,
      species_b_id: speciesBId,
      started_at:   now.toISOString(),
      ready_at:     readyAt.toISOString(),
      status:       'growing',
      growth_stage: 0,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { pot: data };
}

export async function loadActivePots(uid) {
  const { data, error } = await supabase
    .from('botanica_mutation_pots')
    .select('*')
    .eq('user_id', uid)
    .in('status', ['growing', 'ready'])
    .order('started_at', { ascending: true });

  if (error || !data) return [];

  const now = new Date();
  const updates = [];
  for (const pot of data) {
    if (pot.status === 'growing' && now >= new Date(pot.ready_at)) {
      pot.status       = 'ready';
      pot.growth_stage = 4;
      updates.push(
        supabase.from('botanica_mutation_pots')
          .update({ status: 'ready', growth_stage: 4 })
          .eq('id', pot.id)
      );
    }
  }
  if (updates.length) await Promise.all(updates);

  return data;
}

export async function loadActivePot(uid) {
  const pots = await loadActivePots(uid);
  return pots[0] ?? null;
}

export async function harvestMutation(potId, uid, gardenBonuses) {
  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/harvest-mutation`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ pot_id: potId, user_id: uid, garden_bonuses: gardenBonuses }),
    }
  );
  return res.json();
}
