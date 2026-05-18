import { supabase, userId } from '../app.js';
import { SUPABASE_URL } from '../config.js';

export async function startMutationPot(uid, speciesAId, speciesBId) {
  // Check no active pot already
  const { data: existing } = await supabase
    .from('mutation_pots')
    .select('id')
    .eq('user_id', uid)
    .in('status', ['growing', 'ready'])
    .maybeSingle();

  if (existing) return { error: 'Un pot est déjà en cours de mutation.' };

  const now = new Date();
  const readyAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from('mutation_pots')
    .insert({
      user_id: uid,
      species_a_id: speciesAId,
      species_b_id: speciesBId,
      started_at: now.toISOString(),
      ready_at: readyAt.toISOString(),
      status: 'growing',
      growth_stage: 0,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { pot: data };
}

export async function loadActivePot(uid) {
  const { data, error } = await supabase
    .from('mutation_pots')
    .select('*')
    .eq('user_id', uid)
    .in('status', ['growing', 'ready'])
    .order('started_at', { ascending: false })
    .maybeSingle();

  if (error || !data) return null;

  // Auto-mark as ready if time elapsed
  if (data.status === 'growing' && new Date() >= new Date(data.ready_at)) {
    await supabase
      .from('mutation_pots')
      .update({ status: 'ready', growth_stage: 4 })
      .eq('id', data.id);
    data.status = 'ready';
    data.growth_stage = 4;
  }

  return data;
}

export async function harvestMutation(potId, uid) {
  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/harvest-mutation`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pot_id: potId, user_id: uid }),
    }
  );
  return res.json();
}
