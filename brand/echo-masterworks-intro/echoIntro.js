// Echo Masterworks — intro animation (16:9), reusable in every app and for videos.
// No dependencies: canvas 2D + Web Audio. See README.md in this folder.
//
// Story (3.5 s): the logo appears in the middle of the screen, slides to the left, and the wordmark
// "ECHO / MASTERWORKS" builds up to its right — the finished frame is the Echo Masterworks artwork.
// Everything is drawn on ONE canvas that fills the whole window (the backdrop too), so the motion is never
// cut off at the edges of a picture. Flat drawing only: no glow (Echo Masterworks rule: no neon).
// CRITICAL: time-based (performance.now) — a dropped frame never slows or desyncs the animation.
//
//   0.00–0.90  logo appears in the centre: fades in, grows from 82 %, turns into place
//   0.85–1.70  logo slides to the left
//   1.30–2.25  "ECHO" is revealed from the left
//   1.55–2.45  "MASTERWORKS" is revealed from the left
//   3.05–3.50  everything fades out
//
// drawIntroFrame() is exported on its own, so the same frames can be written to a video file.

export const INTRO_DURATION = 3.5;

// where the parts sit in the finished 16:9 frame (fractions of width / height; measured from the artwork)
export const LAYOUT = {
  emblem: [0.118, 0.22133, 0.3135, 0.55733],
  top: [0.4695, 0.36889, 0.4125, 0.17244],
  bottom: [0.4695, 0.57067, 0.4125, 0.05867]
};

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOutCubic = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const easeInOutCubic = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const phase = (t, a, b) => clamp01((t - a) / (b - a));

