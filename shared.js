/* ═══════════════════════════════════════════════════════════════
   MAAS ARCADE — Shared Infrastructure
   ThemeManager, TouchManager, ArcadeDataManager, AudioManager, Navigation
   ═══════════════════════════════════════════════════════════════ */

// ── Scroll Lock (prevents ALL iOS bounce/scroll on game pages) ──
(function lockScroll() {
  if (document.body.classList.contains('hub-page')) return;
  function kill(e) { e.preventDefault(); }
  window.addEventListener('touchmove', kill, { passive: false });
  document.addEventListener('touchmove', kill, { passive: false });
  document.documentElement.addEventListener('touchmove', kill, { passive: false });
  document.body.addEventListener('touchmove', kill, { passive: false });
  window.addEventListener('scroll', () => window.scrollTo(0, 0));
  document.addEventListener('gesturestart', kill);
  document.addEventListener('gesturechange', kill);
  document.addEventListener('gestureend', kill);
  document.addEventListener('contextmenu', e => e.preventDefault());
})();

// ══════════════════════════════════════════
//  ArcadeDataManager — localStorage wrapper
// ══════════════════════════════════════════
const ArcadeData = (() => {
  const KEY = 'arcade_data';
  const GAME_IDS = [
    'bloom-puzzle','neon-2048','hex-crush','snake-flux','void-defense',
    'memory-matrix','garden-maze','flappy-petal','sudoku-noir','minesweeper',
    'blade-of-ruin'
  ];

  function getDefault() {
    const scores = {};
    GAME_IDS.forEach(id => {
      scores[id] = { best: 0, gamesPlayed: 0, lastPlayed: null };
    });
    return {
      currency: { petals: 0, blooms: 0 },
      scores,
      unlocks: { themes: ['default'], towers: [], mazeTrails: ['vine'] },
      settings: { sound: true, haptics: true }
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        const data = getDefault();
        // Migrate old bloom puzzle score
        const oldBest = parseInt(localStorage.getItem('bloom_puzzle_best') || '0');
        if (oldBest > 0) {
          data.scores['bloom-puzzle'].best = oldBest;
        }
        save(data);
        return data;
      }
      const data = JSON.parse(raw);
      // Ensure all game IDs exist
      const def = getDefault();
      GAME_IDS.forEach(id => {
        if (!data.scores[id]) data.scores[id] = def.scores[id];
      });
      if (!data.currency) data.currency = def.currency;
      if (!data.unlocks) data.unlocks = def.unlocks;
      if (!data.settings) data.settings = def.settings;
      return data;
    } catch {
      return getDefault();
    }
  }

  function save(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
  }

  function get() { return load(); }

  function getBest(gameId) {
    return load().scores[gameId]?.best || 0;
  }

  function submitScore(gameId, score) {
    const data = load();
    if (!data.scores[gameId]) data.scores[gameId] = { best: 0, gamesPlayed: 0, lastPlayed: null };
    const entry = data.scores[gameId];
    const oldBest = entry.best;
    entry.gamesPlayed++;
    entry.lastPlayed = Date.now();
    if (score > entry.best) entry.best = score;
    save(data);
    return score > oldBest;
  }

  function earnPetals(amount) {
    const data = load();
    data.currency.petals += Math.floor(amount);
    save(data);
    return data.currency.petals;
  }

  function spendPetals(amount) {
    const data = load();
    if (data.currency.petals >= amount) {
      data.currency.petals -= amount;
      save(data);
      return true;
    }
    return false;
  }

  function earnBlooms(amount) {
    const data = load();
    data.currency.blooms += Math.floor(amount);
    save(data);
    return data.currency.blooms;
  }

  function getPetals() { return load().currency.petals; }
  function getBlooms() { return load().currency.blooms; }

  function getSetting(key) { return load().settings[key]; }
  function setSetting(key, val) {
    const data = load();
    data.settings[key] = val;
    save(data);
  }

  return {
    get, getBest, submitScore,
    earnPetals, spendPetals, earnBlooms,
    getPetals, getBlooms,
    getSetting, setSetting, GAME_IDS
  };
})();

