// Echo Masterworks — universal intro animation (logo + sound), reusable in every app.
// No dependencies: plain DOM + canvas 2D + Web Audio. See README.md in this folder.
//
// The logo itself moves: it is cut into concentric bands (spiral core, rings, lettering, outer ring) that spin
// in from alternating directions and lock into place from the centre outwards, like an echo settling.
// Timeline (default 3.5 s):
//   0.00–1.50  bands spin / scale in and lock, centre first
//   1.50       lock-in: bloom flash + a strong echo ring
//   1.25–1.90  title letters rise in
//   1.65–2.45  light sweep across the emblem; orbiting sparks; gentle push-in
//   3.00–3.50  logo lifts and fades, everything fades to black
// Extra echo rings fire on every hit detected in the sound.
// CRITICAL: time-based (performance.now), so a dropped frame never slows or desyncs the animation.

const STYLE_ID = "emi-style";
const CSS = `
.emi-root{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;overflow:hidden;
  background:var(--emi-bg,radial-gradient(ellipse at 50% 42%,#1a1b1a 0%,#0e0f0e 55%,#050605 100%));font-family:var(--emi-font,"Diapason","Times New Roman",serif);user-select:none;cursor:default}
.emi-stage{position:relative;width:var(--emi-size,440px);aspect-ratio:var(--emi-aspect,1376/768)}
.emi-canvas{position:absolute;inset:0;width:100%;height:100%}
.emi-title{display:flex;margin-top:var(--emi-title-gap,-4px);font-size:var(--emi-title-size,34px);font-weight:700;letter-spacing:-.01em;color:#fff;white-space:pre}
.emi-title span{display:inline-block;opacity:0;transform:translateY(.4em)}
.emi-sub{font-size:12px;font-weight:600;letter-spacing:.32em;text-transform:uppercase;color:var(--emi-sub-color,rgba(255,255,255,.6));opacity:0;margin-left:.32em}
.emi-sub:empty{display:none}
.emi-bar{margin-top:12px;width:150px;height:2px;background:#232423;overflow:hidden}
.emi-bar i{display:block;width:100%;height:100%;background:var(--emi-accent,#cca700);transform:translateX(-100%)}
`;

// logo geometry: emblem radius as a fraction of the artwork height (default: the old 1376×768 artwork)
const DEFAULT_EMBLEM_R = 0.38;
// bands: [inner, outer] radius (× EMBLEM_R), spin-in angle (deg), start scale
const BANDS = [
  [0.0, 0.22, 150, 0.4],
  [0.22, 0.42, -120, 0.55],
  [0.42, 0.62, 95, 0.7],
  [0.62, 0.77, -75, 0.82],
  [0.77, 0.935, 60, 1.18],
  [0.935, 1.08, -40, 1.32]
];

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOutExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
const easeOutCubic = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const easeInCubic = (x) => Math.pow(clamp01(x), 3);
const smooth = (a, b, x) => { const v = clamp01((x - a) / (b - a)); return v * v * (3 - 2 * v); };

/** Audible part of a sound + the moments of its hits (onsets), in seconds. */
function analyse(buffer) {
  const ch = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const win = Math.max(1, Math.round(sr * 0.02)); // 20 ms frames
  const db = [];
  for (let i = 0; i < ch.length; i += win) {
    let s = 0;
    const n = Math.min(win, ch.length - i);
    for (let j = 0; j < n; j++) s += ch[i + j] * ch[i + j];
    db.push(20 * Math.log10(Math.sqrt(s / n) + 1e-9));
  }
  const frame = win / sr;
  const firstIdx = db.findIndex((d) => d > -50);
  let lastIdx = db.length - 1;
  while (lastIdx > 0 && db[lastIdx] < -60) lastIdx--; // trailing silence (and the near-silent tail)
  const start = Math.max(0, (firstIdx < 0 ? 0 : firstIdx) * frame - 0.03);
  const end = Math.min(buffer.duration, (lastIdx + 1) * frame + 0.15);
  const onsets = [];
  for (let i = Math.max(1, firstIdx); i <= lastIdx; i++) {
    const rise = db[i] - Math.min(db[i - 1], db[Math.max(0, i - 2)]);
    if (db[i] > -40 && rise > 6 && (!onsets.length || i * frame - onsets[onsets.length - 1] > 0.25)) onsets.push(i * frame);
  }
  return { start, end, onsets: onsets.map((t) => Math.max(0, t - start)) };
}

function ensureStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const s = doc.createElement("style");
  s.id = STYLE_ID;
  s.textContent = CSS;
  doc.head.appendChild(s);
}

/**
 * The logo at canvas size, ready to cut into bands, + a blurred bloom copy.
 * Transparent artwork (e.g. the coloured seal) is used as it is, colours kept; artwork on a dark backdrop is
 * turned into white-on-transparent line art.
 */
function prepareLogo(img, W, H) {
  const c = new OffscreenCanvasOr(W, H);
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H);
  const px = d.data;
  const transparent = px[3] < 8 && px[px.length - 1] < 8; // top-left and bottom-right corners
  for (let i = 0; !transparent && i < px.length; i += 4) {
    const lum = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    const a = clamp01((lum - 48) / 170); // the dark backdrop of the artwork becomes transparent
    px[i] = px[i + 1] = px[i + 2] = 255;
    px[i + 3] = Math.round(a * 255);
  }
  if (!transparent) g.putImageData(d, 0, 0);
  const bloom = new OffscreenCanvasOr(W, H);
  const b = bloom.getContext("2d");
  b.filter = `blur(${Math.max(4, Math.round(H / 60))}px)`;
  b.drawImage(c, 0, 0);
  b.filter = "none";
  return { mask: c, bloom };
}

function drawFrameEmpty(ctx, W, H) {
  ctx.clearRect(0, 0, W, H);
}

