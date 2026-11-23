// renderSpinner.js — the render animation on page 5, in three states, all point-symmetric around the centre:
//   idle     before a render: concentric rings that breathe slowly, a soft wave going out from the centre
//   running  rendering: every ring is cut into equal arcs; neighbouring rings turn in opposite directions, so
//            the figure stays a balanced mandala; the progress fills the rings with the accent from the centre
//   done     finished: the turning arcs slow down and close into full rings while the figure draws together —
//            every other ring fades and the rest gather tightly round the centre — one pulse of the accent runs
//            outwards, and it rests as a small, still emblem of five rings (about 1 s, nothing drawn in the middle)
// Flat lines only — no glow (Echo Masterworks rule: no neon). It follows the card's "rendering" class (main.js
// sets it, also removes it while paused) and reads the percentage from the readout; main.js calls done() on
// success.

const RINGS = 9;
const TAU = Math.PI * 2;
const DONE_SECONDS = 1.0;

export function createRenderSpinner({ canvas, area, pctEl }) {
  const ctx = canvas.getContext("2d");
  let raf = 0;
  let state = "idle"; // idle | running | paused | done
  let tState = 0; // seconds in the current state (kept while paused)
  let tLast = 0;
  let size = 0;
  let runT = 0; // how far the rings had turned when the render finished (done continues from that pose)

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
      let r = R * (0.16 + 0.84 * k);
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
        // the turning slows to a stop (same speed at the start: no jump) while the arcs close into rings
        const x = clamp01(t / 0.5);
        const speed = 0.35 + 0.5 * (1 - k);
        rot = dir * speed * (runT + 0.25 * (1 - (1 - x) * (1 - x)));
        gapFrac = 0.28 * (1 - ease(x));
        // draw together: odd rings fade out, the even ones move in to 22 … 60 % of the radius
        const g = ease(clamp01((t - 0.1) / 0.5));
        const j = Math.floor(i / 2); // 0 … 4 for the rings that stay
        const rEnd = R * (0.22 + 0.38 * (j / 4));
        r = i % 2 ? r * (1 - 0.35 * g) : r + (rEnd - r) * g;
        const keep = i % 2 ? 1 - g : 1;
        // one pulse of the accent from the centre outwards, then the rings rest a little lighter outwards
        const pulse = Math.exp(-Math.pow((t - 0.45 - k * 0.35) * 6, 2));
        color = accent;
        alpha = keep * Math.min(1, 1 - 0.3 * (j / 4) * g + 0.35 * pulse);
        if (alpha <= 0.01) continue;
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
    if (next === "done") runT = state === "running" || state === "paused" ? tState : 0;
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