// ══════════════════════════════════════════
//  TouchManager — Pointer Events based
// ══════════════════════════════════════════
class TouchManager {
  constructor(element, opts = {}) {
    this.el = element;
    this.dragThreshold = opts.dragThreshold || 8;
    this.swipeThreshold = opts.swipeThreshold || 40;
    this.longPressTime = opts.longPressTime || 500;

    this._onTap = opts.onTap || null;
    this._onDragStart = opts.onDragStart || null;
    this._onDrag = opts.onDrag || null;
    this._onDragEnd = opts.onDragEnd || null;
    this._onSwipe = opts.onSwipe || null;
    this._onLongPress = opts.onLongPress || null;

    this._pointerId = null;
    this._startX = 0;
    this._startY = 0;
    this._startTarget = null;
    this._startTime = 0;
    this._isDragging = false;
    this._longPressTimer = null;
    this._rafId = null;
    this._lastMoveX = 0;
    this._lastMoveY = 0;
    this._needsUpdate = false;

    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
    this._updateLoop = this._updateLoop.bind(this);

    element.addEventListener('pointerdown', this._onDown);
    element.addEventListener('pointermove', this._onMove);
    element.addEventListener('pointerup', this._onUp);
    element.addEventListener('pointercancel', this._onUp);
  }

  _onDown(e) {
    if (this._pointerId !== null) return;
    this._pointerId = e.pointerId;
    this._startX = e.clientX;
    this._startY = e.clientY;
    this._startTarget = e.target;
    this._lastMoveX = e.clientX;
    this._lastMoveY = e.clientY;
    this._startTime = Date.now();
    this._isDragging = false;

    // Don't capture pointer on links/buttons — let browser handle navigation
    const tag = e.target.closest('a, button, [onclick]');
    if (!tag) { try { this.el.setPointerCapture(e.pointerId); } catch {} }

    // Long press timer
    if (this._onLongPress) {
      this._longPressTimer = setTimeout(() => {
        if (!this._isDragging && this._pointerId !== null) {
          this._onLongPress({ x: this._startX, y: this._startY, target: e.target, event: e });
          this._pointerId = null; // consume the gesture
        }
      }, this.longPressTime);
    }
  }

  _onMove(e) {
    if (e.pointerId !== this._pointerId) return;
    this._lastMoveX = e.clientX;
    this._lastMoveY = e.clientY;

    const dx = e.clientX - this._startX;
    const dy = e.clientY - this._startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (!this._isDragging && dist >= this.dragThreshold) {
      this._isDragging = true;
      clearTimeout(this._longPressTimer);
      if (this._onDragStart) {
        this._onDragStart({
          x: e.clientX, y: e.clientY,
          startX: this._startX, startY: this._startY,
          target: this._startTarget, event: e
        });
      }
      this._startUpdateLoop();
    }

    if (this._isDragging) {
      e.preventDefault();
      this._needsUpdate = true;
    }
  }

  _startUpdateLoop() {
    if (this._rafId) return;
    this._rafId = requestAnimationFrame(this._updateLoop);
  }

  _updateLoop() {
    if (this._pointerId === null) {
      this._rafId = null;
      return;
    }
    if (this._needsUpdate && this._onDrag) {
      this._needsUpdate = false;
      this._onDrag({
        x: this._lastMoveX, y: this._lastMoveY,
        dx: this._lastMoveX - this._startX,
        dy: this._lastMoveY - this._startY,
        startX: this._startX, startY: this._startY
      });
    }
    this._rafId = requestAnimationFrame(this._updateLoop);
  }

