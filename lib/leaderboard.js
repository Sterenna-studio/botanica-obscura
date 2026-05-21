const MEDALS = ['🥇', '🥈', '🥉'];

function getDisplayName(row) {
  return row.display_name?.trim() || 'Botaniste anonyme';
}

function formatScore(value) {
  return Number(value ?? 0).toLocaleString('fr-FR');
}

/**
 * Affiche le podium top 3 dans le conteneur donné.
 * @param {HTMLElement} container
 * @param {Array} top3
 */
export function renderPodium(container, top3) {
  if (!top3.length) { container.innerHTML = ''; return; }

  container.innerHTML = top3.map((r, i) => `
    <div class="podium-card podium-${i + 1}">
      <div class="podium-medal">${MEDALS[i]}</div>
      <div class="podium-avatar">
        ${r.avatar_url
          ? `<img src="${r.avatar_url}" alt="" class="lb-avatar">`
          : '<span class="lb-avatar-fallback">🌿</span>'}
      </div>
      <div class="podium-name">${getDisplayName(r)}</div>
      <div class="podium-xp">${formatScore(r.xp)} XP</div>
      <div class="podium-codex">📖 ${formatScore(r.codex_count)} espèces</div>
    </div>`).join('');
}

/**
 * Remplit le tbody du tableau (rang 1…N).
 * @param {HTMLElement} tbody
 * @param {Array} rows
 */
export function renderRows(tbody, rows) {
  tbody.innerHTML = rows.map(r => {
    const rankCell = r.rank <= 3
      ? `<span class="lb-medal">${MEDALS[r.rank - 1]}</span>`
      : r.rank;
    return `
    <tr class="${r.rank <= 3 ? 'lb-top' : ''}">
      <td class="lb-rank">${rankCell}</td>
      <td class="lb-col-name">
        <div class="lb-name">
          ${r.avatar_url
            ? `<img src="${r.avatar_url}" class="lb-avatar" alt="">`
            : '<span class="lb-avatar-fallback">🌿</span>'}
          <span>${getDisplayName(r)}</span>
        </div>
      </td>
      <td>${formatScore(r.codex_count)}</td>
      <td>${r.level ?? 1}</td>
      <td>${formatScore(r.xp)}</td>
    </tr>`;
  }).join('');
}
