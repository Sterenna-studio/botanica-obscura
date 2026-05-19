import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../config.js';
import { renderPodium, renderRows } from './lib/leaderboard.js';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const tbody   = document.getElementById('lb-body');
const podium  = document.getElementById('lb-podium');
const empty   = document.getElementById('lb-empty');
const errEl   = document.getElementById('lb-error');
const tabs    = document.querySelectorAll('.lb-tab');

let currentSort = 'xp';

async function loadLeaderboard() {
  tbody.innerHTML = '<tr><td colspan="5" class="lb-loading">Chargement…</td></tr>';
  empty.hidden = true;
  errEl.hidden = true;

  const orderCol = currentSort === 'codex' ? 'codex_count' : 'xp';

  const { data, error } = await supabase
    .from('botanica_leaderboard')
    .select('rank, display_name, avatar_url, codex_count, level, xp')
    .order(orderCol, { ascending: false })
    .limit(50);

  if (error) {
    tbody.innerHTML = '';
    errEl.hidden = false;
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '';
    empty.hidden = false;
    return;
  }

  const ranked = data.map((r, i) => ({ ...r, rank: i + 1 }));

  renderPodium(podium, ranked.slice(0, 3));
  renderRows(tbody, ranked);
}

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentSort = tab.dataset.tab;
    loadLeaderboard();
  });
});

loadLeaderboard();
setInterval(loadLeaderboard, 60_000);
