# Maas Arcade — Claude Code Guidelines

> **Self-Learning Protocol:** After every significant change, update this file and the memory
> system at `~/.claude/projects/C--Users-keane-Block-Puzzle-Jo-s-Version/memory/` to reflect
> new patterns, lessons learned, and evolving conventions. This file is the living source of
> truth for how we build this project.

---

## Project Identity

- **Name:** Maas Arcade
- **Brand:** Maas Design Co.
- **Aesthetic:** Star Wars × Lord of the Rings × Tron — epic sci-fantasy neon with animated starfield/grid backgrounds
- **Platform:** Progressive Web App (PWA) — mobile-first, offline-capable, zero dependencies
- **Deployment:** GitHub Pages (static hosting, no build step)
- **Repository:** https://github.com/theforcebe/bloom-puzzle.git
- **Exception:** Neon 2048 is renamed "Obi's Block Game" and uses a photo background (`games/obi.jpg`)

---

## Architecture Rules

### Zero Dependencies — No Exceptions
- **No npm, no package.json, no node_modules, no build tools**
- Pure vanilla HTML + CSS + JavaScript only
- No frameworks (React, Vue, Svelte, etc.)
- No CSS preprocessors (Sass, Less, etc.)
- No TypeScript — plain ES6+ JavaScript
- All sounds synthesized via Web Audio API — no audio files
- All graphics via CSS or Canvas 2D — no sprite sheets or image assets (except app icons and obi.jpg)
- This is a deliberate architectural choice for instant loading and PWA simplicity

### File Structure
```
/                           # Project root
├── index.html              # Hub/arcade landing page
├── shared.css              # Global design system (THE source of truth for styling)
├── shared.js               # Shared infrastructure (touch, audio, data, particles, nav)
├── sw.js                   # Service worker for offline caching
├── manifest.json           # PWA manifest
├── icon.svg / icon-*.png   # App icons
├── CLAUDE.md               # This file
└── games/
    ├── bloom-puzzle.html   # Each game is ONE self-contained HTML file
    ├── neon-2048.html      # with inline <style> and <script>
    ├── hex-crush.html
    ├── snake-flux.html
    ├── void-defense.html   # Tower defense (~3000 lines)
    ├── memory-matrix.html
    ├── garden-maze.html
    ├── obi.jpg             # Photo background for Obi's Block Game
    ├── flappy-petal.html
    ├── sudoku-noir.html
    ├── minesweeper.html
    └── blade-of-ruin.html  # Arena RPG — largest game (~7000 lines)
```

### Single-File Game Architecture
Every game is a **single `.html` file** in `games/`. Each file contains:
1. `<head>` — viewport meta, title, link to `../shared.css`, inline `<style>` for game-specific CSS
2. `<body>` — canvas elements, game UI, overlays
3. `<script src="../shared.js">` — loads shared infrastructure
4. `<script>` — game logic wrapped in `(() => { 'use strict'; ... })()`

**Never split a game across multiple files.** The single-file pattern is intentional for simplicity and PWA caching.

---

## Design System

### Color Palette (CSS Variables)
```css
/* Core */
--void: #0d0a1a;           /* Deepest background */
--void-mid: #1a1528;       /* Mid background */
--surface: #241e38;        /* Card/panel surfaces */
--iris-dark: #4a3f6b;      /* Borders, subtle elements */
--iris-mid: #6b5f8a;       /* Secondary text */
--iris-light: #b8a9d4;     /* Primary text */

/* Accents */
--moon-glow: #f5f0e8;      /* Brightest text/highlights */
--moon-gold: #d4a86a;      /* Gold accents */

/* Petal Colors (game pieces, theming) */
--petal-rose: #d4728c;
--petal-blush: #e8a0b0;
--petal-peach: #e8b87a;
--petal-lavender: #9b8ec4;
--petal-sage: #7ab88c;
--petal-sky: #6bacd4;

/* Neon Accents (per-game theming) */
--neon-rose: #ff6b9d;      --neon-cyan: #00e5ff;
--neon-magenta: #e040fb;    --neon-green: #76ff03;
--neon-purple: #b388ff;     --neon-gold: #ffd740;
--neon-lime: #c6ff00;       --neon-orange: #ff9100;
```

### Per-Game Theming
Each game sets `--game-accent` and `--game-glow` in its inline `<style>`:
```css
:root {
  --game-accent: #ff6b9d;                    /* Primary neon color */
  --game-glow: rgba(255, 107, 157, 0.3);     /* Glow version */
}
```

### Typography
- **Display font:** `'Cormorant Garamond', serif` — for titles, headings, overlay text
- **UI font:** `'Quicksand', sans-serif` — for buttons, labels, scores, body text
- **Sizing:** Always use `clamp(min, preferred, max)` for responsive text
- Import from Google Fonts in shared.css

### Glass-morphism UI
- All panels use `.glass-panel` or similar: semi-transparent `background: rgba(...)` + `backdrop-filter: blur(...)`
- Subtle borders: `border: 1px solid rgba(255,255,255,0.08)`
- Never use fully opaque backgrounds on game UI elements