  _onUp(e) {
    if (e.pointerId !== this._pointerId) return;
    clearTimeout(this._longPressTimer);
    cancelAnimationFrame(this._rafId);
    this._rafId = null;

    const dx = e.clientX - this._startX;
    const dy = e.clientY - this._startY;
    const dt = Date.now() - this._startTime;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (this._isDragging) {
      // Check if this drag qualifies as a swipe
      const velocity = dist / Math.max(dt, 1);
      if (this._onSwipe && dist >= this.swipeThreshold && velocity > 0.2) {
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        let dir;
        if (absX > absY) dir = dx > 0 ? 'right' : 'left';
        else dir = dy > 0 ? 'down' : 'up';
        this._onSwipe({ direction: dir, dx, dy, velocity, target: e.target });
      } else if (this._onDragEnd) {
        this._onDragEnd({
          x: e.clientX, y: e.clientY,
          dx, dy, startX: this._startX, startY: this._startY,
          target: e.target, event: e
        });
      }
    } else {
      // Short touch — tap
      if (this._onTap) {
        this._onTap({ x: e.clientX, y: e.clientY, target: e.target, event: e });
      }
    }

    this._pointerId = null;
    this._isDragging = false;
  }

  destroy() {
    this.el.removeEventListener('pointerdown', this._onDown);
    this.el.removeEventListener('pointermove', this._onMove);
    this.el.removeEventListener('pointerup', this._onUp);
    this.el.removeEventListener('pointercancel', this._onUp);
    clearTimeout(this._longPressTimer);
    cancelAnimationFrame(this._rafId);
  }
}

// ══════════════════════════════════════════
//  AudioManager — Web Audio API wrapper
// ══════════════════════════════════════════
const AudioManager = (() => {
  let ctx = null;

  function init() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function isEnabled() {
    return ArcadeData.getSetting('sound') !== false;
  }

  function playTone(freq, duration = 0.1, volume = 0.08) {
    if (!isEnabled()) return;
    try {
      const c = init();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain);
      gain.connect(c.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, c.currentTime);
      gain.gain.setValueAtTime(volume, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
      osc.start(c.currentTime);
      osc.stop(c.currentTime + duration);
    } catch {}
  }

  function playPlace() {
    playTone(523.25, 0.1, 0.06);
    setTimeout(() => playTone(659.25, 0.08, 0.04), 50);
  }

  function playClear() {
    playTone(523.25, 0.15, 0.06);
    setTimeout(() => playTone(659.25, 0.12, 0.06), 80);
    setTimeout(() => playTone(783.99, 0.2, 0.06), 160);
  }

  function playSuccess() {
    playTone(523.25, 0.15, 0.07);
    setTimeout(() => playTone(659.25, 0.12, 0.07), 100);
    setTimeout(() => playTone(783.99, 0.15, 0.07), 200);
    setTimeout(() => playTone(1046.5, 0.3, 0.07), 300);
  }

  function playFail() {
    playTone(311.13, 0.2, 0.06);
    setTimeout(() => playTone(261.63, 0.3, 0.06), 150);
  }

  function playClick() {
    playTone(880, 0.05, 0.04);
  }

  // Init audio on first user interaction
  function autoInit() {
    const once = () => {
      init();
      document.removeEventListener('pointerdown', once);
    };
    document.addEventListener('pointerdown', once);
  }

  autoInit();

  return { init, playTone, playPlace, playClear, playSuccess, playFail, playClick, isEnabled };
})();

// ══════════════════════════════════════════
//  Navigation Helpers
// ══════════════════════════════════════════
function goToHub() {
  const base = window.location.pathname;
  if (base.includes('/games/')) {
    window.location.href = '../index.html';
  } else {
    window.location.href = 'index.html';
  }
}

function goToGame(gameId) {
  window.location.href = 'games/' + gameId + '.html';
}

// ══════════════════════════════════════════
//  Background Ambiance (reusable)
// ══════════════════════════════════════════
class AmbientBackground {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.running = false;
    this.stars = [];
    this.particles = [];
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w; this.h = h;
    if (this.stars.length === 0) {
      for (let i = 0; i < 70; i++) {
        this.stars.push({
          x: Math.random(), y: Math.random() * 0.72,
          size: 0.4 + Math.random() * 1.2,
          phase: Math.random() * Math.PI * 2,
          twinkle: 0.15 + Math.random() * 0.55,
          color: i % 5 === 0 ? '#aaccff' : i % 7 === 0 ? '#ffddaa' : '#ffffff',
        });
      }
      for (let i = 0; i < 20; i++) {
        this.particles.push({
          x: Math.random(), y: Math.random(),
          speed: 0.008 + Math.random() * 0.015,
          phase: Math.random() * Math.PI * 2,
          color: i % 3 === 0 ? '#cc8844' : i % 3 === 1 ? '#8866cc' : '#6688cc',
        });
      }
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._animate();
  }

