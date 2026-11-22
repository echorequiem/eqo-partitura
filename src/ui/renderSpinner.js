// renderSpinner.js — the render animation on page 4: the Echo spiral.
// Concentric rings, each cut into a top and a bottom half. While a render runs, the two halves of every ring
// turn against each other in a wave that travels from the centre outwards, so the rings shear into a spiral
// and fold back into circles again. The render progress fills the rings with the family colour from the
// centre out. Flat lines only — no glow (Echo Masterworks rule: no neon).
// Cheap: ~40 arcs per frame on a small canvas; it draws only while a render runs (rAF stops otherwise).
// It follows the card's "rendering" class (set by main.js, also removed while paused) and reads the
// percentage from the readout, so main.js needs no extra calls.

const RINGS = 15;
const TAU = Math.PI * 2;

/** Per-ring breaks (fraction of a half, length) — fixed, so the figure has the same character every time. */
const BREAKS = Array.from({ length: RINGS }, (_, i) => {
  const h = (n) => ((Math.sin((i + 1) * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  return { top: h(1) < 0.55 ? [0.15 + h(2) * 0.6, 0.05 + h(3) * 0.12] : null, bot: h(4) < 0.5 ? [0.15 + h(5) * 0.6, 0.05 + h(6) * 0.1] : null };
});

export function createRenderSpinner({ canvas, area, pctEl }) {
  const ctx = canvas.getContext("2d");
  let raf = 0;
  let t0 = 0;
  let tPaused = 0; // animation time kept across pauses, so it continues where it stopped
  let size = 0;
  let dpr = 1;

  const css = (name, fallback) => getComputedStyle(canvas).getPropertyValue(name).trim() || fallback;

  function resize() {
    const box = canvas.getBoundingClientRect();
    const s = Math.round(Math.min(box.width, box.height) || 120);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    if (s === size && canvas.width === Math.round(s * dpr)) return;
    size = s;
    canvas.width = canvas.height = Math.round(s * dpr);
  }

  function progress() {
    const v = parseFloat(pctEl && pctEl.textContent);
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v / 100)) : 0;
  }

  /** t in seconds; running = animated colours; p = 0..1 progress */
  function draw(t, running) {
    resize();
    const W = canvas.width;
    const c = W / 2;
    const R = W * 0.46;
    const line = Math.max(1.2, W * 0.016);
    const ink = css("--text", "#eef2f3");
    const accent = css("--ana", "#9A15EE");
    const p = running ? progress() : 0;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, W);
    ctx.lineCap = "round";
    ctx.lineWidth = line;

    for (let i = 0; i < RINGS; i++) {
      const k = i / (RINGS - 1);
      const r = R * (0.07 + 0.93 * k);
      // travelling wave: inner rings lead, outer rings follow; a slow drift keeps the figure turning
      const wave = Math.sin(t * 1.6 - k * 4.2);
      // resting pose: calm concentric rings (the halves aligned); running: the halves shear into a spiral
      const shear = running ? 0.55 * wave + 0.18 : 0;
      const drift = running ? t * 0.35 : 0;
      const filled = running && k <= p + 1e-6;
      ctx.strokeStyle = filled ? accent : ink;
      ctx.globalAlpha = running ? (filled ? 1 : 0.78) : 0.3;

      // while running the two outer rings are shorter sweeps (as in the figure); at rest all are full halves
      const span = running && i >= RINGS - 2 ? Math.PI * 0.62 : Math.PI - 0.06;
      halfRing(c, r, Math.PI + drift + shear, span, BREAKS[i].top); // top half
      halfRing(c, r, 0 + drift - shear, span, BREAKS[i].bot); // bottom half
    }
    ctx.globalAlpha = 1;
  }

  function halfRing(c, r, start, span, brk) {
    if (!brk) {
      ctx.beginPath();
      ctx.arc(c, c, r, start, start + span);
      ctx.stroke();
      return;
    }
    const [at, len] = brk;
    const a = start + span * at;
    const b = Math.min(start + span, a + span * len);
    ctx.beginPath();
    ctx.arc(c, c, r, start, a);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c, c, r, b, start + span);
    ctx.stroke();
  }

  function frame(now) {
    draw(tPaused + (now - t0) / 1000, true);
    raf = requestAnimationFrame(frame);
  }

  function setRunning(on) {
    if (on && !raf) {
      t0 = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!on && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
      tPaused += (performance.now() - t0) / 1000;
      if (isPaused()) draw(tPaused, true); // paused: keep the last pose and colours
      else draw(0, false); // finished / cancelled: back to the resting figure
    }
  }

  // paused = the render is still going (cancel button enabled) but the card is not "rendering"
  const isPaused = () => { const b = document.getElementById("render-cancel-btn"); return !!b && !b.disabled; };

  new MutationObserver(() => {
    const on = area.classList.contains("rendering");
    if (!on && !isPaused()) tPaused = 0; // finished / cancelled: start fresh next time
    setRunning(on);
  }).observe(area, { attributes: true, attributeFilter: ["class"] });

  // redraw the resting figure when the theme or size changes
  new MutationObserver(() => { if (!raf) draw(tPaused, isPaused()); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  new ResizeObserver(() => { if (!raf) draw(tPaused, isPaused()); }).observe(canvas);

  draw(0, false);
  return { redraw: () => { if (!raf) draw(tPaused, isPaused()); } };
}
