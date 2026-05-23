import { supabase, restoreStarSession } from './lib/supabaseClient.js';
import { onAuthReady, getBotanicaUserId, requireAuth, getProfile } from './lib/auth.js';
import { getSession as sharedGetSession } from '/shared/auth.js';

const els = {
  session: document.getElementById('debugSession'),
  player: document.getElementById('debugPlayer'),
  seeds: document.getElementById('debugSeeds'),
  pots: document.getElementById('debugPots'),
  codex: document.getElementById('debugCodex'),
  refresh: document.getElementById('refreshDebugBtn'),
};

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

function setText(el, value) {
  if (el) el.textContent = typeof value === 'string' ? value : pretty(value);
}

async function loadDebug() {
  const userId = getBotanicaUserId();
  const session = await sharedGetSession();

  setText(els.session, {
    user_id: userId,
    has_access_token: Boolean(session?.access_token),
    token_prefix: session?.access_token ? `${session.access_token.slice(0, 14)}...` : null,
  });

  if (!userId) return;

  const [player, seeds, pots, codex] = await Promise.all([
    supabase.from('botanica_player_data')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase.from('botanica_player_seeds')
      .select('species_id, quantity, obtained_at, botanica_species(name, tier, rarity)')
      .eq('user_id', userId)
      .order('obtained_at', { ascending: false }),
    supabase.from('botanica_mutation_pots')
      .select('id, species_a_id, species_b_id, started_at, ready_at, status, result_species_id, quality_tier_id')
      .eq('user_id', userId)
      .order('started_at', { ascending: false }),
    supabase.from('botanica_player_codex')
      .select('species_id, unlocked_at, was_first_server, botanica_species(name, tier, rarity)')
      .eq('user_id', userId)
      .order('unlocked_at', { ascending: false }),
  ]);

  setText(els.player, player.error ? { error: player.error.message } : player.data);
  setText(els.seeds, seeds.error ? { error: seeds.error.message } : seeds.data);
  setText(els.pots, pots.error ? { error: pots.error.message } : pots.data);
  setText(els.codex, codex.error ? { error: codex.error.message } : codex.data);
}

async function init() {
  await restoreStarSession();
  const auth = await requireAuth('/login.html');
  if (!auth) return;

  onAuthReady(async () => {
    await getProfile();
    await loadDebug();
  });

  els.refresh?.addEventListener('click', loadDebug);
}

init();
