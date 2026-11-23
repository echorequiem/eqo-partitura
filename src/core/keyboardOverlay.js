// keyboardOverlay.js — an optional piano keyboard along the bottom of the video: the keys of the notes sounding
// right now are pressed in the glow colour of their staff (first staff / second staff). Drawn in light and
// shade (a front face, a bevel on the black keys, the shadow they cast) for depth — nothing that shines.
// Every edge sits on a whole pixel, all white keys are equally wide and every black key sits exactly in the
// middle of its two white keys, so the keyboard is even and sharp at any size. Drawn by the same function in
// the page-3 preview (the overlay canvas over the stage) and in the render, so both look alike. The score moves
// up by half the keyboard's height so the two never overlap.
// Speed: the keys are painted once into cached strips (all up; all white keys down; all black keys down, per
// staff colour) and each frame only copies the pressed keys' columns over the resting keyboard — a few image
// copies instead of hundreds of gradient fills, so the keyboard costs the render almost nothing.

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
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];

/** Geometry of the keys for a strip W wide and kh high (all whole pixels). */
function layout(W, kh, range) {
  const whites = [];
  for (let m = range.lo; m <= range.hi; m++) if (!isBlack(m)) whites.push(m);
  const n = whites.length;
  // whole pixels: key i spans [edge(i), edge(i + 1)); the band is centred if W does not divide evenly
  const ww = n ? Math.floor(W / n) : 0;
  const x0 = Math.floor((W - ww * n) / 2);
  const rim = Math.max(2, Math.round(kh * 0.04)); // the dark felt strip above the keys
  const keyTop = rim;
  const keyH = kh - keyTop;
  const front = Math.max(2, Math.round(keyH * 0.07)); // the white keys' front face
  const bw = Math.max(2, 2 * Math.round(ww * 0.29)); // even: the black key sits exactly on the joint
  const bh = Math.round(keyH * 0.62);
  const bFront = Math.max(2, Math.round(bh * 0.1));
  return { whites, n, ww, x0, edge: (i) => x0 + i * ww, rim, keyTop, keyH, front, bw, bh, bFront };
}

