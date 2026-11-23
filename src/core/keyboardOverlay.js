// keyboardOverlay.js — an optional piano keyboard along the bottom of the video: the keys of the notes sounding
// right now are pressed in the glow colour of their staff (first staff / second staff). Flat colours, a soft
// shade under the black keys — nothing that shines. Drawn by the same function in the page-3 preview (the
// overlay canvas over the stage) and in the render, so both look alike. The score moves up by half the
// keyboard's height so the two never overlap.

const WHITE_STEPS = [0, 2, 4, 5, 7, 9, 11]; // pitch classes of the white keys
const isBlack = (midi) => !WHITE_STEPS.includes(((midi % 12) + 12) % 12);
const A0 = 21;
const C8 = 108;

/** Height of the keyboard band for a W × H frame (px). */
export function keyboardHeight(W, H) {
  return Math.round(Math.min(H * 0.17, W * 0.12));
}

/**
 * Key range shown: whole octaves C…B around the notes of the piece, at least four octaves, never past the
 * 88 keys of a piano. A wide frame (16:9 or wider) always shows the whole piano, A0…C8.
 * @param lo/hi lowest and highest MIDI note of the piece (or null)
 * @param aspect frame width / height
 */
export function keyboardRange(lo, hi, aspect = 0) {
  if (aspect >= 16 / 9 - 0.01) return { lo: A0, hi: C8 };
  if (!(lo > 0) || !(hi > 0)) return { lo: 36, hi: 95 }; // C2…B6
  let a = Math.floor(Math.max(A0, lo) / 12) * 12;
  let b = Math.ceil((Math.min(C8, hi) + 1) / 12) * 12 - 1;
  while (b - a + 1 < 48) {
    if (a - 12 >= 12) a -= 12; // grow downwards first while there is room, then upwards
    if (b - a + 1 < 48) b += 12;
  }
  return { lo: Math.max(A0, a), hi: Math.min(C8, b) };
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return [255, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix = (c, d, k) => c.map((v, i) => Math.round(v + (d[i] - v) * k));
const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/**
 * @param active  Map midi → staff slot (0 / 1) of the keys sounding now
 * @param range   { lo, hi } from keyboardRange
 * @param colors  [first staff, second staff] glow colours (#rrggbb)
 * @param alpha   fades the whole keyboard (video lead-in / lead-out)
 */
export function drawKeyboard(ctx, W, H, active, range, colors, alpha = 1) {
  const kh = keyboardHeight(W, H);
  if (kh < 8) return;
  const top = H - kh;
  const whites = [];
  for (let m = range.lo; m <= range.hi; m++) if (!isBlack(m)) whites.push(m);
  if (!whites.length) return;
  const ww = W / whites.length;
  const bw = ww * 0.6;
  const bh = kh * 0.62;
  const cols = (colors || []).map(hexToRgb);
  const colorOf = (slot) => cols[slot === 1 ? 1 : 0] || cols[0] || [255, 0, 0];

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.filter = "none";
  ctx.shadowColor = "transparent";

  // the bed: a thin dark rim the keys sit in
  ctx.fillStyle = "#0b0a10";
  ctx.fillRect(0, top - Math.max(2, kh * 0.035), W, kh + Math.max(2, kh * 0.035));

  // white keys
  const gap = Math.max(1, ww * 0.06);
  const whiteX = new Map();
  whites.forEach((m, i) => {
    const x = i * ww;
    whiteX.set(m, x);
    const on = active && active.has(m);
    if (on) {
      const c = colorOf(active.get(m));
      ctx.fillStyle = css(mix(c, [255, 255, 255], 0.18));
    } else {
      const g = ctx.createLinearGradient(0, top, 0, H);
      g.addColorStop(0, "#d9d6df");
      g.addColorStop(0.85, "#f4f2f7");
      g.addColorStop(1, "#c9c5d0");
      ctx.fillStyle = g;
    }
    const r = Math.min(ww * 0.12, kh * 0.04);
    ctx.beginPath();
    roundRectBottom(ctx, x + gap / 2, top, ww - gap, kh - gap / 2, r);
    ctx.fill();
    // every C carries its octave (C4 = middle C), small and grey at the bottom of the key
    if (m % 12 === 0) {
      const fs = Math.max(6, Math.min(ww * 0.42, kh * 0.13));
      ctx.font = `600 ${fs}px "Montserrat Variable", Montserrat, "Segoe UI", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = on ? "rgba(255,255,255,0.85)" : "rgba(40,36,52,0.55)";
      ctx.fillText(`C${Math.floor(m / 12) - 1}`, x + ww / 2, H - Math.max(3, kh * 0.07));
    }
  });

  // black keys, over the gap between two white keys
  for (let m = range.lo; m <= range.hi; m++) {
    if (!isBlack(m)) continue;
    const left = whiteX.get(m - 1);
    if (left === undefined) continue;
    const x = left + ww - bw / 2;
    const on = active && active.has(m);
    // a soft shade on the white keys beside it
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(x + bw * 0.08, top, bw, bh + kh * 0.03);
    if (on) {
      ctx.fillStyle = css(colorOf(active.get(m)));
    } else {
      const g = ctx.createLinearGradient(0, top, 0, top + bh);
      g.addColorStop(0, "#1b1922");
      g.addColorStop(0.9, "#2c2935");
      g.addColorStop(1, "#14121a");
      ctx.fillStyle = g;
    }
    ctx.beginPath();
    roundRectBottom(ctx, x, top, bw, bh, Math.min(bw * 0.14, kh * 0.03));
    ctx.fill();
  }
  ctx.restore();
}

function roundRectBottom(ctx, x, y, w, h, r) {
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.closePath();
}
