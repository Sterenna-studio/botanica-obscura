import { supabase } from './lib/supabaseClient.js';
import { onAuthReady, getBotanicaUserId } from './lib/auth.js';
import { getProfile as getSharedProfile } from '/shared/profile.js';
import { createPlantCharacterSvg } from './lib/plantSvg.js';
import { getFallbackSpeciesTree } from './lib/speciesTree.js';
import { QUALITY_TIERS } from './lib/quality.js';
import { resolveLevel } from './lib/xp.js';

// Déterminé dynamiquement depuis botanica_species — voir loadProfile()
let TOTAL_SPECIES = 32;
function fmt(n) { return Number(n ?? 0).toLocaleString('fr-FR'); }
function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  if (d > 0) return `il y a ${d}j`;
  if (h > 0) return `il y a ${h}h`;
  return 'r\u00e9cemment';
}

async function loadProfile(userId) {
  const [playerRes, profileData, codexRes, salesRes, mutRes, firstRes] = await Promise.all([
    supabase.from('botanica_player_data')
      .select('coins, xp, level, created_at')
      .eq('user_id', userId).maybeSingle(),

    getSharedProfile(userId),

    supabase.from('botanica_player_codex')
      .select('species_id, was_first_server, unlocked_at')
      .eq('user_id', userId),

    supabase.from('botanica_npc_sales_log')
      .select('species_id, quality_tier_id, price_sold, sold_at')
      .eq('user_id', userId)
      .order('sold_at', { ascending: false })
      .limit(20),

    supabase.from('botanica_mutation_pots')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),

    supabase.from('botanica_player_codex')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('was_first_server', true),
  ]);

  const player     = playerRes.data ?? {};
  const profile    = profileData ?? {};
  const codex      = codexRes.data ?? [];
  const sales      = salesRes.data ?? [];
  const mutCount   = mutRes.count ?? 0;
  const firstCount = firstRes.count ?? 0;

  const { data: speciesData } = await supabase
    .from('botanica_species').select('*')
    .order('tier').order('id');
  const speciesList = speciesData?.length ? speciesData : getFallbackSpeciesTree();
  TOTAL_SPECIES     = speciesList.length;
  const codexIds    = new Set(codex.map(c => c.species_id));

  renderIdentity({ ...player, username: profile.username, avatar_url: profile.avatar_url }, codex.length);
  renderStats(mutCount, sales, firstCount);
  renderCodex(speciesList, codexIds, codex);
  renderSales(sales, speciesList);
}

function renderIdentity(p, codexCount) {
  const avatar      = document.getElementById('profil-avatar');
  const placeholder = document.getElementById('profil-avatar-placeholder');
  if (p.avatar_url) {
    avatar.src = p.avatar_url;
    avatar.style.display = 'block';
    placeholder.style.display = 'none';
  }
  document.getElementById('profil-name').textContent  = p.username ?? 'Botaniste';
  document.getElementById('profil-level').textContent = `Lv. ${p.level ?? 1}`;
  document.getElementById('profil-coins').textContent = `\ud83e\ude99 ${fmt(p.coins)}`;
  document.getElementById('profil-codex').textContent = `\ud83d\udcd6 ${codexCount} / ${TOTAL_SPECIES}`;

  const xp = p.xp ?? 0;
  const { progress, currentLevelXp, nextLevelXp } = resolveLevel(xp);
  document.getElementById('profil-xp-fill').style.width = `${progress}%`;
  document.getElementById('profil-xp-label').textContent = nextLevelXp != null
    ? `${fmt(currentLevelXp)} / ${fmt(nextLevelXp)} XP`
    : `${fmt(xp)} XP (max)`;

  if (p.created_at) {
    document.getElementById('profil-joined').textContent =
      `Membre depuis le ${new Date(p.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  }
}

function renderStats(mutCount, sales, firstCount) {
  const totalEarned = sales.reduce((s, r) => s + (r.price_sold ?? 0), 0);
  document.getElementById('stat-mutations').textContent = fmt(mutCount);
  document.getElementById('stat-sold').textContent      = fmt(sales.length);
  document.getElementById('stat-earned').textContent    = `\ud83e\ude99 ${fmt(totalEarned)}`;
  document.getElementById('stat-first').textContent     = fmt(firstCount);
}

function renderCodex(speciesList, codexIds, codexRows) {
  const firstIds = new Set(codexRows.filter(r => r.was_first_server).map(r => r.species_id));
  const label = document.getElementById('codex-progress-label');
  label.textContent = `${codexIds.size} / ${TOTAL_SPECIES}`;

  document.getElementById('profil-codex-grid').innerHTML = speciesList.map(s => {
    if (!codexIds.has(s.id)) {
      return `<div class="profil-codex-slot unknown" title="Inconnue">
        <div class="slot-mystery">?</div>
        <div class="slot-tier">T${s.tier}</div>
      </div>`;
    }
    return `<div class="profil-codex-slot rarity-${s.rarity}" title="${s.name}">
      <div class="slot-svg">${createPlantCharacterSvg(s)}</div>
      ${firstIds.has(s.id) ? '<div class="slot-first">\ud83c\udf85</div>' : ''}
    </div>`;
  }).join('');
}

function renderSales(sales, speciesList) {
  const speciesMap = Object.fromEntries(speciesList.map(s => [s.id, s]));
  const tbody = document.getElementById('profil-sales-body');
  if (!sales.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="table-empty">Aucune vente pour l\'instant.</td></tr>';
    return;
  }
  tbody.innerHTML = sales.map(row => {
    const sp      = speciesMap[row.species_id];
    const quality = QUALITY_TIERS.find(t => t.id === row.quality_tier_id);
    return `<tr>
      <td><span class="rarity-badge ${sp?.rarity ?? ''}">${sp?.name ?? '???'}</span></td>
      <td>${quality?.label ?? '\u2014'}</td>
      <td>\ud83e\ude99 ${fmt(row.price_sold)}</td>
      <td class="table-date">${timeAgo(row.sold_at)}</td>
    </tr>`;
  }).join('');
}

async function init() {
  onAuthReady(() => {
    const userId = getBotanicaUserId();
    if (!userId) {
      document.getElementById('profil-name').textContent = 'Connectez-vous pour voir votre profil';
      return;
    }
    loadProfile(userId);
  });
}

init();