### Animations
Use existing keyframes from shared.css:
- `fadeInDown` / `fadeInUp` — entrance animations
- `bloomIn` — scale-up with slight overshoot
- `scorePop` — score notification bounce
- `comboFloat` — text floats up and fades
- `pulse` / `neonPulse` — breathing glow effects
- `shimmer` / `spin` — utility animations
- `petalBurst` — decorative petal effects

---

## JavaScript Patterns

### Shared Infrastructure (shared.js)
Always use these — never reimplement:

| System | Usage |
|--------|-------|
| `ArcadeData` | Score submission, currency, settings, unlocks |
| `TouchManager` | Unified pointer input (tap, drag, swipe, long-press) |
| `AudioManager` | Synthesized sound effects (place, clear, success, fail, click) |
| `AmbientBackground` | Floating particle background animation |
| `ParticleSystem` | Burst particle effects for visual feedback |
| `haptic(style)` | Device vibration ('light', 'medium', 'heavy') |
| `goToHub()` | Navigate back to arcade hub |
| `goToGame(id)` | Navigate to a specific game |

### Game Code Conventions
```javascript
(() => { 'use strict';

  // 1. CONSTANTS at the top
  const GAME_ID = 'game-name';
  const GRID_SIZE = 8;

  // 2. STATE as flat variables (not classes, not objects)
  let board = [];
  let score = 0;
  let gameOver = false;
  let animating = false;

  // 3. DOM REFS cached once
  const boardEl = document.getElementById('board');
  const scoreEl = document.getElementById('score-display');

  // 4. SHARED SYSTEMS initialized
  const data = new ArcadeData();
  const particles = new ParticleSystem(document.getElementById('particle-canvas'));
  const ambient = new AmbientBackground(document.getElementById('bg-canvas'));

  // 5. FUNCTIONS grouped by concern
  function init() { /* one-time setup */ }
  function newGame() { /* reset state, start fresh */ }
  function update() { /* game tick / logic */ }
  function render() { /* update DOM or canvas */ }
  function gameOverFlow() { /* show overlay, submit score */ }

  // 6. INPUT attached via TouchManager or pointer events
  new TouchManager(boardEl, { onTap, onDrag, onDragEnd, onSwipe });

  // 7. KICK OFF
  init();
})();
```

### State Management
- **Flat variables** — no state objects, no stores, no reactive systems
- Direct mutation: `board[r][c] = value`
- Manual DOM updates after state changes
- `animating` flag to prevent input during animations

### Two Rendering Approaches
1. **DOM-based** (Bloom Puzzle, Memory Matrix, Sudoku, 2048, Minesweeper): Grid of `<div>` elements with CSS styling
2. **Canvas-based** (Flappy Petal, Snake Flux, Hex Crush, Garden Maze, Void Defense): `requestAnimationFrame` game loop with 2D context drawing

Choose based on game type:
- Static/turn-based games → DOM
- Real-time/physics games → Canvas

### Canvas Best Practices
- Scale canvas for device pixel ratio: `canvas.width = innerWidth * (devicePixelRatio || 1)`
- Use `requestAnimationFrame` for render loops
- Clear and redraw each frame (no retained mode)
- Cache expensive calculations (geometry, paths, colors)

---

## Mobile & Touch Requirements

### Viewport Locking (CRITICAL)
Every game HTML must include:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
```

### Touch Prevention
Every game must prevent unwanted scrolling/zooming:
```css
html, body { touch-action: none; overflow: hidden; }
* { -webkit-tap-highlight-color: transparent; user-select: none; }
```
```javascript
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
document.addEventListener('contextmenu', e => e.preventDefault());
```

### Safe Area Support
Always account for notch/home-indicator:
```css
padding-bottom: env(safe-area-inset-bottom, 0);
padding-top: env(safe-area-inset-top, 0);
```

### Layout
- Use `100dvh` (dynamic viewport height), not `100vh`
- `position: fixed; inset: 0` for full-screen game pages
- Responsive sizing with `clamp()` everywhere — avoid hardcoded pixel values

---

## Performance Guidelines

### Must-Follow Rules
1. **Never do expensive work in pointer event handlers** — defer to `requestAnimationFrame`
2. **Cache geometry calculations** — don't recalculate element positions every frame
3. **Use `will-change: transform`** on animated elements (remove after animation)
4. **Coalesce drag updates** — TouchManager already does this via RAF; don't add extra RAF loops
5. **Avoid layout thrashing** — batch DOM reads before DOM writes
6. **Minimize allocations in game loops** — reuse objects, avoid creating arrays/objects per frame

### Performance Patterns We've Learned
- Geometry caching for drag operations (Bloom Puzzle: `_cachedCells` pattern)
- Using `pointerdown` target instead of `pointermove` target for drag operations
- Dynamic layout measurement on resize instead of hardcoded dimensions
- `setPointerCapture()` for smooth drag isolation

---

## Game Over / Score Flow

Every game should follow this pattern:
```javascript
function gameOverFlow() {
  gameOver = true;
  const isNew = data.submitScore(GAME_ID, score);

  // Update overlay
  document.getElementById('final-score').textContent = score;
  document.getElementById('best-score').textContent = data.data.games[GAME_ID].best;

  // Award currency
  const earned = Math.floor(score / 10);
  if (earned > 0) data.earnPetals(earned);

  // Show overlay
  const overlay = document.getElementById('game-over-overlay');
  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.style.opacity = '1');

  AudioManager.playSuccess();
  haptic('medium');
}
```

---

## Hub Integration Checklist (New Games)

When adding a new game:
1. Create `games/new-game.html` following the single-file pattern
2. Add game card to `index.html` hub grid with:
   - Emoji icon, title, description
   - `data-game="new-game"` attribute
   - Score display element
   - Navigation link to `games/new-game.html`
3. Add to `sw.js` cache list
4. Choose a unique `--game-accent` neon color
5. Register `GAME_ID` in ArcadeData (auto-creates on first `submitScore`)

---

## Commit Message Format

Follow this established pattern:
```
[Action] [Target] — [implementation detail]

