// leaderboard.js — Botanica Obscura Leaderboard
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js'

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

async function loadLeaderboard() {
  const { data, error } = await supabase
    .from('botanica_leaderboard')
    .select('rank, display_name, avatar_url, codex_count, level, xp')
    .order('rank')
    .limit(50)

  if (error) { console.error(error); return; }

  const tbody = document.getElementById('lb-body')
  tbody.innerHTML = data.map(r => `
    <tr class="${r.rank <= 3 ? 'lb-top' : ''}">
      <td class="lb-rank">${r.rank <= 3 ? ['\u{1F947}','\u{1F948}','\u{1F949}'][r.rank-1] : r.rank}</td>
      <td class="lb-name">
        ${r.avatar_url ? `<img src="${r.avatar_url}" class="lb-avatar">` : '\uD83C\uDF3F'}
        ${r.display_name}
      </td>
      <td class="lb-codex">${r.codex_count}</td>
      <td class="lb-level">${r.level}</td>
      <td class="lb-xp">${r.xp.toLocaleString()}</td>
    </tr>`).join('')
}

loadLeaderboard()