/** Paints the whole keyboard into ctx (a strip W × kh); pressedSlot(m) gives the staff slot of a pressed key. */
function paintKeys(ctx, W, kh, range, colors, pressedSlot) {
  const top = 0;
  const H = kh;
  const { whites, n, ww, edge, rim, keyTop, keyH, front, bw, bh, bFront } = layout(W, kh, range);
  const cols = (colors || []).map(hexToRgb);
  const colorOf = (slot) => cols[slot === 1 ? 1 : 0] || cols[0] || [255, 0, 0];
  const active = { has: (m) => pressedSlot(m) !== undefined, get: (m) => pressedSlot(m) };

  ctx.save();
  ctx.imageSmoothingEnabled = true;

  // the case behind the keys and the felt strip
  ctx.fillStyle = "#08070c";
  ctx.fillRect(0, top, W, kh);
  const felt = ctx.createLinearGradient(0, top, 0, keyTop);
  felt.addColorStop(0, "#1c1924");
  felt.addColorStop(1, "#0c0b11");
  ctx.fillStyle = felt;
  ctx.fillRect(0, top, W, rim);

  // ---- white keys ----
  const gap = ww >= 10 ? 1 : 0;
  whites.forEach((m, i) => {
    const x = edge(i);
    const w = ww - gap;
    const on = active && active.has(m);
    const c = on ? colorOf(active.get(m)) : null;
    const press = on ? Math.max(1, Math.round(front * 0.6)) : 0; // a pressed key goes down: less front face
    const bodyH = keyH - front + press;
    // top surface: a little darker under the felt, lighter towards the player
    const g = ctx.createLinearGradient(0, keyTop, 0, keyTop + bodyH);
    if (c) {
      g.addColorStop(0, rgb(mix(c, BLACK, 0.35)));
      g.addColorStop(0.12, rgb(mix(c, WHITE, 0.05)));
      g.addColorStop(1, rgb(mix(c, WHITE, 0.22)));
    } else {
      g.addColorStop(0, "#b9b5c2");
      g.addColorStop(0.1, "#e7e4ec");
      g.addColorStop(1, "#fbfafd");
    }
    ctx.fillStyle = g;
    ctx.fillRect(x, keyTop, w, bodyH);
    // front face (the key's thickness), darker
    const fy = keyTop + bodyH;
    const fh = H - fy;
    if (fh > 0) {
      const fg = ctx.createLinearGradient(0, fy, 0, H);
      fg.addColorStop(0, c ? rgb(mix(c, BLACK, 0.25)) : "#cfcbd6");
      fg.addColorStop(1, c ? rgb(mix(c, BLACK, 0.45)) : "#a29dab");
      ctx.fillStyle = fg;
      ctx.fillRect(x, fy, w, fh);
    }
    // a light line on the left edge, a soft shade on the right: the keys read as blocks
    if (ww >= 6) {
      ctx.fillStyle = c ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.7)";
      ctx.fillRect(x, keyTop, 1, bodyH);
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(x + w - 1, keyTop, 1, bodyH);
    }
    // every C carries its octave (C4 = middle C)
    if (m % 12 === 0 && ww >= 7) {
      const fs = Math.max(6, Math.min(ww * 0.42, keyH * 0.12));
      ctx.font = `600 ${fs}px "Montserrat Variable", Montserrat, "Segoe UI", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = on ? "rgba(255,255,255,0.9)" : "rgba(40,36,52,0.5)";
      ctx.fillText(`C${Math.floor(m / 12) - 1}`, x + w / 2, fy - Math.max(2, keyH * 0.05));
    }
  });
  // the shadow of the felt strip on the keys
  const sh = ctx.createLinearGradient(0, keyTop, 0, keyTop + keyH * 0.08);
  sh.addColorStop(0, "rgba(0,0,0,0.35)");
  sh.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = sh;
  ctx.fillRect(0, keyTop, W, Math.ceil(keyH * 0.08));

  // ---- black keys: exactly on the joint between their two white keys ----
  for (let m = range.lo; m <= range.hi; m++) {
    if (!isBlack(m)) continue;
    const li = whites.indexOf(m - 1);
    if (li < 0 || li + 1 >= n) continue;
    const joint = edge(li + 1);
    const x = joint - bw / 2;
    const on = active && active.has(m);
    const c = on ? colorOf(active.get(m)) : null;
    const press = on ? Math.max(1, Math.round(bFront * 0.5)) : 0;
    // the shadow it casts towards the player and to the right
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(x + Math.max(1, Math.round(bw * 0.12)), keyTop, bw, bh + Math.max(1, Math.round(keyH * 0.03)));
    // body
    const bg = ctx.createLinearGradient(0, keyTop, 0, keyTop + bh);
    bg.addColorStop(0, c ? rgb(mix(c, BLACK, 0.55)) : "#121017");
    bg.addColorStop(1, c ? rgb(mix(c, BLACK, 0.3)) : "#1e1b25");
    ctx.fillStyle = bg;
    ctx.fillRect(x, keyTop, bw, bh + press);
    // the bevelled top: a lighter face inset from the sides, ending above the front
    const inset = Math.max(1, Math.round(bw * 0.14));
    const faceH = bh - bFront - Math.round(keyH * 0.02) + press;
    const fg = ctx.createLinearGradient(0, keyTop, 0, keyTop + faceH);
    if (c) {
      fg.addColorStop(0, rgb(mix(c, BLACK, 0.2)));
      fg.addColorStop(1, rgb(mix(c, WHITE, 0.12)));
    } else {
      fg.addColorStop(0, "#26232e");
      fg.addColorStop(0.85, "#3a3644");
      fg.addColorStop(1, "#4a4655");
    }
    ctx.fillStyle = fg;
    ctx.fillRect(x + inset, keyTop, bw - inset * 2, faceH);
  }
  ctx.restore();
}

function makeStrip(W, h) {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(W, h);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = h;
  return c;
}

// cached strips per size / range / colours (a few: preview and render can differ)
const cache = new Map();
function stripsFor(W, kh, range, colors) {
  const fonts = typeof document !== "undefined" && document.fonts ? document.fonts.status : "";
  const key = [W, kh, range.lo, range.hi, (colors || []).join(","), fonts].join("|");
  let e = cache.get(key);
  if (e) return e;
  const paint = (fn) => {
    const c = makeStrip(W, kh);
    paintKeys(c.getContext("2d"), W, kh, range, colors, fn);
    return c;
  };
  e = {
    geo: layout(W, kh, range),
    base: paint(() => undefined),
    whites: [0, 1].map((slot) => paint((m) => (isBlack(m) ? undefined : slot))),
    blacks: [0, 1].map((slot) => paint((m) => (isBlack(m) ? slot : undefined))),
    frame: makeStrip(W, kh)
  };
  if (cache.size >= 4) cache.delete(cache.keys().next().value);
  cache.set(key, e);
  return e;
}

/**
 * @param active  Map midi → staff slot (0 / 1) of the keys sounding now
 * @param range   { lo, hi } from keyboardRange
 * @param colors  [first staff, second staff] glow colours (#rrggbb)
 * @param alpha   fades the whole keyboard (video lead-in / lead-out)
 */
export function drawKeyboard(ctx, W, H, active, range, colors, alpha = 1) {
  const kh = keyboardHeight(W, H);
  if (kh < 8 || !range) return;
  const e = stripsFor(W, kh, range, colors);
  const { whites, n, ww, edge, keyTop, bw, bh, bFront } = e.geo;
  if (!n) return;
  let src = e.base;
  if (active && active.size) {
    // the resting keyboard, then the pressed white keys' columns, then the pressed black keys
    const fc = e.frame.getContext("2d");
    fc.globalCompositeOperation = "copy";
    fc.drawImage(e.base, 0, 0);
    fc.globalCompositeOperation = "source-over";
    whites.forEach((m, i) => {
      if (!active.has(m)) return;
      fc.drawImage(e.whites[active.get(m) === 1 ? 1 : 0], edge(i), 0, ww, kh, edge(i), 0, ww, kh);
    });
    const press = Math.max(1, Math.round(bFront * 0.5));
    for (const [m, slot] of active) {
      if (!isBlack(m)) continue;
      const li = whites.indexOf(m - 1);
      if (li < 0 || li + 1 >= n) continue;
      const x = edge(li + 1) - bw / 2;
      fc.drawImage(e.blacks[slot === 1 ? 1 : 0], x, keyTop, bw, bh + press, x, keyTop, bw, bh + press);
    }
    src = e.frame;
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.filter = "none";
  ctx.shadowColor = "transparent";
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, Math.round(H - kh));
  ctx.restore();
}