[Optional bullet points for sub-changes]

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

**Actions:** Fix, Add, Rewrite, Update, Remove, Refactor
**Targets:** Game name, shared system, or feature area
**Examples:**
- `Fix TouchManager drag target — use pointerdown target, not retargeted move target`
- `Add Start button to Garden Runner menu overlay`
- `Smooth out Bloom Puzzle drag — cache geometry, eliminate per-frame jank`

---

## Self-Learning Protocol

This project uses Claude Code's memory system to continuously improve. After significant work:

### When to Update CLAUDE.md
- New architectural pattern established
- New shared utility or system added to shared.js/shared.css
- Performance lesson learned (what worked/what didn't)
- New game type or rendering approach introduced
- Design system changes (new colors, components, animations)

### When to Update Memory Files
- User preferences or feedback about workflow
- Project-specific decisions and their rationale
- Bugs that revealed important patterns
- External references (deploy URLs, docs, etc.)

### Memory Location
`~/.claude/projects/C--Users-keane-Block-Puzzle-Jo-s-Version/memory/`

### What to Track in Memory (not here)
- User's role, preferences, and communication style
- Feedback corrections ("don't do X, do Y instead")
- Project status, deadlines, and priorities
- External system references

### What to Track Here (not memory)
- Code patterns and conventions (this file)
- Architecture rules
- Design system specs
- File structure conventions

---

## Known Patterns & Pitfalls

### iOS-Specific
- Must aggressively prevent scrolling (multiple event listeners + CSS)
- `dvh` units required instead of `vh` for proper viewport sizing
- Safari requires user gesture before Web Audio context activation
- Safe area insets needed for notch devices

### Touch Input
- Always use Pointer Events API (not touch events directly)
- `pointermove` may retarget — use the original `pointerdown` target for drag operations
- Set `touch-action: none` on interactive elements
- Use `setPointerCapture()` for drag isolation

### Canvas Rendering
- Always scale for `devicePixelRatio` — renders blurry otherwise
- Set both `canvas.width` (internal) and `canvas.style.width` (display)
- Clear canvas each frame before redrawing
- Use `requestAnimationFrame`, never `setInterval` for rendering

### Layout
- Game pages: `position: fixed; inset: 0` — never scrollable
- Hub page: scrollable (exception to the fixed rule)
- Measure layout dynamically on resize — don't hardcode dimensions
- Use `clamp()` for all sizing — it handles mobile through desktop

---

## Current Game Inventory

| ID | Display Name | Type | Accent | Status |
|----|-------------|------|--------|--------|
| blade-of-ruin | Blade of Ruin | Canvas/RPG | Crimson | New |
| bloom-puzzle | Bloom Puzzle | DOM/Grid | Neon Rose | Enhanced |
| neon-2048 | Obi's Block Game | DOM/Grid | Neon Cyan | Customized |
| hex-crush | Hex Crush | Canvas | Neon Magenta | Enhanced |
| snake-flux | Snake Flux | Canvas | Neon Green | Enhanced |
| void-defense | Galactic Defense | Canvas | Neon Purple | Rebalanced |
| memory-matrix | Memory Matrix | DOM/Cards | Neon Gold | Enhanced |
| garden-maze | Garden Runner | Canvas | Neon Lime | Stable |
| flappy-petal | Flappy Petal | Canvas | Neon Rose | Enhanced |
| sudoku-noir | Sudoku Noir | DOM/Grid | Neon Gold | Enhanced |
| minesweeper | Minesweeper | DOM/Grid | Neon Cyan | Enhanced |

---

*Last updated: 2026-03-11 — Major overhaul: rebrand to Maas Arcade, ThemeManager system, game enhancements, Blade of Ruin RPG*
