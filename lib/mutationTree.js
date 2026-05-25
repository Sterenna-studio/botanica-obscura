let _inventoryQties = new Map(); // species_id → qty

/** Appelé par app.js après chaque refresh inventaire */
export function setTreeInventory(inventoryQties) {
  _inventoryQties = inventoryQties instanceof Map ? inventoryQties : new Map(Object.entries(inventoryQties).map(([k,v]) => [Number(k), v]));
}

export function renderMutationTree(speciesList, unlockedIds, onSelect) {
  const container = document.getElementById('mutationTree');
  if (!container) return;

  if (!speciesList?.length) {
    container.innerHTML = '<div class="muted">Aucune donnée de mutation.</div>';
    return;
  }

  const tierMap = new Map();
  const byId    = new Map(speciesList.map(s => [Number(s.id), s]));

  for (const species of speciesList) {
    const tier = Number(species.tier || 0);
    if (!tierMap.has(tier)) tierMap.set(tier, []);
    tierMap.get(tier).push(species);
  }

  const tiers     = [...tierMap.keys()].sort((a, b) => a - b);
  const colWidth  = 240;
  const rowHeight = 150;
  const paddingX  = 70;
  const paddingY  = 50;
  const nodeWidth = 132;
  const nodeHeight= 88;
  const maxRows   = Math.max(...tiers.map(t => tierMap.get(t).length), 1);
  const width     = tiers.length * colWidth + paddingX * 2;
  const height    = maxRows * rowHeight + paddingY * 2;

  const positioned = [];
  tiers.forEach((tier, colIndex) => {
    const nodes      = tierMap.get(tier);
    const totalH     = nodes.length * rowHeight;
    const offsetY    = (height - totalH) / 2 + rowHeight / 2;
    nodes.forEach((species, rowIndex) => {
      const state = unlockedIds.has(Number(species.id))
        ? 'unlocked'
        : species.discovered_by ? 'server-known' : 'unknown';

      // Craftable si les deux parents sont en inventaire
      const pA = species.parent_a_id ? byId.get(Number(species.parent_a_id)) : null;
      const pB = species.parent_b_id ? byId.get(Number(species.parent_b_id)) : null;
      const isSelfCross = pA && pB && Number(pA.id) === Number(pB.id);
      const qA = pA ? (_inventoryQties.get(Number(pA.id)) ?? 0) : 0;
      const qB = pB ? (_inventoryQties.get(Number(pB.id)) ?? 0) : 0;
      const craftable = pA && pB && (isSelfCross ? qA >= 2 : qA >= 1 && qB >= 1);

      positioned.push({ ...species, x: paddingX + colIndex * colWidth, y: offsetY + rowIndex * rowHeight, state, craftable });
    });
  });

  const posById = new Map(positioned.map(s => [Number(s.id), s]));

  const links = positioned
    .filter(s => s.parent_a_id || s.parent_b_id)
    .flatMap(s => {
      const parents = [s.parent_a_id, s.parent_b_id].filter(Boolean);
      return parents.map(parentId => {
        const parent = posById.get(Number(parentId));
        if (!parent) return '';
        const locked = s.state !== 'unlocked' && parent.state !== 'unlocked';
        const craftClass = s.craftable ? ' link-craftable' : (locked ? ' link-locked' : '');
        return `<path class="tree-link${craftClass}" d="M ${parent.x + nodeWidth / 2} ${parent.y} C ${parent.x + 165} ${parent.y}, ${s.x - 40} ${s.y}, ${s.x} ${s.y}" />`;
      });
    }).join('');

  const nodesSvg = positioned.map(s => {
    const body = s.body_color || '#7ec850';
    const stem = s.stem_color || '#4a7c2f';
    const eye  = s.eye_color  || '#222';
    const craftAttr = s.craftable ? ' craftable="true"' : '';

    if (s.state === 'unknown') {
      return `
        <g class="tree-node state-unknown${s.craftable ? ' node-craftable' : ''}" data-id="${s.id}"${craftAttr} transform="translate(${s.x}, ${s.y})">
          <rect x="0" y="-${nodeHeight/2}" width="${nodeWidth}" height="${nodeHeight}" rx="18" class="tree-card-bg" />
          <text x="66" y="6" class="tree-name-hidden" text-anchor="middle">???</text>
          <text x="66" y="22" class="tree-meta-hidden" text-anchor="middle">Tier ${s.tier}</text>
          ${s.craftable ? '<text x="66" y="-28" class="tree-craftable-badge" text-anchor="middle">🌱 Craftable</text>' : ''}
        </g>`;
    }

    if (s.state === 'server-known') {
      return `
        <g class="tree-node state-server-known${s.craftable ? ' node-craftable' : ''}" data-id="${s.id}"${craftAttr} transform="translate(${s.x}, ${s.y})">
          <rect x="0" y="-${nodeHeight/2}" width="${nodeWidth}" height="${nodeHeight}" rx="18" class="tree-card-bg" />
          <ellipse cx="34" cy="0" rx="20" ry="24" fill="${body}" opacity="0.18" />
          <text x="72" y="-8" class="tree-name-hidden">???</text>
          <text x="72" y="10" class="tree-meta-hidden">T${s.tier} • ${s.rarity}</text>
          <text x="72" y="28" class="tree-server-badge">🌐 ${escapeXml(s.discoverer_name ?? 'Serveur')}</text>
          ${s.craftable ? '<text x="66" y="-28" class="tree-craftable-badge" text-anchor="middle">🌱 Craftable</text>' : ''}
        </g>`;
    }

    return `
      <g class="tree-node state-unlocked node-clickable${s.craftable ? ' node-craftable' : ''} rarity-${s.rarity}" data-id="${s.id}"${craftAttr} transform="translate(${s.x}, ${s.y})">
        <rect x="0" y="-${nodeHeight/2}" width="${nodeWidth}" height="${nodeHeight}" rx="18" class="tree-card-bg" />
        <ellipse cx="34" cy="0" rx="20" ry="24" fill="${body}" />
        <line x1="18" y1="-2" x2="5"  y2="10"  stroke="${stem}" stroke-width="3" stroke-linecap="round"/>
        <line x1="50" y1="-2" x2="63" y2="10"  stroke="${stem}" stroke-width="3" stroke-linecap="round"/>
        <line x1="27" y1="23" x2="20" y2="38"  stroke="${stem}" stroke-width="3" stroke-linecap="round"/>
        <line x1="41" y1="23" x2="48" y2="38"  stroke="${stem}" stroke-width="3" stroke-linecap="round"/>
        <circle cx="28" cy="-3" r="3"   fill="white"/>
        <circle cx="40" cy="-3" r="3"   fill="white"/>
        <circle cx="29" cy="-2" r="1.5" fill="${eye}"/>
        <circle cx="41" cy="-2" r="1.5" fill="${eye}"/>
        <text x="72" y="-8" class="tree-name">${escapeXml(s.name)}</text>
        <text x="72" y="10" class="tree-meta">T${s.tier} • ${s.rarity}</text>
        ${s.was_first_server ? '<text x="72" y="28" class="tree-discovery">🏅 1ère</text>' : ''}
        ${s.craftable ? '<text x="66" y="-28" class="tree-craftable-badge" text-anchor="middle">🌱 Craftable</text>' : ''}
      </g>`;
  }).join('');

  const tierLabels = tiers.map((tier, colIndex) =>
    `<g transform="translate(${paddingX + colIndex * colWidth}, 22)"><text class="tree-tier-label">Tier ${tier}</text></g>`
  ).join('');

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" class="mutation-tree-svg" role="img" aria-label="Arbre des mutations">
      <defs>
        <filter id="softGlow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      ${tierLabels}
      <g class="tree-links">${links}</g>
      <g class="tree-nodes">${nodesSvg}</g>
    </svg>`;

  // Tous les nodes cliquables (unlocked + craftable unknown/server-known)
  container.querySelectorAll('.tree-node').forEach(node => {
    node.addEventListener('click', () => {
      const id = Number(node.dataset.id);
      const species = byId.get(id);
      if (species && onSelect) onSelect(species);
    });
  });
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
