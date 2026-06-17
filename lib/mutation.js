// lib/mutation.js — Gestion des pots de mutation (multi-slots)
import { supabase } from '../app.js';
import { getSession as sharedGetSession } from '/shared/auth.js';
import { adjustLocalSeedQuantity, setLocalSeedQuantity } from './localSave.js';

const GROW_DURATION_MS = 12 * 60 * 60 * 1000;

export function getSlotsForLevel(level = 1) {
  if (level >= 14) return 6;
  if (level >= 11) return 5;
  if (level >= 8)  return 4;
  if (level >= 5)  return 3;
  if (level >= 4)  return 2;
  return 1;
}

export async function startMutationPot(uid, speciesAId, speciesBId, playerLevel = 1, potSlots = 0) {
  // Le cap effectif = max entre le palier de niveau et les slots possédés
  // (les slots achetés au labo peuvent dépasser le palier de niveau).
  const maxSlots = Math.max(getSlotsForLevel(playerLevel), Number(potSlots) || 0);

  const { data: active } = await supabase
    .from('botanica_mutation_pots')
    .select('id')
    .eq('user_id', uid)
    .in('status', ['growing', 'ready']);

  if ((active?.length ?? 0) >= maxSlots) {
    return { error: `Tous vos pots sont occupés (${maxSlots} slot${maxSlots > 1 ? 's' : ''}).` };
  }

  const consumed = await consumeMutationSeeds(uid, [speciesAId, speciesBId]);
  if (consumed.error) return consumed;

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

  if (error) {
    await rollbackConsumedSeeds(uid, consumed.beforeRows);
    return { error: error.message };
  }
  return { pot: data, consumed: consumed.requirements };
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
          .eq('user_id', uid)
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

export async function harvestMutation(potId) {
  const session = await sharedGetSession();
  if (!session?.access_token) return { error: 'Session Nitro absente.' };

  const res = await fetch(
    `${supabase.supabaseUrl}/functions/v1/harvest-mutation`,
    {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pot_id: potId }),
    }
  );
  return res.json();
}

function buildSeedRequirements(speciesIds) {
  const requirements = new Map();
  speciesIds.forEach(speciesId => {
    const id = Number(speciesId);
    if (Number.isFinite(id) && id > 0) {
      requirements.set(id, (requirements.get(id) ?? 0) + 1);
    }
  });
  return requirements;
}

async function consumeMutationSeeds(uid, speciesIds) {
  const requirements = buildSeedRequirements(speciesIds);
  const requiredIds = [...requirements.keys()];

  const { data, error } = await supabase
    .from('botanica_player_seeds')
    .select('id, species_id, quantity')
    .eq('user_id', uid)
    .in('species_id', requiredIds);

  if (error) {
    console.warn('[mutation] Lecture inventaire cloud échouée :', error.message);
    return { error: 'Inventaire indisponible.' };
  }

  const rowsBySpecies = new Map((data ?? []).map(row => [Number(row.species_id), row]));

  for (const [speciesId, needed] of requirements) {
    const available = Number(rowsBySpecies.get(speciesId)?.quantity ?? 0);
    if (available < needed) {
      return { error: `Pas assez de graines pour l'espèce #${speciesId}.` };
    }
  }

  const beforeRows = requiredIds.map(speciesId => {
    const row = rowsBySpecies.get(speciesId);
    return { id: row.id, species_id: Number(row.species_id), quantity: Number(row.quantity) };
  });

  for (const [speciesId, needed] of requirements) {
    adjustLocalSeedQuantity(speciesId, -needed);
  }

  const writes = [...requirements.entries()].map(([speciesId, needed]) => {
    const row = rowsBySpecies.get(speciesId);
    const nextQuantity = Number(row.quantity) - needed;
    if (nextQuantity <= 0) {
      return supabase
        .from('botanica_player_seeds')
        .delete()
        .eq('id', row.id)
        .eq('user_id', uid);
    }

    return supabase
      .from('botanica_player_seeds')
      .update({ quantity: nextQuantity })
      .eq('id', row.id)
      .eq('user_id', uid);
  });

  const results = await Promise.all(writes);
  const failed = results.find(result => result.error);
  if (failed) {
    console.warn('[mutation] Consommation graines cloud échouée :', failed.error.message);
    await rollbackConsumedSeeds(uid, beforeRows);
    return { error: 'Consommation des graines impossible.' };
  }

  return { beforeRows, requirements: Object.fromEntries(requirements) };
}

async function rollbackConsumedSeeds(uid, beforeRows = []) {
  if (!beforeRows.length) return;

  beforeRows.forEach(row => setLocalSeedQuantity(row.species_id, row.quantity));

  const restores = beforeRows.map(row =>
    supabase
      .from('botanica_player_seeds')
      .upsert(
        { user_id: uid, species_id: row.species_id, quantity: row.quantity },
        { onConflict: 'user_id,species_id' }
      )
  );

  const results = await Promise.all(restores);
  const failed = results.find(result => result.error);
  if (failed) console.warn('[mutation] Rollback graines cloud incomplet :', failed.error.message);
}
