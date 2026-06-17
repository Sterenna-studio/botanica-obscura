/**
 * deliveryGame.js — Mini-jeu de livraison top-down Canvas
 *
 * Cargo = total des FLEURS en inventaire (pas les graines).
 * Récompense = cargo × REWARD_PER_UNIT × bonus wanted level.
 */

const CANVAS_W = 640;
const CANVAS_H = 320;
const ROAD_LANES = 3;
const LANE_H = 80;
const ROAD_TOP = (CANVAS_H - ROAD_LANES * LANE_H) / 2;
const PLAYER_W = 72;
const PLAYER_H = 36;
const COP_W = 68;
const COP_H = 34;
const REWARD_PER_UNIT = 8;
const BASE_DISTANCE = 4000;

// Panneaux routiers de Pontivy défilant dans le décor
const PONTIVY_SIGNS = [
  'Pontivy', 'Le Blavet', 'Château des Rohan', 'Les Halles',
  'Stival', 'Napoléonville', 'Le Plessis', 'Parc de Kério', 'Centre-ville',
];

let _onComplete = null;
let _onFail     = null;
let _overlay    = null;
let _canvas     = null;
let _ctx        = null;
let _raf        = null;
let _keys       = {};
let _touchStartY = null;

const state = {
  running: false,
  scrollX: 0,
  distance: BASE_DISTANCE,
  cargo: 0,
  speed: 3.5,
  player: { lane: 1, y: 0 },
  cops: [],
  roadMarkings: [],
  signs: [],
  wantedLevel: 0,
  survived: 0,
  hitFlash: 0,
  destinationName:  '',
  destinationEmoji: '📍',
  rewardCoins:      null,
  difficulty:       1,
};

const SHARED = 'https://nitro.sterenna.fr/shared/images/vehicule/';

function makeCarImg(src, fallbackColor, w, h) {
  const img = new Image();
  img.src = src;
  img.onerror = () => { img._failed = true; };
  img._fallbackColor = fallbackColor;
  img._w = w; img._h = h;
  return img;
}

const IMG_PLAYER = makeCarImg(`${SHARED}mash_muten.png`, '#e8a020', PLAYER_W, PLAYER_H);
const IMG_COP    = makeCarImg(`${SHARED}cop_car.png`,    '#1a6cf5', COP_W,    COP_H);

function drawCar(ctx, img, x, y) {
  if (img._failed || !img.complete || img.naturalWidth === 0) {
    ctx.save();
    ctx.fillStyle = img._fallbackColor;
    ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5;
    const w = img._w, h = img._h;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(180,220,255,0.5)';
    ctx.fillRect(x + w * 0.35, y + h * 0.12, w * 0.3, h * 0.45);
    ctx.fillStyle = '#111';
    [[x+4,y+h-8],[x+w-12,y+h-8],[x+4,y+2],[x+w-12,y+2]].forEach(([wx,wy]) => ctx.fillRect(wx,wy,10,6));
    if (img._fallbackColor === '#1a6cf5') {
      ctx.fillStyle = '#ff3333'; ctx.fillRect(x + w*0.3, y - 5, w*0.18, 5);
      ctx.fillStyle = '#3399ff'; ctx.fillRect(x + w*0.52, y - 5, w*0.18, 5);
    }
    ctx.restore();
  } else {
    ctx.drawImage(img, x, y, img._w, img._h);
  }
}

function buildOverlay(cargo) {
  if (_overlay) _overlay.remove();
  _overlay = document.createElement('div');
  _overlay.id = 'delivery-overlay';
  const destLabel = state.destinationName
    ? `${state.destinationEmoji} ${state.destinationName}`
    : 'Pontivy';
  _overlay.innerHTML = `
    <div class="dg-panel">
      <div class="dg-header">
        <span class="dg-title">🚗 LIVRAISON · PONTIVY</span>
        <button class="dg-close" id="dg-close-btn">✕ Abandonner</button>
      </div>
      <div class="dg-route" id="dg-route">Direction : <strong>${destLabel}</strong></div>
      <div class="dg-hud">
        <span id="dg-cargo">🌸 ${cargo}</span>
        <span id="dg-dist">📍 0%</span>
        <span id="dg-wanted">🚨 Wanted: 0</span>
      </div>
      <canvas id="delivery-canvas" width="${CANVAS_W}" height="${CANVAS_H}"></canvas>
      <div class="dg-controls">⬆⬇ ou W/S pour changer de voie — Swipe sur mobile — Évite les flics jusqu'à destination !</div>
    </div>`;
  document.body.appendChild(_overlay);
  document.getElementById('dg-close-btn').addEventListener('click', () => stopGame(false));
  return _overlay;
}

