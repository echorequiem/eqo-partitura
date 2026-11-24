// bgPresets.js — ready-made backgrounds for users without a photo or video of their own: patterns drawn on a
// canvas (hexagons, triangles, …) in the Echo palette — a dark ground and calm violet lines, nothing that shines.
// A preset becomes an ordinary PNG file (makePresetFile), so preview, video and saved projects treat it exactly
// like a picture the user chose.

const GROUND = "#0d0b14";
const VIOLET = [154, 21, 238]; // Studio violet (#9A15EE)
const BLUE = [64, 84, 230];
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// a soft vignette: the middle (where the notes run) a little lighter than the edges
function ground(ctx, W, H) {
  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) / 2);
  g.addColorStop(0, "rgba(40,30,62,0.55)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// pseudo-random, the same every time (a preset must look the same in preview, video and saved project)
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const DRAW = {
  hex(ctx, W, H) {
    ground(ctx, W, H);
    const r = Math.min(W, H) / 14;
    const hw = Math.sqrt(3) * r;
    const rnd = rng(7);
    ctx.lineWidth = Math.max(1, r * 0.04);
    // each row 1.5 r below the last, every other row shifted half a cell (rows must not share a y)
    for (let row = -1; row * r * 1.5 < H + r * 2; row++) {
      const y = row * r * 1.5;
      for (let x = (row % 2 ? hw / 2 : 0) - hw; x < W + hw; x += hw) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 6 + (i * Math.PI) / 3;
          const px = x + r * 0.94 * Math.cos(a);
          const py = y + r * 0.94 * Math.sin(a);
          if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.closePath();
        const k = rnd();
        if (k > 0.82) { ctx.fillStyle = rgba(VIOLET, 0.05 + (k - 0.82) * 0.5); ctx.fill(); }
        ctx.strokeStyle = rgba(VIOLET, 0.26);
        ctx.stroke();
      }
    }
  },
  tri(ctx, W, H) {
    ground(ctx, W, H);
    const s = Math.min(W, H) / 7;
    const h = (s * Math.sqrt(3)) / 2;
    const rnd = rng(11);
    ctx.lineWidth = Math.max(1, s * 0.012);
    for (let row = -1; row * h < H + h; row++) {
      const y0 = row * h;
      const off = row % 2 ? s / 2 : 0;
      for (let x = -s + off; x < W + s; x += s / 2) {
        const up = Math.round((x - off) / (s / 2)) % 2 === 0;
        ctx.beginPath();
        if (up) { ctx.moveTo(x, y0 + h); ctx.lineTo(x + s / 2, y0); ctx.lineTo(x + s, y0 + h); }
        else { ctx.moveTo(x, y0); ctx.lineTo(x + s, y0); ctx.lineTo(x + s / 2, y0 + h); }
        ctx.closePath();
        const k = rnd();
        ctx.fillStyle = k > 0.5 ? rgba(VIOLET, 0.03 + k * 0.09) : rgba(BLUE, 0.02 + k * 0.06);
        ctx.fill();
        ctx.strokeStyle = rgba(VIOLET, 0.16);
        ctx.stroke();
      }
    }
  },
  grid(ctx, W, H) {
    ground(ctx, W, H);
    const c = Math.min(W, H) / 36;
    for (let i = 0, x = 0; x <= W; i++, x = i * c) {
      ctx.fillStyle = rgba(VIOLET, i % 6 === 0 ? 0.3 : 0.11);
      ctx.fillRect(Math.round(x), 0, i % 6 === 0 ? 2 : 1, H);
    }
    for (let i = 0, y = 0; y <= H; i++, y = i * c) {
      ctx.fillStyle = rgba(VIOLET, i % 6 === 0 ? 0.3 : 0.11);
      ctx.fillRect(0, Math.round(y), W, i % 6 === 0 ? 2 : 1);
    }
  },
  dots(ctx, W, H) {
    ground(ctx, W, H);
    const c = Math.min(W, H) / 26;
    const R = Math.hypot(W, H) / 2;
    for (let y = c / 2; y < H; y += c) {
      for (let x = c / 2; x < W; x += c) {
        const d = Math.hypot(x - W / 2, y - H / 2) / R; // larger towards the edges
        ctx.fillStyle = rgba(VIOLET, 0.18 + d * 0.3);
        ctx.beginPath();
        ctx.arc(x, y, c * (0.06 + d * 0.12), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },
  waves(ctx, W, H) {
    ground(ctx, W, H);
    const n = 26;
    ctx.lineWidth = Math.max(1, H / 600);
    for (let i = 0; i < n; i++) {
      const base = (H * (i + 0.5)) / n;
      const amp = H * (0.025 + 0.02 * Math.sin(i * 0.7));
      ctx.strokeStyle = rgba(i % 2 ? BLUE : VIOLET, 0.16 + 0.12 * Math.abs(Math.sin(i * 0.45)));
      ctx.beginPath();
      for (let x = 0; x <= W; x += 8) {
        const y = base + amp * Math.sin((x / W) * Math.PI * 3 + i * 0.5) + amp * 0.5 * Math.sin((x / W) * Math.PI * 7 - i);
        if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  },
  lines(ctx, W, H) {
    ground(ctx, W, H);
    const gap = Math.min(W, H) / 30;
    ctx.lineWidth = Math.max(1, gap * 0.08);
    for (let i = -Math.ceil(H / gap); i * gap < W + H; i++) {
      ctx.strokeStyle = rgba(VIOLET, i % 5 === 0 ? 0.3 : 0.12);
      ctx.beginPath();
      ctx.moveTo(i * gap, 0);
      ctx.lineTo(i * gap - H, H);
      ctx.stroke();
    }
  },
  glow(ctx, W, H) {
    // soft colour fields (no lines): a calm violet / blue gradient
    ctx.fillStyle = GROUND;
    ctx.fillRect(0, 0, W, H);
    const blobs = [[0.2, 0.25, 0.6, VIOLET, 0.45], [0.82, 0.3, 0.5, BLUE, 0.35], [0.55, 0.85, 0.65, VIOLET, 0.3], [0.1, 0.9, 0.4, BLUE, 0.25]];
    for (const [x, y, r, c, a] of blobs) {
      const g = ctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, r * Math.max(W, H));
      g.addColorStop(0, rgba(c, a));
      g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  },
  staff(ctx, W, H) {
    // faint staves across the frame, a nod to the score
    ground(ctx, W, H);
    const line = H / 90;
    const block = line * 4;
    const pitch = block * 3.2;
    ctx.lineWidth = Math.max(1, H / 900);
    for (let top = pitch * 0.3, k = 0; top < H; top += pitch, k++) {
      ctx.strokeStyle = rgba(VIOLET, k % 2 ? 0.14 : 0.22);
      for (let i = 0; i < 5; i++) {
        const y = Math.round(top + i * line) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
    }
  }
};

/** Preset ids in display order; the i18n key of each is "preset" + Id. */
export const BG_PRESETS = Object.keys(DRAW);

/** Draws preset `id` filling a W × H canvas context. */
export function drawPreset(ctx, id, W, H) {
  (DRAW[id] || DRAW.hex)(ctx, W, H);
}

/** Preset `id` as a PNG File of the video's shape (long side 1920 px). */
export function makePresetFile(id, aspect = 16 / 9, name = id) {
  const W = aspect >= 1 ? 1920 : Math.round(1920 * aspect);
  const H = aspect >= 1 ? Math.round(1920 / aspect) : 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  drawPreset(canvas.getContext("2d"), id, W, H);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      canvas.width = 0;
      if (!blob) return reject(new Error("preset"));
      resolve(new File([blob], `${name}.png`, { type: "image/png" }));
    }, "image/png");
  });
}

/** Small preview of a preset into an existing canvas (its own size). */
export function drawPresetThumb(canvas, id) {
  const ctx = canvas.getContext("2d");
  const k = canvas.width / 480;
  ctx.save();
  ctx.scale(k, k);
  drawPreset(ctx, id, 480, 480 * (canvas.height / canvas.width));
  ctx.restore();
}
