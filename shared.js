/* ═══════════════════════════════════════════════════════════════
   IRIS MOON ARCADE — Shared Infrastructure
   TouchManager, ArcadeDataManager, AudioManager, Navigation
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
    'memory-matrix','garden-maze','flappy-petal','sudoku-noir','minesweeper'
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

    try { this.el.setPointerCapture(e.pointerId); } catch {}

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
    this.floaters = [];
    this.running = false;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    if (this.floaters.length === 0) {
      for (let i = 0; i < 30; i++) {
        this.floaters.push({
          x: Math.random() * this.canvas.width,
          y: Math.random() * this.canvas.height,
          size: 1 + Math.random() * 3,
          speed: 0.1 + Math.random() * 0.3,
          opacity: 0.1 + Math.random() * 0.2,
          phase: Math.random() * Math.PI * 2,
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
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const grad = ctx.createRadialGradient(
      canvas.width * 0.5, canvas.height * 0.3, 0,
      canvas.width * 0.5, canvas.height * 0.3, canvas.width * 0.7
    );
    grad.addColorStop(0, 'rgba(74, 63, 107, 0.08)');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const t = Date.now() * 0.001;
    for (const f of this.floaters) {
      f.y -= f.speed;
      if (f.y < -10) {
        f.y = canvas.height + 10;
        f.x = Math.random() * canvas.width;
      }
      const wobble = Math.sin(t + f.phase) * 15;
      ctx.save();
      ctx.globalAlpha = f.opacity;
      ctx.fillStyle = '#b8a9d4';
      ctx.beginPath();
      ctx.arc(f.x + wobble, f.y, f.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

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
