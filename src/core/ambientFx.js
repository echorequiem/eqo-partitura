// ambientFx.js — "atmosphere" over the background: a very light drifting haze and tiny embers rising
// like sparks from a campfire. Purely a function of time t, so the preview and the rendered video show
// exactly the same thing, frame for frame. Intensity 0…1 (default 0.35 = subtle, just enough to feel alive).

export const DEFAULT_FX_INTENSITY = 0.35;

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MAX_EMBERS = 160;
const EMBERS = (() => {
  const rnd = mulberry32(20261118);
  const list = [];
  for (let i = 0; i < MAX_EMBERS; i++) {
    list.push({
      x: rnd(), // start x (fraction of width)
      phase: rnd(), // where in its rise it starts
      speed: 0.035 + rnd() * 0.075, // heights per second
      sway: 0.006 + rnd() * 0.022, // horizontal wobble (fraction of width)
      swayFreq: 0.25 + rnd() * 0.6,
      swayPh: rnd() * Math.PI * 2,
      drift: (rnd() - 0.5) * 0.04, // slow sideways drift over its life
      size: 0.55 + rnd() * 1.5, // px at 1080p
      flicker: 3 + rnd() * 7,
      flickerPh: rnd() * Math.PI * 2,
      hue: rnd() // 0 = deep orange … 1 = pale yellow
    });
  }
  return list;
})();

const FOG = [
  { k: 0.0, sx: 0.031, sy: 0.019, r: 0.75, a: 1.0 },
  { k: 1.7, sx: 0.022, sy: 0.027, r: 0.6, a: 0.8 },
  { k: 3.1, sx: 0.017, sy: 0.023, r: 0.9, a: 0.7 },
  { k: 4.6, sx: 0.026, sy: 0.015, r: 0.55, a: 0.9 }
];

let sprites = null;
function getSprites() {
  if (sprites) return sprites;
  sprites = ["255,140,40", "255,180,70", "255,225,150"].map((rgb) => {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, `rgba(255,250,235,1)`);
    grad.addColorStop(0.18, `rgba(${rgb},0.95)`);
    grad.addColorStop(0.45, `rgba(${rgb},0.28)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    return c;
  });
  return sprites;
}

/** Normalises settings: a number (both effects) or { fog, embers } with 0…1 each (0 = off). */
export function fxLevels(opts) {
  if (typeof opts === "number") return { fog: opts, embers: opts };
  const c = (v) => Math.max(0, Math.min(1, Number(v) || 0));
  return { fog: c(opts && opts.fog), embers: c(opts && opts.embers) };
}

/** Draws the effect for time t (seconds) over the whole canvas W×H. `opts`: see fxLevels(). */
export function drawAmbientFx(ctx, W, H, t, opts = DEFAULT_FX_INTENSITY) {
  const { fog, embers } = fxLevels(opts);
  if ((fog <= 0 && embers <= 0) || !(W > 0) || !(H > 0)) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = "none";

  // haze: a few huge, very faint warm-white clouds drifting slowly
  const big = Math.max(W, H);
  for (const f of fog > 0 ? FOG : []) {
    const cx = (0.5 + 0.38 * Math.sin(t * f.sx + f.k)) * W;
    const cy = (0.62 + 0.22 * Math.cos(t * f.sy + f.k * 1.3)) * H;
    const r = f.r * big;
    const a = 0.055 * fog * f.a * (0.75 + 0.25 * Math.sin(t * 0.11 + f.k));
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(255,236,215,${a})`);
    g.addColorStop(1, "rgba(255,236,215,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // embers: rise from below, sway, flicker, fade in and out
  const k = embers;
  const spr = getSprites();
  const count = Math.round(MAX_EMBERS * k * Math.min(1.6, (W * H) / (1920 * 1080) + 0.4));
  const px = H / 1080;
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < count; i++) {
    const e = EMBERS[i];
    const life = (t * e.speed + e.phase) % 1.15; // 0 … 1.15 of the height
    const y = H * (1.05 - life);
    const x = (e.x + Math.sin(t * e.swayFreq + e.swayPh) * e.sway + e.drift * life) * W;
    const fadeIn = Math.min(1, life / 0.15);
    const fadeOut = Math.min(1, (1.15 - life) / 0.35);
    const flick = 0.6 + 0.4 * Math.sin(t * e.flicker + e.flickerPh);
    const alpha = fadeIn * fadeOut * flick * (0.45 + 0.55 * k);
    if (alpha <= 0.01) continue;
    const s = e.size * px * 9 * (0.75 + 0.25 * flick);
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(spr[Math.min(2, Math.floor(e.hue * 3))], x - s / 2, y - s / 2, s, s);
  }
  ctx.restore();
}

/** Runs the effect on a canvas that overlays an element (preview). */
export class AmbientFxOverlay {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.enabled = false;
    this.intensity = DEFAULT_FX_INTENSITY;
    this.raf = null;
    this.t0 = performance.now();
  }

  /** levels: { fog, embers } (0 = off). */
  set(levels) {
    this.intensity = fxLevels(levels);
    this.enabled = this.intensity.fog > 0 || this.intensity.embers > 0;
    this.canvas.style.display = this.enabled ? "block" : "none";
    if (this.enabled && !this.raf) this._loop();
  }

  _loop() {
    if (!this.enabled) { this.raf = null; return; }
    const c = this.canvas;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (w > 0 && h > 0) { // hidden pages: nothing to draw
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      this.ctx.clearRect(0, 0, c.width, c.height);
      drawAmbientFx(this.ctx, c.width, c.height, (performance.now() - this.t0) / 1000, this.intensity);
    }
    this.raf = requestAnimationFrame(() => this._loop());
  }
}