/** The backdrop of the artwork: a dark teal light top left, a hint of violet bottom right. */
export function drawBackdrop(ctx, W, H) {
  ctx.fillStyle = "#0b0e12";
  ctx.fillRect(0, 0, W, H);
  let g = ctx.createRadialGradient(W * 0.3, H * 0.32, 0, W * 0.3, H * 0.32, W * 0.62);
  g.addColorStop(0, "rgba(28, 52, 58, 0.9)");
  g.addColorStop(1, "rgba(28, 52, 58, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(W * 0.92, H * 1.02, 0, W * 0.92, H * 1.02, W * 0.45);
  g.addColorStop(0, "rgba(40, 18, 58, 0.55)");
  g.addColorStop(1, "rgba(40, 18, 58, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/**
 * One frame of the intro at time t (seconds) on a W×H canvas (16:9).
 * imgs = { emblem, top, bottom } (loaded images); backdrop = optional pre-drawn canvas of drawBackdrop.
 */
export function drawIntroFrame(ctx, W, H, t, imgs, backdrop = null) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  if (backdrop) ctx.drawImage(backdrop, 0, 0, W, H);
  else drawBackdrop(ctx, W, H);

  const out = easeInOutCubic(phase(t, INTRO_DURATION - 0.45, INTRO_DURATION)); // 0 → 1 at the end
  const fade = 1 - out;
  const push = 1 + 0.025 * out;

  // ---- logo: appears in the centre, then slides left ----
  const [ex, ey, ew, eh] = LAYOUT.emblem;
  const endCx = (ex + ew / 2) * W, cy = (ey + eh / 2) * H;
  const appear = easeOutCubic(phase(t, 0, 0.9));
  const slide = easeInOutCubic(phase(t, 0.85, 1.7));
  const cx = W / 2 + (endCx - W / 2) * slide;
  const scale = (0.82 + 0.18 * appear) * push;
  const turn = (1 - appear) * -0.7; // radians: turns into place while it appears
  ctx.save();
  ctx.globalAlpha = appear * fade;
  ctx.translate(cx, cy);
  ctx.rotate(turn);
  ctx.scale(scale, scale);
  const w = ew * W, h = eh * H;
  ctx.drawImage(imgs.emblem, -w / 2, -h / 2, w, h);
  ctx.restore();

  // ---- wordmark: each line revealed from the left, sliding in a little ----
  const line = (img, rect, a, b) => {
    const p = easeOutCubic(phase(t, a, b));
    if (p <= 0) return;
    const [x, y, rw, rh] = rect;
    const X = x * W, Y = y * H, RW = rw * W, RH = rh * H;
    const shift = (1 - p) * 0.035 * W;
    ctx.save();
    ctx.globalAlpha = Math.min(1, p * 1.4) * fade;
    ctx.beginPath();
    ctx.rect(X - 2, Y - 4, RW * p + 4, RH + 8); // the reveal: a window growing to the right
    ctx.clip();
    ctx.translate(W / 2, H / 2); ctx.scale(push, push); ctx.translate(-W / 2, -H / 2);
    ctx.drawImage(img, X - shift, Y, RW, RH);
    ctx.restore();
  };
  line(imgs.top, LAYOUT.top, 1.3, 2.25);
  line(imgs.bottom, LAYOUT.bottom, 1.55, 2.45);
}

/** Audible part of a sound (seconds): skips the silence at the start. */
function audibleStart(buffer) {
  const ch = buffer.getChannelData(0);
  const win = Math.max(1, Math.round(buffer.sampleRate * 0.02));
  for (let i = 0; i < ch.length; i += win) {
    let s = 0;
    const n = Math.min(win, ch.length - i);
    for (let j = 0; j < n; j++) s += ch[i + j] * ch[i + j];
    if (20 * Math.log10(Math.sqrt(s / n) + 1e-9) > -50) return Math.max(0, i / buffer.sampleRate - 0.03);
  }
  return 0;
}

// PERF: fully decoded bitmaps — a plain <img> may be decoded only when first drawn, which would make the
// animation stutter the moment the logo or a wordmark line first appears.
const loadImage = async (src) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  return typeof createImageBitmap === "function" ? createImageBitmap(img) : img;
};

/**
 * Plays the intro inside `mount` (an element filling the window).
 * @param {object} o
 * @param {HTMLElement} o.mount
 * @param {{emblem:string, top:string, bottom:string}} o.images  URLs of the three parts
 * @param {string} [o.soundUrl]  sound (its leading silence is skipped)
 * @param {Promise} [o.ready]    start only when this resolves (everything heavy is prepared before)
 * @param {Function} [o.onStart] called right before the first frame — e.g. show the window only now
 * @returns {Promise<void>} resolves when the animation has finished
 */
export async function playEchoIntro({ mount, images, soundUrl, ready, onStart }) {
  const doc = mount.ownerDocument;
  const win = doc.defaultView;
  const canvas = doc.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  mount.appendChild(canvas);

  // sound decoded and pictures loaded before the clock starts
  let ac = null, buffer = null;
  const [emblem, top, bottom] = await Promise.all([loadImage(images.emblem), loadImage(images.top), loadImage(images.bottom)]);
  if (soundUrl) {
    try {
      ac = new AudioContext();
      buffer = await ac.decodeAudioData(await (await fetch(soundUrl)).arrayBuffer());
    } catch (_) { buffer = null; }
  }
  const dpr = Math.min(2, win.devicePixelRatio || 1);
  const W = Math.max(2, Math.round(mount.clientWidth * dpr));
  const H = Math.max(2, Math.round(mount.clientHeight * dpr));
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { alpha: false });
  // PERF: the backdrop gradients are drawn once, then copied every frame
  const back = doc.createElement("canvas");
  back.width = W; back.height = H;
  drawBackdrop(back.getContext("2d"), W, H);
  const imgs = { emblem, top, bottom };
  drawIntroFrame(ctx, W, H, 0, imgs, back);

  if (ready) await ready;
  if (onStart) {
    onStart();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 40))));
  }
  if (buffer) {
    const start = audibleStart(buffer);
    const len = Math.min(INTRO_DURATION, buffer.duration - start);
    const src = ac.createBufferSource();
    src.buffer = buffer;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(1, ac.currentTime + Math.max(0, len - 0.35));
    gain.gain.linearRampToValueAtTime(0, ac.currentTime + len);
    src.connect(gain).connect(ac.destination);
    src.start(0, start, len);
  }

  const t0 = performance.now();
  await new Promise((resolve) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      drawIntroFrame(ctx, W, H, Math.min(t, INTRO_DURATION), imgs, back);
      if (t >= INTRO_DURATION) { resolve(); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  if (ac) ac.close().catch(() => {});
}