function OffscreenCanvasOr(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Plays the intro inside `mount` (an element filling the window).
 * @param {object} o
 * @param {HTMLElement} o.mount
 * @param {string} o.logoUrl   logo artwork (light lines on a dark backdrop)
 * @param {string} [o.soundUrl] sound; its silence is skipped automatically and its hits trigger echo rings
 * @param {string} [o.title]   app name under the logo, e.g. "Partitura"
 * @param {string} [o.subtitle] small line under the title, e.g. the family "Echo Studio"
 * @param {number} [o.emblemRadius] emblem radius as a fraction of the artwork height (default 0.38)
 * @param {string} [o.aspect]  artwork aspect ratio for the stage, e.g. "1/1" (default "1376/768")
 * @param {number} [o.duration] seconds (default 3.5)
 * @param {string} [o.accent]  progress-line colour
 * @param {Promise} [o.ready]   optional: start only when this resolves (everything is prepared before)
 * @param {Function} [o.onStart] called right before the first frame (sound decoded, logo prepared) —
 *                              e.g. show the splash window only now, so it never sits there empty
 * @returns {Promise<void>} resolves when the animation has finished
 */
export async function playEchoIntro({ mount, logoUrl, soundUrl, title = "", subtitle = "", emblemRadius = DEFAULT_EMBLEM_R, aspect, duration = 3.5, accent, onStart, ready }) {
  const doc = mount.ownerDocument;
  const win = doc.defaultView;
  ensureStyle(doc);
  const root = doc.createElement("div");
  root.className = "emi-root";
  if (accent) root.style.setProperty("--emi-accent", accent);
  if (aspect) root.style.setProperty("--emi-aspect", aspect);
  root.innerHTML = `<div class="emi-stage"><canvas class="emi-canvas"></canvas></div><div class="emi-title"></div><div class="emi-sub"></div><div class="emi-bar"><i></i></div>`;
  root.querySelector(".emi-sub").textContent = subtitle;
  mount.appendChild(root);
  const stage = root.querySelector(".emi-stage");
  const canvas = root.querySelector(".emi-canvas");
  const titleEl = root.querySelector(".emi-title");
  const bar = root.querySelector(".emi-bar i");
  for (const ch of title) {
    const sp = doc.createElement("span");
    sp.textContent = ch;
    titleEl.appendChild(sp);
  }

  // sound (decoded first; its hits drive extra echo rings)
  let ac = null, buffer = null, cut = { start: 0, end: duration, onsets: [] };
  if (soundUrl) {
    try {
      ac = new AudioContext();
      buffer = await ac.decodeAudioData(await (await fetch(soundUrl)).arrayBuffer());
      cut = analyse(buffer);
    } catch (_) {
      buffer = null; // no sound: silent intro
    }
  }

  // logo, prepared once at the canvas resolution (everything heavy happens before the first frame)
  const img = new Image();
  img.src = logoUrl;
  await Promise.all([img.decode().catch(() => {}), doc.fonts ? doc.fonts.ready : null]);
  const dpr = Math.min(2, win.devicePixelRatio || 1);
  const rect = stage.getBoundingClientRect();
  const W = Math.max(2, Math.round((rect.width || 440) * dpr));
  const H = Math.max(2, Math.round((rect.height || 246) * dpr));
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const { mask, bloom } = prepareLogo(img, W, H);
  const cx = W / 2, cy = H / 2, R = emblemRadius * H;
  const sparks = Array.from({ length: 34 }, (_, i) => ({
    a: (i / 34) * Math.PI * 2 + Math.sin(i * 12.9898) * 0.4,
    r: R * (1.05 + ((i * 37) % 23) / 70),
    s: (0.25 + ((i * 53) % 17) / 40) * (i % 2 ? 1 : -1),
    z: 0.6 + ((i * 29) % 11) / 11
  }));

  const D = duration;
  const LOCK = 1.5;
  const rings = [LOCK, ...cut.onsets.filter((t) => t < D - 0.8).slice(0, 5)].sort((a, b) => a - b);
  drawFrameEmpty(ctx, W, H);
  if (ready) await ready; // e.g. the host app finished loading: nothing heavy runs during the animation

  if (onStart) {
    onStart();
    // let the window appear before the clock starts (first frames are not lost to the window showing)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 40))));
  }
  if (buffer) {
    const len = Math.min(D, Math.max(0.2, cut.end - cut.start));
    const src = ac.createBufferSource();
    src.buffer = buffer;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(1, ac.currentTime + Math.max(0, len - 0.35));
    gain.gain.linearRampToValueAtTime(0, ac.currentTime + len);
    src.connect(gain).connect(ac.destination);
    src.start(0, cut.start, len);
  }

  // DOM parts (compositor-driven)
  [...titleEl.children].forEach((sp, i) =>
    sp.animate(
      [{ opacity: 0, transform: "translateY(.4em) scale(.96)" }, { opacity: 1, transform: "translateY(0) scale(1)" }],
      { duration: 520, delay: 1250 + i * 42, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" }
    )
  );
  bar.animate([{ transform: "translateX(-100%)" }, { transform: "translateX(0)" }], { duration: Math.round((D - 0.5) * 1000), easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" });
  titleEl.animate([{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(-6px)" }], { duration: 420, delay: Math.round((D - 0.5) * 1000), fill: "forwards", easing: "ease-in" });
  const subEl = root.querySelector(".emi-sub");
  subEl.animate([{ opacity: 0, letterSpacing: ".6em" }, { opacity: 1, letterSpacing: ".32em" }], { duration: 700, delay: 1700, easing: "cubic-bezier(.16,1,.3,1)", fill: "forwards" });
  subEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, delay: Math.round((D - 0.5) * 1000), fill: "forwards", composite: "replace" });
  root.querySelector(".emi-bar").animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: Math.round((D - 0.5) * 1000), fill: "forwards" });

  const t0 = performance.now();
  const drawFrame = (t) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, W, H);

    const exit = easeInCubic((t - (D - 0.5)) / 0.5); // 0 → 1 over the last half second
    const push = 1 + 0.025 * smooth(LOCK, D - 0.5, t) + 0.07 * exit;
    const fade = 1 - exit;

    if (t >= LOCK && exit <= 0 && Math.abs(push - 1) < 1e-4) {
      ctx.drawImage(mask, 0, 0); // assembled: one draw
    } else if (t >= LOCK) {
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(cx, cy); ctx.scale(push, push); ctx.translate(-cx, -cy);
      ctx.drawImage(mask, 0, 0);
      ctx.restore();
    } else {
      // spinning bands — each draws only the square around its own circle (cheap on weak GPUs)
      BANDS.forEach(([r0, r1, rot, s0], i) => {
        const start = 0.1 + i * 0.09;
        const p = clamp01((t - start) / 0.95);
        if (p <= 0) return;
        const e = easeOutExpo(p);
        const angle = ((1 - e) * rot * Math.PI) / 180;
        const scale = (s0 + (1 - s0) * e) * push;
        const half = Math.ceil(r1 * R + 2);
        const sx = Math.max(0, Math.floor(cx - half)), sy = Math.max(0, Math.floor(cy - half));
        const sw = Math.min(W - sx, half * 2), sh = Math.min(H - sy, half * 2);
        ctx.save();
        ctx.globalAlpha = clamp01(p * 2.4) * fade;
        ctx.beginPath();
        ctx.arc(cx, cy, r1 * R * scale + 1, 0, Math.PI * 2);
        if (r0 > 0) ctx.arc(cx, cy, Math.max(0, r0 * R * scale - 1), 0, Math.PI * 2, true);
        ctx.clip("evenodd");
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -cy);
        ctx.drawImage(mask, sx, sy, sw, sh, sx, sy, sw, sh);
        ctx.restore();
      });
      // the rest of the artwork outside the emblem (the dash after MASTERWORKS) fades in late
      const outA = smooth(1.0, 1.5, t);
      if (outA > 0) {
        ctx.save();
        ctx.globalAlpha = outA * fade;
        ctx.beginPath();
        ctx.rect(0, 0, W, H);
        ctx.arc(cx, cy, 1.08 * R, 0, Math.PI * 2, true);
        ctx.clip("evenodd");
        ctx.drawImage(mask, 0, 0);
        ctx.restore();
      }
    }
    ctx.globalCompositeOperation = "lighter";

    // lock-in bloom + a soft pulse on every echo
    let glow = 0.9 * Math.exp(-Math.max(0, t - LOCK) * 4) * (t >= LOCK ? 1 : smooth(LOCK - 0.25, LOCK, t));
    for (const r of rings) if (t >= r) glow += 0.25 * Math.exp(-(t - r) * 5);
    glow += 0.12 * smooth(LOCK, LOCK + 0.6, t); // a faint permanent halo once assembled
    if (glow > 0.005) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, glow) * fade;
      ctx.translate(cx, cy); ctx.scale(push, push); ctx.translate(-cx, -cy);
      ctx.drawImage(bloom, 0, 0);
      ctx.restore();
    }

    // golden light sweep over the lines (+ their halo); source-over so it shows on white lines
    const sw = smooth(1.65, 2.45, t);
    if (sw > 0 && sw < 1) {
      const x = -0.3 * W + sw * 1.6 * W;
      const tmp = sweepCanvas;
      const g = tmp.getContext("2d");
      g.globalCompositeOperation = "source-over";
      g.clearRect(0, 0, W, H);
      g.save();
      g.translate(cx, cy); g.scale(push, push); g.translate(-cx, -cy);
      g.drawImage(bloom, 0, 0);
      g.drawImage(mask, 0, 0);
      g.restore();
      g.globalCompositeOperation = "source-in";
      const lg = g.createLinearGradient(x - W * 0.12, 0, x + W * 0.12, H * 0.25);
      lg.addColorStop(0, "rgba(232,190,80,0)");
      lg.addColorStop(0.5, "rgba(240,200,95,1)");
      lg.addColorStop(1, "rgba(232,190,80,0)");
      g.fillStyle = lg;
      g.fillRect(x - W * 0.2, 0, W * 0.4, H); // source-in also clears everything outside this band
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.9 * fade;
      ctx.drawImage(tmp, 0, 0);
      ctx.globalCompositeOperation = "lighter";
    }

    // echo rings
    ctx.lineWidth = Math.max(1, 1.4 * dpr);
    for (const r of rings) {
      const age = t - r;
      if (age < 0 || age > 1.3) continue;
      const k = easeOutCubic(age / 1.3);
      ctx.globalAlpha = (1 - k) * (r === LOCK ? 0.85 : 0.5) * fade;
      ctx.strokeStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(cx, cy, R * (0.95 + k * 0.9) * push, 0, Math.PI * 2);
      ctx.stroke();
    }

    // orbiting sparks
    const sparkA = smooth(0.9, 1.7, t) * fade;
    if (sparkA > 0) {
      ctx.fillStyle = "#ffffff";
      for (const s of sparks) {
        const a = s.a + s.s * t;
        const rr = s.r * push * (1 + 0.04 * Math.sin(t * 2 + s.a * 3));
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr * 0.98;
        ctx.globalAlpha = sparkA * 0.55 * s.z * (0.6 + 0.4 * Math.sin(t * 6 + s.a * 7));
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.8, 1.2 * dpr * s.z), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
  const sweepCanvas = OffscreenCanvasOr(W, H);

  drawFrame(0);
  await new Promise((resolve) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      drawFrame(Math.min(t, D));
      if (t >= D) { resolve(); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  if (ac) ac.close().catch(() => {});
}