function buildResultScreen(won, coinsEarned, delivered) {
  const panel = _overlay?.querySelector('.dg-panel');
  if (!panel) return;
  const dest = state.destinationName ? `${state.destinationEmoji} ${state.destinationName}` : 'destination';
  panel.innerHTML = `
    <div class="dg-result ${won ? 'dg-win' : 'dg-lose'}">
      <div class="dg-result-icon">${won ? '🎉' : '🚨'}</div>
      <div class="dg-result-title">${won ? 'LIVRAISON RÉUSSIE !' : 'ARRÊTÉ PAR LA POLICE !'}</div>
      ${won
        ? `<div class="dg-result-body">Colis livré à ${dest} 🌿<br>+🪙 <strong>${coinsEarned}</strong> pièces</div>`
        : `<div class="dg-result-body">Contrôle de gendarmerie à ${dest}.<br>Cargo confisqué — commande échouée.</div>`
      }
      <button class="dg-close-result" id="dg-result-close">Continuer</button>
    </div>`;
  document.getElementById('dg-result-close').addEventListener('click', () => { _overlay?.remove(); _overlay = null; });
}

function laneY(lane) { return ROAD_TOP + lane * LANE_H + (LANE_H - PLAYER_H) / 2; }

function spawnCop() {
  const lane = Math.floor(Math.random() * ROAD_LANES);
  state.cops.push({ x: CANVAS_W + 60, y: laneY(lane), lane, speed: state.speed * (0.6 + Math.random() * 0.5) });
}

function initRoadMarkings() {
  state.roadMarkings = [];
  for (let i = 0; i < 16; i++) state.roadMarkings.push({ x: i * 80 });
}

function drawRoad(ctx) {
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, ROAD_TOP, CANVAS_W, ROAD_LANES * LANE_H);
  ctx.fillStyle = '#e8c840';
  ctx.fillRect(0, ROAD_TOP, CANVAS_W, 4);
  ctx.fillRect(0, ROAD_TOP + ROAD_LANES * LANE_H - 4, CANVAS_W, 4);
  ctx.setLineDash([30, 20]); ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 2;
  for (let l = 1; l < ROAD_LANES; l++) {
    const y = ROAD_TOP + l * LANE_H;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const m of state.roadMarkings) {
    ctx.fillStyle = '#ffffff22';
    ctx.fillRect(m.x, ROAD_TOP + ROAD_LANES * LANE_H / 2 - 2, 40, 4);
  }
  ctx.fillStyle = '#3a6b25';
  ctx.fillRect(0, 0, CANVAS_W, ROAD_TOP);
  ctx.fillRect(0, ROAD_TOP + ROAD_LANES * LANE_H, CANVAS_W, CANVAS_H - ROAD_TOP - ROAD_LANES * LANE_H);
  for (let x = (state.scrollX * 0.3) % 120 - 120; x < CANVAS_W + 60; x += 120) {
    ctx.fillStyle = '#2d5a1e';
    ctx.beginPath(); ctx.arc(x, 20, 14, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 30, 280, 12, 0, Math.PI * 2); ctx.fill();
  }
}

function initSigns() {
  state.signs = [];
  // Quelques panneaux pré-placés pour démarrer avec du décor
  for (let i = 0; i < 3; i++) {
    state.signs.push({ x: CANVAS_W * (0.4 + i * 0.5), label: PONTIVY_SIGNS[i % PONTIVY_SIGNS.length] });
  }
}

// Silhouettes de monuments de Pontivy en fond (château + clocher)
function drawLandmarks(ctx) {
  const base = ROAD_TOP - 2;
  ctx.save();
  // Château des Rohan (deux tours), défile lentement (parallaxe)
  let cx = (-state.scrollX * 0.12) % (CANVAS_W + 200);
  if (cx < -200) cx += CANVAS_W + 200;
  ctx.fillStyle = '#27451c';
  const towerY = base - 30;
  ctx.fillRect(cx, towerY, 16, 30);
  ctx.fillRect(cx + 34, towerY, 16, 30);
  ctx.fillRect(cx + 14, towerY + 8, 22, 22);
  ctx.beginPath(); ctx.moveTo(cx - 2, towerY); ctx.lineTo(cx + 8, towerY - 10); ctx.lineTo(cx + 18, towerY); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx + 32, towerY); ctx.lineTo(cx + 42, towerY - 10); ctx.lineTo(cx + 52, towerY); ctx.fill();

  // Clocher de la basilique
  let sx = (-state.scrollX * 0.12 + (CANVAS_W + 200) / 2) % (CANVAS_W + 200);
  if (sx < -200) sx += CANVAS_W + 200;
  ctx.fillStyle = '#22401a';
  ctx.fillRect(sx, base - 26, 14, 26);
  ctx.beginPath(); ctx.moveTo(sx - 3, base - 26); ctx.lineTo(sx + 7, base - 44); ctx.lineTo(sx + 17, base - 26); ctx.fill();
  ctx.restore();
}

