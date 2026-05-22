export function createPlantCharacterSvg(species) {
  const body = species.body_color || '#7ec850';
  const stem = species.stem_color || '#4a7c2f';
  const eye = species.eye_color || '#222';

  return `
    <svg viewBox="0 0 100 120" role="img" aria-label="${species.name}">
      <ellipse cx="50" cy="54" rx="28" ry="35" fill="${body}" />
      <line x1="22" y1="52" x2="6" y2="66" stroke="${stem}" stroke-width="4" stroke-linecap="round"/>
      <line x1="78" y1="52" x2="94" y2="66" stroke="${stem}" stroke-width="4" stroke-linecap="round"/>
      <line x1="38" y1="88" x2="28" y2="110" stroke="${stem}" stroke-width="4" stroke-linecap="round"/>
      <line x1="62" y1="88" x2="72" y2="110" stroke="${stem}" stroke-width="4" stroke-linecap="round"/>
      <circle cx="42" cy="52" r="4" fill="white"/>
      <circle cx="58" cy="52" r="4" fill="white"/>
      <circle cx="43" cy="53" r="2" fill="${eye}"/>
      <circle cx="59" cy="53" r="2" fill="${eye}"/>
      <path d="M42 69 Q50 75 58 69" stroke="${eye}" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M50 18 C45 10, 40 8, 35 12" stroke="${stem}" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M50 18 C55 10, 60 8, 65 12" stroke="${stem}" stroke-width="3" fill="none" stroke-linecap="round"/>
    </svg>
  `;
}

export function createSeedSvg(species = {}) {
  const body = species.body_color || '#7ec850';
  const stem = species.stem_color || '#4a7c2f';
  const label = species.name ? `Graine de ${species.name}` : 'Graine botanique';

  return `
    <svg viewBox="0 0 100 120" role="img" aria-label="${label}">
      <defs>
        <radialGradient id="seedGlow-${species.id ?? 'x'}" cx="45%" cy="34%" r="70%">
          <stop offset="0%" stop-color="rgba(255,255,255,0.42)"/>
          <stop offset="42%" stop-color="${body}"/>
          <stop offset="100%" stop-color="#1d2d1f"/>
        </radialGradient>
      </defs>
      <ellipse cx="50" cy="66" rx="26" ry="34" fill="url(#seedGlow-${species.id ?? 'x'})" />
      <path d="M50 32 C58 42, 67 52, 63 70 C59 88, 48 99, 37 94 C51 84, 54 66, 50 32Z" fill="rgba(0,0,0,0.16)"/>
      <path d="M38 28 C31 18, 23 16, 16 21 C25 25, 31 31, 34 40" stroke="${stem}" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M42 27 C50 15, 62 12, 73 17 C61 23, 53 30, 48 42" stroke="${stem}" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M32 84 C44 91, 58 91, 70 84" stroke="rgba(255,255,255,0.18)" stroke-width="3" fill="none" stroke-linecap="round"/>
    </svg>
  `;
}
