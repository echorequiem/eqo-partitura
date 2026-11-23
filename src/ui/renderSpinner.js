// renderSpinner.js — the render animation on page 5, in three states, all point-symmetric around the centre:
//   idle     before a render: concentric rings that breathe slowly, a soft wave going out from the centre
//   running  rendering: every ring is cut into equal arcs; neighbouring rings turn in opposite directions, so
//            the figure stays a balanced mandala; the progress fills the rings with the accent from the centre
//   done     finished: the arcs close into full rings, a ripple runs outwards, a check mark draws in the middle
// Flat lines only — no glow (Echo Masterworks rule: no neon). It follows the card's "rendering" class (main.js
// sets it, also removes it while paused) and reads the percentage from the readout; main.js calls done() on
// success.

const RINGS = 9;
const TAU = Math.PI * 2;
const DONE_SECONDS = 1.4;

export function createRenderSpinner({ canvas, area, pctEl }) {
  const ctx = canvas.getContext("2d");
  let raf = 0;
  let state = "idle"; // idle | running | paused | done
  let tState = 0; // seconds in the current state (kept while paused)
  let tLast = 0;
  let size = 0;

  const css = (name, fallback) => getComputedStyle(canvas).getPropertyValue(name).trim() || fallback;

  function resize() {
    const box = canvas.getBoundingClientRect();
    const s = Math.round(Math.min(box.width, box.height) || 120);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (s === size && canvas.width === Math.round(s * dpr)) return;
    size = s;
    canvas.width = canvas.height = Math.round(s * dpr);
  }

  function progress() {
    const v = parseFloat(pctEl && pctEl.textContent);
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v / 100)) : 0;
  }

  const ease = (x) => x * x * (3 - 2 * x);
  const clamp01 = (x) => Math.min(1, Math.max(0, x));

  function draw(t) {
    resize();
    const W = canvas.width;
    const c = W / 2;
    const R = W * 0.44;
    const line = Math.max(1.2, W * 0.017);
    const ink = css("--text", "#eef2f3");
    const accent = css("--ana", "#9A15EE");
    const p = state === "running" || state === "paused" ? progress() : state === "done" ? 1 : 0;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, W);
    ctx.lineCap = "round";
    ctx.lineWidth = line;

    for (let i = 0; i < RINGS; i++) {
      const k = i / (RINGS - 1);
      const r = R * (0.16 + 0.84 * k);
      const segs = 2 + Math.floor(i / 2) * 2; // 2, 2, 4, 4, 6, … equal arcs: symmetric through the centre
      const dir = i % 2 ? -1 : 1;
      let gapFrac; // share of each segment left empty
      let rot = 0;
      let alpha;
      let color = ink;

      if (state === "idle") {
        // full rings, a slow breathing wave from the centre outwards
        gapFrac = 0;
        const wave = 0.5 + 0.5 * Math.sin(t * 1.4 - k * 3.2);
        alpha = 0.16 + 0.22 * wave;
      } else if (state === "done") {
        // arcs close into rings, then a ripple of accent runs outwards and settles
        const close = ease(clamp01(t / 0.5));
        gapFrac = 0.28 * (1 - close);
        const ripple = Math.exp(-Math.pow((t - 0.45 - k * 0.55) * 5, 2));
        color = accent;
        alpha = 0.55 + 0.45 * ripple;
      } else {
        gapFrac = 0.28;
        const speed = 0.35 + 0.5 * (1 - k); // inner rings turn faster
        rot = dir * t * speed;
        const filled = k <= p + 1e-6;
        color = filled ? accent : ink;
        alpha = filled ? 1 : 0.55;
        if (state === "paused") alpha *= 0.7;
      }

      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;
      if (gapFrac <= 0.001) {
        ctx.beginPath();
        ctx.arc(c, c, r, 0, TAU);
        ctx.stroke();
        continue;
      }
      const seg = TAU / segs;
      const len = seg * (1 - gapFrac);
      for (let s = 0; s < segs; s++) {
        const a = rot + s * seg + (seg - len) / 2 + (i % 2 ? seg / 2 : 0);
        ctx.beginPath();
        ctx.arc(c, c, r, a, a + len);
        ctx.stroke();
      }
    }

    // done: a check mark drawn in the middle
    if (state === "done") {
      const d = ease(clamp01((t - 0.55) / 0.5));
      if (d > 0) {
        const s = R * 0.22;
        const pts = [[c - s * 0.55, c + s * 0.02], [c - s * 0.12, c + s * 0.45], [c + s * 0.62, c - s * 0.4]];
        const l1 = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
        const l2 = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]);
        let rest = d * (l1 + l2);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = ink;
        ctx.lineWidth = line * 1.5;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        const f1 = Math.min(1, rest / l1);
        ctx.lineTo(pts[0][0] + (pts[1][0] - pts[0][0]) * f1, pts[0][1] + (pts[1][1] - pts[0][1]) * f1);
        rest -= l1;
        if (rest > 0) {
          const f2 = rest / l2;
          ctx.lineTo(pts[1][0] + (pts[2][0] - pts[1][0]) * f2, pts[1][1] + (pts[2][1] - pts[1][1]) * f2);
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    const dt = tLast ? Math.min(0.1, (now - tLast) / 1000) : 0;
    tLast = now;
    if (state !== "paused") tState += dt;
    draw(tState);
    // the finished figure stops once settled, a paused one keeps its pose; idle and running keep moving
    if ((state === "done" && tState > DONE_SECONDS + 0.3) || state === "paused") { raf = 0; tLast = 0; return; }
    raf = requestAnimationFrame(frame);
  }

  function setState(next) {
    if (next === state && raf) return;
    if (next !== "paused" && !(state === "paused" && next === "running")) tState = 0;
    state = next;
    tLast = 0;
    if (!raf) raf = requestAnimationFrame(frame);
  }

  // paused = the render is still going (cancel button enabled) but the card is not "rendering"
  const isPaused = () => { const b = document.getElementById("render-cancel-btn"); return !!b && !b.disabled; };

  new MutationObserver(() => {
    const on = area.classList.contains("rendering");
    if (on) setState("running");
    else if (isPaused()) setState("paused");
    else if (state === "running" || state === "paused") setState("idle"); // cancelled / failed (done() follows on success)
  }).observe(area, { attributes: true, attributeFilter: ["class"] });

  const redraw = () => { if (!raf) draw(tState); };
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  new ResizeObserver(redraw).observe(canvas);

  setState("idle");
  return {
    redraw,
    done: () => setState("done"),
    idle: () => setState("idle")
  };
}