function drawSigns(ctx) {
  const y = ROAD_TOP + ROAD_LANES * LANE_H + 8; // bande d'herbe du bas
  ctx.save();
  ctx.font = 'bold 9px monospace';
  ctx.textBaseline = 'middle';
  for (const s of state.signs) {
    const w = Math.max(54, ctx.measureText(s.label).width + 12);
    // poteau
    ctx.fillStyle = '#5a4633';
    ctx.fillRect(s.x + w / 2 - 1.5, y + 14, 3, 14);
    // panneau
    ctx.fillStyle = '#1b5e20';
    ctx.strokeStyle = '#a5d6a7'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(s.x, y, w, 16, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8f5e9';
    ctx.textAlign = 'center';
    ctx.fillText(s.label, s.x + w / 2, y + 8);
  }
  ctx.restore();
}

function drawHUD(ctx) {
  const pct = Math.min(100, Math.round((state.survived / state.distance) * 100));
  document.getElementById('dg-dist').textContent  = `📍 ${pct}%`;
  document.getElementById('dg-wanted').textContent = `🚨 Wanted: ${state.wantedLevel}`;
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(10, 10, 200, 14);
  ctx.fillStyle = state.wantedLevel >= 3 ? '#ff4444' : '#4caf50';
  ctx.fillRect(10, 10, 200 * (state.survived / state.distance), 14);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(10, 10, 200, 14);
}

function tick() {
  if (!state.running) return;

  const targetY = laneY(state.player.lane);
  state.player.y += (targetY - state.player.y) * 0.18;

  if ((_keys['ArrowUp']   || _keys['w'] || _keys['W']) && state.player.lane > 0) { state.player.lane--; delete _keys['ArrowUp'];   delete _keys['w']; delete _keys['W']; }
  if ((_keys['ArrowDown'] || _keys['s'] || _keys['S']) && state.player.lane < ROAD_LANES - 1) { state.player.lane++; delete _keys['ArrowDown']; delete _keys['s']; delete _keys['S']; }

  state.scrollX  += state.speed;
  state.survived += state.speed;

  for (const m of state.roadMarkings) { m.x -= state.speed; if (m.x < -60) m.x += 16 * 80; }

  // Panneaux Pontivy défilants
  for (let i = state.signs.length - 1; i >= 0; i--) {
    state.signs[i].x -= state.speed;
    if (state.signs[i].x < -90) state.signs.splice(i, 1);
  }
  if (Math.floor(state.survived) % 140 < state.speed + 1) {
    state.signs.push({ x: CANVAS_W + 20, label: PONTIVY_SIGNS[Math.floor(Math.random() * PONTIVY_SIGNS.length)] });
  }

  const spawnRate = Math.max(60, 180 - state.wantedLevel * 25);
  if (Math.floor(state.survived) % spawnRate < state.speed + 1) {
    if (Math.random() < 0.35 + state.wantedLevel * 0.08) spawnCop();
  }

  state.wantedLevel = Math.min(5, Math.floor(state.survived / (state.distance / 5)));
  state.speed = 3.5 + state.wantedLevel * 0.4;

  for (let i = state.cops.length - 1; i >= 0; i--) {
    state.cops[i].x -= state.cops[i].speed;
    if (state.cops[i].x < -COP_W - 20) state.cops.splice(i, 1);
  }

  const ctx = _ctx;
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  if (state.hitFlash > 0) { ctx.fillStyle = `rgba(255,50,50,${state.hitFlash / 8})`; ctx.fillRect(0,0,CANVAS_W,CANVAS_H); state.hitFlash--; }
  drawRoad(ctx);
  drawLandmarks(ctx);
  drawSigns(ctx);

  for (const cop of state.cops) {
    drawCar(ctx, IMG_COP, cop.x, cop.y);
    ctx.fillStyle = Date.now() % 400 < 200 ? '#ff2222' : '#2255ff';
    ctx.fillRect(cop.x + COP_W*0.3, cop.y-6, 12, 5);
    ctx.fillStyle = Date.now() % 400 >= 200 ? '#ff2222' : '#2255ff';
    ctx.fillRect(cop.x + COP_W*0.55, cop.y-6, 12, 5);
  }

  const px = 80;
  drawCar(ctx, IMG_PLAYER, px, state.player.y);
  drawHUD(ctx);

  for (const cop of state.cops) {
    if (px < cop.x + COP_W - 6 && px + PLAYER_W - 6 > cop.x &&
        state.player.y < cop.y + COP_H - 4 && state.player.y + PLAYER_H - 4 > cop.y) {
      state.hitFlash = 12;
      stopGame(false);
      return;
    }
  }

  if (state.survived >= state.distance) { stopGame(true); return; }
  _raf = requestAnimationFrame(tick);
}

function stopGame(won) {
  state.running = false;
  cancelAnimationFrame(_raf);
  removeListeners();
  // Si une récompense fixe est fournie (mode commande), on l'utilise telle quelle,
  // sinon on calcule selon le cargo et le niveau de recherche atteint.
  const computed = Math.round(state.cargo * REWARD_PER_UNIT * (1 + state.wantedLevel * 0.15));
  const coinsEarned = won ? (state.rewardCoins != null ? state.rewardCoins : computed) : 0;
  buildResultScreen(won, coinsEarned, won ? state.cargo : 0);
  if (won  && _onComplete) _onComplete(coinsEarned, state.cargo);
  if (!won && _onFail)     _onFail();
}

function onKeyDown(e) { _keys[e.key] = true; }
function onKeyUp(e)   { delete _keys[e.key]; }
function onTouchStart(e) { _touchStartY = e.touches[0].clientY; }
function onTouchEnd(e) {
  if (_touchStartY === null) return;
  const dy = e.changedTouches[0].clientY - _touchStartY;
  if (Math.abs(dy) > 20) {
    if (dy < 0 && state.player.lane > 0) state.player.lane--;
    else if (dy > 0 && state.player.lane < ROAD_LANES - 1) state.player.lane++;
  }
  _touchStartY = null;
}

function addListeners() {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup',   onKeyUp);
  const cv = document.getElementById('delivery-canvas');
  cv?.addEventListener('touchstart', onTouchStart, { passive: true });
  cv?.addEventListener('touchend',   onTouchEnd,   { passive: true });
}
function removeListeners() {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup',   onKeyUp);
}

/**
 * Lance le mini-jeu de livraison dans Pontivy.
 * @param {object}   opts
 * @param {number}   [opts.cargo=1]            — quantité affichée dans le HUD
 * @param {string}   [opts.destinationName]    — lieu de Pontivy à atteindre
 * @param {string}   [opts.destinationEmoji]   — emoji du lieu
 * @param {number}   [opts.rewardCoins=null]   — récompense fixe si réussite (mode commande)
 * @param {number}   [opts.difficulty=1]       — 1..3, allonge le trajet
 * @param {function} [opts.onComplete]         — callback(coinsEarned, cargo)
 * @param {function} [opts.onFail]             — callback()
 */
export function launchDeliveryGame(opts = {}) {
  if (state.running) return;
  // Rétro-compat : ancien appel positionnel (cargo, onComplete, onFail)
  if (typeof opts === 'number') {
    opts = { cargo: opts, onComplete: arguments[1], onFail: arguments[2] };
  }
  const {
    cargo = 1,
    destinationName = '',
    destinationEmoji = '📍',
    rewardCoins = null,
    difficulty = 1,
    onComplete = null,
    onFail = null,
  } = opts;

  _onComplete = onComplete;
  _onFail     = onFail;
  _keys = {};
  const diff = Math.max(1, Math.min(3, difficulty));
  Object.assign(state, {
    running: true, scrollX: 0, survived: 0,
    distance: BASE_DISTANCE * (0.8 + diff * 0.35) + cargo * 30,
    cargo, speed: 3.5, wantedLevel: 0, cops: [], hitFlash: 0,
    signs: [],
    player: { lane: 1, y: laneY(1) },
    destinationName, destinationEmoji, rewardCoins, difficulty: diff,
  });
  buildOverlay(cargo);
  _canvas = document.getElementById('delivery-canvas');
  _ctx    = _canvas.getContext('2d');
  initRoadMarkings();
  initSigns();
  addListeners();
  _raf = requestAnimationFrame(tick);
}