  _animate() {
    if (!this.running) return;
    const { ctx, w, h } = this;
    const now = Date.now() * 0.001;
    ctx.clearRect(0, 0, w, h);

    // ── Sky gradient ──
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#0a0a18');
    sky.addColorStop(0.3, '#14143a');
    sky.addColorStop(0.6, '#1f1f56');
    sky.addColorStop(0.85, '#2a1a40');
    sky.addColorStop(1, '#1a0c20');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // ── Twinkling stars ──
    for (const s of this.stars) {
      const alpha = s.twinkle * (0.5 + 0.5 * Math.sin(now * 1.5 + s.phase));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(s.x * w, s.y * h, s.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ── Shooting star ──
    const shootCycle = (now * 0.15) % 14;
    if (shootCycle < 0.6) {
      ctx.save();
      const sp = shootCycle / 0.6;
      const sx = w * 0.15 + sp * w * 0.55;
      const sy = h * 0.04 + sp * h * 0.18;
      ctx.globalAlpha = (1 - sp) * 0.5;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - 35, sy - 10); ctx.stroke();
      ctx.restore();
    }

    // ── Nebula clouds ──
    ctx.save();
    const nebData = [
      [0.18, 0.22, 90, '80,40,140'], [0.50, 0.28, 100, '60,30,120'],
      [0.78, 0.35, 80, '120,40,100'], [0.35, 0.45, 70, '50,25,100'],
      [0.65, 0.18, 75, '100,30,80'], [0.88, 0.50, 65, '70,35,130'],
    ];
    for (const [rx, ry, r, c] of nebData) {
      const nx = w * rx + Math.sin(now * 0.08 + rx * 10) * w * 0.04;
      const ny = h * ry + Math.cos(now * 0.06 + ry * 10) * 12;
      const ng = ctx.createRadialGradient(nx, ny, 5, nx, ny, r);
      ng.addColorStop(0, `rgba(${c},0.1)`);
      ng.addColorStop(0.5, `rgba(${c},0.04)`);
      ng.addColorStop(1, 'transparent');
      ctx.fillStyle = ng;
      ctx.beginPath(); ctx.ellipse(nx, ny, r, r * 0.5, rx, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // ── Horizon glow ──
    const horizY = h * 0.78;
    ctx.save();
    const hg = ctx.createLinearGradient(0, horizY - 50, 0, horizY + 15);
    hg.addColorStop(0, 'transparent');
    hg.addColorStop(0.5, 'rgba(140,40,80,0.08)');
    hg.addColorStop(0.8, 'rgba(180,50,90,0.1)');
    hg.addColorStop(1, 'rgba(100,30,60,0.05)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, horizY - 50, w, 65);
    ctx.restore();

    // ── Far mountains ──
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#0a0810';
    ctx.beginPath(); ctx.moveTo(0, horizY);
    const fp = [0.08,0.62, 0.18,0.52, 0.28,0.58, 0.38,0.48, 0.50,0.55, 0.58,0.45, 0.68,0.52, 0.78,0.58, 0.88,0.50, 1.0,0.60];
    for (let i = 0; i < fp.length; i += 2) ctx.lineTo(w * fp[i], h * fp[i+1]);
    ctx.lineTo(w, horizY); ctx.closePath(); ctx.fill();
    // Near mountains
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#060510';
    ctx.beginPath(); ctx.moveTo(0, horizY);
    const np = [0.05,0.72, 0.12,0.60, 0.22,0.68, 0.30,0.56, 0.40,0.65, 0.48,0.52, 0.55,0.62, 0.65,0.54, 0.75,0.64, 0.82,0.58, 0.92,0.66, 1.0,0.70];
    for (let i = 0; i < np.length; i += 2) ctx.lineTo(w * np[i], h * np[i+1]);
    ctx.lineTo(w, horizY); ctx.closePath(); ctx.fill();
    // Moon rim lighting on ridgeline
    ctx.strokeStyle = 'rgba(140,120,180,0.06)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < np.length; i += 2) {
      if (i === 0) ctx.moveTo(w * np[i], h * np[i+1]);
      else ctx.lineTo(w * np[i], h * np[i+1]);
    }
    ctx.stroke();
    ctx.restore();

    // ── Treeline at base ──
    ctx.save();
    ctx.fillStyle = '#050408';
    ctx.beginPath(); ctx.moveTo(0, horizY);
    for (let x = 0; x <= w; x += 8) {
      const th = 5 + Math.sin(x * 0.03) * 4 + Math.sin(x * 0.08 + 1) * 3;
      ctx.lineTo(x, horizY - th);
    }
    ctx.lineTo(w, horizY); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
    ctx.restore();

    // ── Floating magic particles ──
    ctx.save();
    for (const p of this.particles) {
      p.y -= p.speed;
      if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
      ctx.globalAlpha = 0.2 + Math.sin(now * 2 + p.phase) * 0.1;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x * w, p.y * h, 1.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // ── Vignette ──
    ctx.save();
    const vig = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.3, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    vig.addColorStop(0, 'transparent');
    vig.addColorStop(1, 'rgba(5,3,10,0.5)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    requestAnimationFrame(() => this._animate());
  }

  stop() { this.running = false; }
}

// ══════════════════════════════════════════
//  Particle System (reusable)
// ══════════════════════════════════════════
class ParticleSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.running = false;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  spawn(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4 - 2,
        life: 1,
        decay: 0.015 + Math.random() * 0.02,
        size: 3 + Math.random() * 5,
        color,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.15,
        type: Math.random() > 0.5 ? 'petal' : 'dot'
      });
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._animate();
  }

  _animate() {
    if (!this.running) return;
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.particles = this.particles.filter(p => p.life > 0);
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.life -= p.decay;
      p.rotation += p.rotSpeed;
      p.size *= 0.998;
      if (p.life <= 0) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = p.life * 0.8;
      ctx.fillStyle = p.color;
      if (p.type === 'petal') {
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    requestAnimationFrame(() => this._animate());
  }

  stop() { this.running = false; }
}

// Color map for particles
const PETAL_COLOR_MAP = {
  rose: '#d4728c', blush: '#e8a0b0', peach: '#e8b87a',
  lavender: '#9b8ec4', sage: '#8fb89a', sky: '#7aaec4', iris: '#7b6fa0'
};

// ── Haptics ──
function haptic(style = 'light') {
  if (ArcadeData.getSetting('haptics') === false) return;
  if (navigator.vibrate) {
    if (style === 'light') navigator.vibrate(10);
    else if (style === 'medium') navigator.vibrate(25);
    else if (style === 'heavy') navigator.vibrate(50);
  }
}

// ══════════════════════════════════════════
//  ThemeManager — Hub themes + per-game skins
// ══════════════════════════════════════════
const ThemeManager = (() => {
  // 4 hub themes — each overrides core CSS variables
  const HUB_THEMES = {
    'void-neon': {
      label: 'Void Neon',
      '--void': '#0a0818',
      '--void-mid': '#12102a',
      '--void-light': '#1a1530',
      '--surface': '#221c3a',
      '--surface-light': '#2e264a',
      '--iris-deep': '#4a3f6b',
      '--iris-mid': '#7b6fa0',
      '--iris-light': '#b8a9d4',
      '--moon-glow': '#f5f0e8',
      '--moon-gold': '#d4a86a',
      '--glass-bg': 'rgba(30, 24, 50, 0.6)',
      '--glass-border': 'rgba(184, 169, 212, 0.12)',
      '--hub-gradient-a': 'rgba(74,63,107,0.15)',
      '--hub-gradient-b': 'rgba(212,114,140,0.08)',
    },
    'hyperspace': {
      label: 'Hyperspace',
      '--void': '#020a14',
      '--void-mid': '#061826',
      '--void-light': '#0a2238',
      '--surface': '#0f2e4a',
      '--surface-light': '#163a58',
      '--iris-deep': '#1a4a7a',
      '--iris-mid': '#3a8acf',
      '--iris-light': '#7abcf0',
      '--moon-glow': '#e8f4ff',
      '--moon-gold': '#6ac4ff',
      '--glass-bg': 'rgba(6, 24, 50, 0.65)',
      '--glass-border': 'rgba(100, 180, 255, 0.12)',
      '--hub-gradient-a': 'rgba(20,80,160,0.15)',
      '--hub-gradient-b': 'rgba(0,180,255,0.08)',
    },
    'mirkwood': {
      label: 'Mirkwood',
      '--void': '#060d08',
      '--void-mid': '#0c1a10',
      '--void-light': '#142618',
      '--surface': '#1c3422',
      '--surface-light': '#24422c',
      '--iris-deep': '#2a5a38',
      '--iris-mid': '#48a060',
      '--iris-light': '#7acc8e',
      '--moon-glow': '#e8f5e8',
      '--moon-gold': '#c9a84c',
      '--glass-bg': 'rgba(12, 30, 18, 0.65)',
      '--glass-border': 'rgba(120, 200, 140, 0.12)',
      '--hub-gradient-a': 'rgba(30,100,50,0.15)',
      '--hub-gradient-b': 'rgba(200,168,76,0.08)',
    },
    'mordor-forge': {
      label: 'Mordor Forge',
      '--void': '#140804',
      '--void-mid': '#201008',
      '--void-light': '#2c180c',
      '--surface': '#3a2010',
      '--surface-light': '#4a2a16',
      '--iris-deep': '#6a3a1a',
      '--iris-mid': '#b06030',
      '--iris-light': '#e0a060',
      '--moon-glow': '#fff0d8',
      '--moon-gold': '#ff8c00',
      '--glass-bg': 'rgba(40, 20, 10, 0.65)',
      '--glass-border': 'rgba(224, 160, 96, 0.12)',
      '--hub-gradient-a': 'rgba(160,60,10,0.15)',
      '--hub-gradient-b': 'rgba(255,140,0,0.08)',
    },
  };

  // Per-game skins — 3 color variants per game (accent + glow)
  const GAME_SKINS = {
    'bloom-puzzle': [
      { label: 'Neon Rose', accent: '#ff6b9d', glow: 'rgba(255,107,157,0.3)' },
      { label: 'Kyber Blue', accent: '#00bfff', glow: 'rgba(0,191,255,0.3)' },
      { label: 'Elvish Gold', accent: '#ffd740', glow: 'rgba(255,215,64,0.3)' },
    ],
    'hex-crush': [
      { label: 'Neon Magenta', accent: '#e040fb', glow: 'rgba(224,64,251,0.3)' },
      { label: 'Sith Red', accent: '#ff3333', glow: 'rgba(255,51,51,0.3)' },
      { label: 'Tron Cyan', accent: '#00e5ff', glow: 'rgba(0,229,255,0.3)' },
    ],
    'snake-flux': [
      { label: 'Neon Green', accent: '#76ff03', glow: 'rgba(118,255,3,0.3)' },
      { label: 'Mithril Silver', accent: '#c0d8e8', glow: 'rgba(192,216,232,0.3)' },
      { label: 'Lava Orange', accent: '#ff6600', glow: 'rgba(255,102,0,0.3)' },
    ],
    'void-defense': [
      { label: 'Neon Purple', accent: '#b388ff', glow: 'rgba(179,136,255,0.3)' },
      { label: 'Empire Blue', accent: '#4488cc', glow: 'rgba(68,136,204,0.3)' },
      { label: 'Rebellion Red', accent: '#ff4444', glow: 'rgba(255,68,68,0.3)' },
    ],
    'memory-matrix': [
      { label: 'Neon Gold', accent: '#ffd740', glow: 'rgba(255,215,64,0.3)' },
      { label: 'Force Purple', accent: '#b388ff', glow: 'rgba(179,136,255,0.3)' },
      { label: 'Shire Green', accent: '#76ff03', glow: 'rgba(118,255,3,0.3)' },
    ],
    'garden-maze': [
      { label: 'Neon Lime', accent: '#c6ff00', glow: 'rgba(198,255,0,0.3)' },
      { label: 'Rivendell Blue', accent: '#4fc3f7', glow: 'rgba(79,195,247,0.3)' },
      { label: 'Ember Orange', accent: '#ff9100', glow: 'rgba(255,145,0,0.3)' },
    ],
    'flappy-petal': [
      { label: 'Neon Rose', accent: '#ff6b9d', glow: 'rgba(255,107,157,0.3)' },
      { label: 'Lightsaber Green', accent: '#44ff44', glow: 'rgba(68,255,68,0.3)' },
      { label: 'Ring Gold', accent: '#ffd740', glow: 'rgba(255,215,64,0.3)' },
    ],
    'sudoku-noir': [
      { label: 'Neon Gold', accent: '#ffd740', glow: 'rgba(255,215,64,0.3)' },
      { label: 'Grid Cyan', accent: '#00e5ff', glow: 'rgba(0,229,255,0.3)' },
      { label: 'Shadow Red', accent: '#ff4444', glow: 'rgba(255,68,68,0.3)' },
    ],
    'minesweeper': [
      { label: 'Neon Cyan', accent: '#00e5ff', glow: 'rgba(0,229,255,0.3)' },
      { label: 'Gandalf White', accent: '#e0dce8', glow: 'rgba(224,220,232,0.3)' },
      { label: 'Mordor Red', accent: '#cc3333', glow: 'rgba(204,51,51,0.3)' },
    ],
    'blade-of-ruin': [
      { label: 'Crimson', accent: '#ff4444', glow: 'rgba(255,68,68,0.3)' },
      { label: 'Shadow Purple', accent: '#9944cc', glow: 'rgba(153,68,204,0.3)' },
      { label: 'Flame Gold', accent: '#ff8c00', glow: 'rgba(255,140,0,0.3)' },
    ],
  };

  function setTheme(name) {
    const theme = HUB_THEMES[name];
    if (!theme) return;
    const root = document.documentElement;
    for (const [prop, val] of Object.entries(theme)) {
      if (prop.startsWith('--')) root.style.setProperty(prop, val);
    }
    ArcadeData.setSetting('theme', name);
  }

  function setGameSkin(gameId, skinIndex) {
    const skins = GAME_SKINS[gameId];
    if (!skins || !skins[skinIndex]) return;
    const skin = skins[skinIndex];
    const root = document.documentElement;
    root.style.setProperty('--game-accent', skin.accent);
    root.style.setProperty('--game-glow', skin.glow);
    ArcadeData.setSetting('skin_' + gameId, skinIndex);
  }

  function getTheme() {
    return ArcadeData.getSetting('theme') || 'void-neon';
  }

  function getGameSkin(gameId) {
    return ArcadeData.getSetting('skin_' + gameId) || 0;
  }

  function applyStored() {
    const themeName = getTheme();
    if (themeName && HUB_THEMES[themeName]) setTheme(themeName);

    // Detect current game from pathname
    const path = window.location.pathname;
    const match = path.match(/games\/([^.]+)\.html/);
    if (match) {
      const gameId = match[1];
      const skinIdx = getGameSkin(gameId);
      if (skinIdx > 0 && GAME_SKINS[gameId]) setGameSkin(gameId, skinIdx);
    }
  }

  // Auto-apply on load
  applyStored();

  return {
    HUB_THEMES, GAME_SKINS,
    setTheme, setGameSkin,
    getTheme, getGameSkin,
    applyStored
  };
})();
