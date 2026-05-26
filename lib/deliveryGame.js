/**
 * deliveryGame.js — Mini-jeu de livraison top-down Canvas
 *
 * Mécanique :
 *  - La voiture du joueur (Mash de MutenRock) roule vers la droite
 *  - Route à défilement horizontal avec obstacles (voitures de police)
 *  - Clavier : flèches haut/bas, touches W/S, ou touch mobile
 *  - Distance à parcourir = DELIVERY_DISTANCE_PX (augmente avec le cargo)
 *  - Récompense = cargo * REWARD_PER_UNIT * multiplicateur distance
 *  - Collision police → game over, perte du cargo
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
const REWARD_PER_UNIT = 8; // pièces par graine livrée
const BASE_DISTANCE = 4000; // pixels scrollés pour terminer

let _onComplete = null; // callback(coinsEarned, seedsDelivered)
let _onFail     = null; // callback()
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
  player: { lane: 1, y: 0, targetY: 0 },
  cops: [],
  roadMarkings: [],
  wantedLevel: 0,
  survived: 0, // distance parcourue
  hitFlash: 0,
};

// ── Assets pixel art SVG inline ───────────────────────────────────────────────
const SHARED = 'https://nitro.sterenna.fr/shared/images/vehicule/';

function makeCarImg(src, fallbackColor, w, h) {
  const img = new Image();
  img.src = src;
  img.onerror = () => { img._failed = true; };
  img._fallbackColor = fallbackColor;
  img._w = w;
  img._h = h;
  return img;
}

const IMG_PLAYER = makeCarImg(`${SHARED}mash_muten.png`, '#e8a020', PLAYER_W, PLAYER_H);
const IMG_COP    = makeCarImg(`${SHARED}cop_car.png`,    '#1a6cf5', COP_W,    COP_H);

function drawCar(ctx, img, x, y) {
  if (img._failed || !img.complete || img.naturalWidth === 0) {
    // Fallback pixel-art dessiné canvas
    ctx.save();
    ctx.fillStyle = img._fallbackColor;
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1.5;
    const w = img._w, h = img._h;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill(); ctx.stroke();
    // Pare-brise
    ctx.fillStyle = 'rgba(180,220,255,0.5)';
    ctx.fillRect(x + w * 0.35, y + h * 0.12, w * 0.3, h * 0.45);
    // Roues
    ctx.fillStyle = '#111';
    [[x+4, y+h-8],[x+w-12,y+h-8],[x+4,y+2],[x+w-12,y+2]].forEach(([wx,wy]) => {
      ctx.fillRect(wx, wy, 10, 6);
    });
    if (img._fallbackColor === '#1a6cf5') {
      // Gyrophare
      ctx.fillStyle = '#ff3333';
      ctx.fillRect(x + w*0.3, y - 5, w*0.18, 5);
      ctx.fillStyle = '#3399ff';
      ctx.fillRect(x + w*0.52, y - 5, w*0.18, 5);
    }
    ctx.restore();
  } else {
    ctx.drawImage(img, x, y, img._w, img._h);
  }
}

// ── Init overlay DOM ──────────────────────────────────────────────────────────
function buildOverlay(cargo) {
  if (_overlay) _overlay.remove();
  _overlay = document.createElement('div');
  _overlay.id = 'delivery-overlay';
  _overlay.innerHTML = `
    <div class="dg-panel">
      <div class="dg-header">
        <span class="dg-title">🚗 LIVRAISON</span>
        <button class="dg-close" id="dg-close-btn" aria-label="Abandonner">✕ Abandonner</button>
      </div>
      <div class="dg-hud">
        <span id="dg-cargo">📦 ${cargo} graines</span>
        <span id="dg-dist">📍 0%</span>
        <span id="dg-wanted">🚨 Wanted: 0</span>
      </div>
      <canvas id="delivery-canvas" width="${CANVAS_W}" height="${CANVAS_H}"></canvas>
      <div class="dg-controls">⬆⬇ ou W/S pour changer de voie</div>
    </div>`;
  document.body.appendChild(_overlay);

  document.getElementById('dg-close-btn').addEventListener('click', () => stopGame(false));
  return _overlay;
}

function buildResultScreen(won, coinsEarned, seedsDelivered) {
  const panel = _overlay?.querySelector('.dg-panel');
  if (!panel) return;
  panel.innerHTML = `
    <div class="dg-result ${won ? 'dg-win' : 'dg-lose'}">
      <div class="dg-result-icon">${won ? '🎉' : '🚨'}</div>
      <div class="dg-result-title">${won ? 'LIVRAISON RÉUSSIE !' : 'ARRÊTÉ PAR LA POLICE !'}</div>
      ${ won
        ? `<div class="dg-result-body">+🪙 <strong>${coinsEarned}</strong> pièces<br>${seedsDelivered} graines livrées</div>`
        : `<div class="dg-result-body">Cargo confisqué. Rien gagné.</div>`
      }
      <button class="dg-close-result" id="dg-result-close">Continuer</button>
    </div>`;
  document.getElementById('dg-result-close').addEventListener('click', () => {
    _overlay?.remove();
    _overlay = null;
  });
}

// ── Game loop ─────────────────────────────────────────────────────────────────
function laneY(lane) {
  return ROAD_TOP + lane * LANE_H + (LANE_H - PLAYER_H) / 2;
}

function spawnCop() {
  const lane = Math.floor(Math.random() * ROAD_LANES);
  state.cops.push({
    x: CANVAS_W + 60,
    y: laneY(lane),
    lane,
    speed: state.speed * (0.6 + Math.random() * 0.5),
  });
}

function initRoadMarkings() {
  state.roadMarkings = [];
  for (let i = 0; i < 16; i++) {
    state.roadMarkings.push({ x: i * 80 });
  }
}

function drawRoad(ctx) {
  // Asphalte
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, ROAD_TOP, CANVAS_W, ROAD_LANES * LANE_H);

  // Bords de route
  ctx.fillStyle = '#e8c840';
  ctx.fillRect(0, ROAD_TOP, CANVAS_W, 4);
  ctx.fillRect(0, ROAD_TOP + ROAD_LANES * LANE_H - 4, CANVAS_W, 4);

  // Lignes de séparation de voie
  ctx.setLineDash([30, 20]);
  ctx.strokeStyle = '#ffffff55';
  ctx.lineWidth = 2;
  for (let l = 1; l < ROAD_LANES; l++) {
    const y = ROAD_TOP + l * LANE_H;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_W, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Marquages animés
  for (const m of state.roadMarkings) {
    ctx.fillStyle = '#ffffff22';
    ctx.fillRect(m.x, ROAD_TOP + ROAD_LANES * LANE_H / 2 - 2, 40, 4);
  }

  // Herbe
  ctx.fillStyle = '#3a6b25';
  ctx.fillRect(0, 0, CANVAS_W, ROAD_TOP);
  ctx.fillRect(0, ROAD_TOP + ROAD_LANES * LANE_H, CANVAS_W, CANVAS_H - ROAD_TOP - ROAD_LANES * LANE_H);

  // Arbres décoratifs
  for (let x = (state.scrollX * 0.3) % 120 - 120; x < CANVAS_W + 60; x += 120) {
    ctx.fillStyle = '#2d5a1e';
    ctx.beginPath();
    ctx.arc(x, 20, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 30, 280, 12, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHUD(ctx) {
  const pct = Math.min(100, Math.round((state.survived / state.distance) * 100));
  document.getElementById('dg-dist').textContent  = `📍 ${pct}%`;
  document.getElementById('dg-wanted').textContent = `🚨 Wanted: ${state.wantedLevel}`;

  // Barre de progression
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(10, 10, 200, 14);
  ctx.fillStyle = state.wantedLevel >= 3 ? '#ff4444' : '#4caf50';
  ctx.fillRect(10, 10, 200 * (state.survived / state.distance), 14);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(10, 10, 200, 14);
}

function tick() {
  if (!state.running) return;

  // Mouvement joueur (smooth)
  const targetY = laneY(state.player.lane);
  state.player.y += (targetY - state.player.y) * 0.18;

  // Input clavier
  if ((_keys['ArrowUp'] || _keys['w'] || _keys['W']) && state.player.lane > 0) {
    state.player.lane--;
    delete _keys['ArrowUp']; delete _keys['w']; delete _keys['W'];
  }
  if ((_keys['ArrowDown'] || _keys['s'] || _keys['S']) && state.player.lane < ROAD_LANES - 1) {
    state.player.lane++;
    delete _keys['ArrowDown']; delete _keys['s']; delete _keys['S'];
  }

  // Scroll
  state.scrollX  += state.speed;
  state.survived += state.speed;

  // Road markings
  for (const m of state.roadMarkings) {
    m.x -= state.speed;
    if (m.x < -60) m.x += 16 * 80;
  }

  // Spawn cops (fréquence augmente avec wanted level)
  const spawnRate = Math.max(60, 180 - state.wantedLevel * 25);
  if (Math.floor(state.survived) % spawnRate < state.speed + 1) {
    if (Math.random() < 0.35 + state.wantedLevel * 0.08) spawnCop();
  }

  // Wanted level augmente avec la distance
  state.wantedLevel = Math.min(5, Math.floor(state.survived / (state.distance / 5)));
  state.speed = 3.5 + state.wantedLevel * 0.4;

  // Déplacement et nettoyage des flics
  for (let i = state.cops.length - 1; i >= 0; i--) {
    state.cops[i].x -= state.cops[i].speed;
    if (state.cops[i].x < -COP_W - 20) state.cops.splice(i, 1);
  }

  // Dessin
  const ctx = _ctx;
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  if (state.hitFlash > 0) {
    ctx.fillStyle = `rgba(255,50,50,${state.hitFlash / 8})`;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    state.hitFlash--;
  }
  drawRoad(ctx);

  // Police
  for (const cop of state.cops) {
    drawCar(ctx, IMG_COP, cop.x, cop.y);
    // Gyrophare animé
    ctx.fillStyle = Date.now() % 400 < 200 ? '#ff2222' : '#2255ff';
    ctx.fillRect(cop.x + COP_W * 0.3, cop.y - 6, 12, 5);
    ctx.fillStyle = Date.now() % 400 >= 200 ? '#ff2222' : '#2255ff';
    ctx.fillRect(cop.x + COP_W * 0.55, cop.y - 6, 12, 5);
  }

  // Joueur
  const px = 80;
  drawCar(ctx, IMG_PLAYER, px, state.player.y);

  drawHUD(ctx);

  // Collision
  for (const cop of state.cops) {
    const overlap = (
      px < cop.x + COP_W - 6 &&
      px + PLAYER_W - 6 > cop.x &&
      state.player.y < cop.y + COP_H - 4 &&
      state.player.y + PLAYER_H - 4 > cop.y
    );
    if (overlap) {
      state.hitFlash = 12;
      stopGame(false);
      return;
    }
  }

  // Victoire
  if (state.survived >= state.distance) {
    stopGame(true);
    return;
  }

  _raf = requestAnimationFrame(tick);
}

function stopGame(won) {
  state.running = false;
  cancelAnimationFrame(_raf);
  removeListeners();

  const coinsEarned = won
    ? Math.round(state.cargo * REWARD_PER_UNIT * (1 + state.wantedLevel * 0.15))
    : 0;

  buildResultScreen(won, coinsEarned, won ? state.cargo : 0);

  if (won && _onComplete) _onComplete(coinsEarned, state.cargo);
  else if (!won && _onFail) _onFail();
}

// ── Listeners ─────────────────────────────────────────────────────────────────
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

// ── API publique ──────────────────────────────────────────────────────────────
/**
 * Lance le mini-jeu.
 * @param {number}   cargo       - Nb de graines à livrer (inventaire total)
 * @param {function} onComplete  - callback(coinsEarned, seedsDelivered)
 * @param {function} onFail      - callback()
 */
export function launchDeliveryGame(cargo, onComplete, onFail) {
  if (state.running) return;
  _onComplete = onComplete;
  _onFail     = onFail;
  _keys = {};

  Object.assign(state, {
    running:     true,
    scrollX:     0,
    survived:    0,
    distance:    BASE_DISTANCE + cargo * 30, // livraison plus longue si cargo plus lourd
    cargo,
    speed:       3.5,
    wantedLevel: 0,
    cops:        [],
    hitFlash:    0,
    player:      { lane: 1, y: laneY(1), targetY: laneY(1) },
  });

  buildOverlay(cargo);
  _canvas = document.getElementById('delivery-canvas');
  _ctx    = _canvas.getContext('2d');
  initRoadMarkings();
  addListeners();

  _raf = requestAnimationFrame(tick);
}
