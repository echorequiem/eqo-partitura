// titleCards.js — intro / outro screens drawn on a canvas, shared by the page-2 preview and the render.
// CRITICAL: always drawn at the OUTPUT resolution; every size derives from the frame (unit u), so 720p…4K and
// 16:9 / 9:16 / 1:1 keep identical proportions and stay sharp. Call ensureCardFonts() before drawing.
//
// A card ("segment") is a video, a text template, or both (text over the video). Lists of cards play in order.

export const CARD_TEMPLATES = ["classic", "modern", "cinematic"];
const FADE = 0.7; // s, fade from / to black at both ends of a card

const SANS = `"Manrope Variable", "Noto Sans JP Variable", "Noto Sans SC Variable", "Segoe UI", sans-serif`;
const SERIF = `"Cormorant Garamond Variable", "Noto Serif", Georgia, serif`;
const DISPLAY = `"Playfair Display Variable", "Cormorant Garamond Variable", Georgia, serif`;

/** Video + text on one screen: text then video, video then text, or text over the video. */
export const TEXT_ORDERS = ["textFirst", "videoFirst", "together"];

export function defaultCard(kind, type = "text") {
  return {
    textEnabled: type === "text",
    textOrder: kind === "outro" ? "videoFirst" : "textFirst",
    template: "classic",
    duration: 5,
    fields: kind === "outro"
      ? { title: "", composer: "", subtitle: "", extra: "Echo Masterworks" }
      : { title: "", composer: "", subtitle: "", extra: "Echo Masterworks" },
    // runtime only (not saved in settings)
    videoFile: null,
    videoName: "",
    videoDuration: 0,
    videoUrl: null
  };
}

/** Card length in seconds (0 = empty card, skipped). */
export function cardDuration(card) {
  if (!card) return 0;
  if (card.videoFile && card.videoDuration > 0) return card.videoDuration + (isSequential(card) ? textLength(card) : 0);
  if (card.textEnabled) return textLength(card);
  return 0;
}

const textLength = (card) => Math.max(1, Number(card.duration) || 5);

/** Video and text one after the other (not overlaid)? */
export function isSequential(card) {
  return !!(card && card.videoFile && card.videoDuration > 0 && card.textEnabled && card.textOrder !== "together");
}

/**
 * Part of a screen at local time t.
 * -> { kind: "text" | "video" | "both", t: time inside the part, duration: part length, videoTime: s | null }
 */
export function cardPhaseAt(card, t) {
  if (!isSequential(card)) {
    const kind = card.videoFile ? (card.textEnabled ? "both" : "video") : "text";
    return { kind, t, duration: cardDuration(card), videoTime: card.videoFile ? t : null };
  }
  const textFirst = card.textOrder === "textFirst";
  const firstLen = textFirst ? textLength(card) : card.videoDuration;
  if (t < firstLen) return { kind: textFirst ? "text" : "video", t, duration: firstLen, videoTime: textFirst ? null : t };
  const lt = t - firstLen;
  return textFirst
    ? { kind: "video", t: lt, duration: card.videoDuration, videoTime: lt }
    : { kind: "text", t: lt, duration: textLength(card), videoTime: null };
}

/** Where the screen's video (and its sound) starts inside the screen. */
export const cardVideoOffset = (card) => (isSequential(card) && card.textOrder === "textFirst" ? textLength(card) : 0);

export const listDuration = (list) => (list || []).reduce((s, c) => s + cardDuration(c), 0);

/** Settings saved in the project (no File objects). */
export function cardSettings(card) {
  return {
    textEnabled: !!card.textEnabled,
    hasVideo: !!card.videoFile,
    textOrder: TEXT_ORDERS.includes(card.textOrder) ? card.textOrder : "textFirst",
    template: CARD_TEMPLATES.includes(card.template) ? card.template : "classic",
    duration: Number(card.duration) || 5,
    fields: { ...card.fields }
  };
}

/** Loads the card fonts so the first frame is not drawn with a fallback font. */
export async function ensureCardFonts() {
  if (typeof document === "undefined" || !document.fonts) return;
  const specs = [
    `600 40px "Cormorant Garamond Variable"`, `italic 400 40px "Cormorant Garamond Variable"`,
    `500 40px "Playfair Display Variable"`, `400 40px "Manrope Variable"`, `700 40px "Manrope Variable"`, `800 40px "Manrope Variable"`
  ];
  await Promise.all(specs.map((s) => document.fonts.load(s, "AaÇĞİŞÖÜ").catch(() => {})));
}

// ---------------------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------------------
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const easeInOut = (x) => { const v = clamp01(x); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };

/** Language-aware upper case (Turkish i → İ, not I). */
const upperCase = (s) => {
  const lang = (typeof document !== "undefined" && document.documentElement.lang) || undefined;
  try { return s.toLocaleUpperCase(lang); } catch (_) { return s.toUpperCase(); }
};

function setFont(ctx, { family, size, weight = 400, italic = false, tracking = 0 }) {
  ctx.font = `${italic ? "italic " : ""}${weight} ${size}px ${family}`;
  ctx.letterSpacing = `${tracking * size}px`;
  ctx.fontKerning = "normal";
}

/** Shrinks the font until the text fits maxWidth; returns the size used. */
function fit(ctx, text, maxWidth, opts) {
  let size = opts.size;
  for (let i = 0; i < 24; i++) {
    setFont(ctx, { ...opts, size });
    if (ctx.measureText(text).width <= maxWidth || size < 6) break;
    size *= 0.93;
  }
  return size;
}

/**
 * Draws one line of text with an entrance: fade + rise, optionally revealed by a left-to-right wipe.
 * p = entrance progress 0…1.
 */
function text(ctx, str, x, y, o) {
  if (!str) return;
  const s = o.upper ? upperCase(str) : str;
  const p = clamp01(o.p);
  if (p <= 0) return;
  const size = fit(ctx, s, o.maxWidth, o);
  ctx.save();
  ctx.globalAlpha *= easeOut(p);
  ctx.fillStyle = o.color || "#ffffff";
  ctx.textAlign = o.align || "center";
  ctx.textBaseline = "middle";
  if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = size * 0.35; }
  else if (o.shadow !== false) { ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = size * 0.12; ctx.shadowOffsetY = size * 0.03; }
  if (o.wipe) {
    const w = ctx.measureText(s).width;
    const left = o.align === "left" ? x : o.align === "right" ? x - w : x - w / 2;
    ctx.beginPath();
    ctx.rect(left - size, y - size, (w + size * 2) * easeInOut(p), size * 2);
    ctx.clip();
  }
  ctx.fillText(s, x, y + (1 - easeOut(p)) * size * (o.rise ?? 0.3));
  ctx.restore();
  return size;
}

function hairline(ctx, x1, x2, y, width, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  ctx.fillRect(Math.min(x1, x2), y - width / 2, Math.abs(x2 - x1), width);
  ctx.restore();
}

// ---- backdrop: cached blurred photo + vignette + film grain ------------------------------------------------
const backdropCache = new Map(); // key -> canvas (blurred photo at output size)
let grainTile = null;

function blurredPhoto(media, W, H) {
  const key = `${W}x${H}:${media.currentSrc || media.src}`;
  if (backdropCache.has(key)) return backdropCache.get(key);
  const nw = media.videoWidth || media.naturalWidth;
  const nh = media.videoHeight || media.naturalHeight;
  if (!nw || !nh) return null;
  // blur at quarter size (fast, smooth), scale up once
  const q = document.createElement("canvas");
  q.width = Math.max(16, Math.round(W / 4));
  q.height = Math.max(16, Math.round(H / 4));
  const qc = q.getContext("2d");
  const sc = Math.max(q.width / nw, q.height / nh) * 1.15;
  qc.filter = `blur(${Math.round(q.height * 0.035)}px) brightness(0.42) saturate(1.1)`;
  qc.drawImage(media, (q.width - nw * sc) / 2, (q.height - nh * sc) / 2, nw * sc, nh * sc);
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const oc = out.getContext("2d");
  oc.imageSmoothingQuality = "high";
  oc.drawImage(q, 0, 0, W, H);
  if (backdropCache.size > 6) backdropCache.delete(backdropCache.keys().next().value);
  backdropCache.set(key, out);
  return out;
}

function grain() {
  if (grainTile) return grainTile;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const img = g.createImageData(256, 256);
  let seed = 1234567;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const v = seed >>> 24;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

function drawBackdrop(ctx, W, H, t, duration, bgMedia, accent) {
  ctx.fillStyle = "#07080a";
  ctx.fillRect(0, 0, W, H);
  const photo = bgMedia ? blurredPhoto(bgMedia, W, H) : null;
  const drift = 1 + 0.035 * easeInOut(duration > 0 ? t / duration : 0); // slow camera push-in
  if (photo) {
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(drift, drift);
    ctx.drawImage(photo, -W / 2, -H / 2, W, H);
    ctx.restore();
  } else {
    // deep gradient with a faint warm light from above
    const g = ctx.createRadialGradient(W * 0.5, H * 0.32, 0, W * 0.5, H * 0.45, Math.max(W, H) * 0.75 * drift);
    g.addColorStop(0, "#1d1e22");
    g.addColorStop(0.55, "#0e0f12");
    g.addColorStop(1, "#050506");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const a = ctx.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, Math.min(W, H) * 0.45);
    a.addColorStop(0, hexA(accent, 0.07));
    a.addColorStop(1, hexA(accent, 0));
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, W, H);
  }
  vignette(ctx, W, H, 0.6);
}

function vignette(ctx, W, H, strength) {
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.55);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

function drawGrain(ctx, W, H, t) {
  const tile = grain();
  ctx.save();
  ctx.globalAlpha = 0.045;
  ctx.globalCompositeOperation = "overlay";
  const ox = Math.floor((t * 97) % 256);
  const oy = Math.floor((t * 61) % 256);
  ctx.translate(-ox, -oy);
  ctx.fillStyle = ctx.createPattern(tile, "repeat");
  ctx.fillRect(0, 0, W + 256, H + 256);
  ctx.restore();
}

function hexA(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  const n = m ? parseInt(m[1], 16) : 0xcca700;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function drawVideoFrame(ctx, W, H, video) {
  const nw = video.videoWidth;
  const nh = video.videoHeight;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  if (!nw || !nh) return;
  const sc = Math.max(W / nw, H / nh); // cover
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(video, (W - nw * sc) / 2, (H - nh * sc) / 2, nw * sc, nh * sc);
}

// ---------------------------------------------------------------------------------------------------------
// templates — layout in units of u (1u ≈ 1 % of a 1080p frame's height, smaller for portrait / square)
// ---------------------------------------------------------------------------------------------------------
function layoutUnit(W, H) {
  return Math.min(W / 16, H / 9) / 10.8;
}

function classic(ctx, W, H, f, t, accent) {
  const u = layoutUnit(W, H);
  const cx = W / 2;
  const cy = H * 0.48;
  const maxW = W * 0.84;
  text(ctx, f.composer, cx, cy - u * 10.5, { family: SANS, size: u * 2.3, weight: 600, tracking: 0.42, upper: true, color: "rgba(255,255,255,0.74)", p: (t - 0.25) / 0.9, maxWidth: maxW });
  text(ctx, f.title, cx, cy - u * 2.4, { family: SERIF, size: u * 10, weight: 600, tracking: 0.01, color: "#f6f1e7", p: (t - 0.45) / 1.1, maxWidth: maxW, rise: 0.18 });
  // ornament: hairlines + a small diamond
  const p = easeInOut((t - 0.9) / 1.0);
  const half = u * 15 * p;
  const oy = cy + u * 5.6;
  hairline(ctx, cx - u * 1.8, cx - u * 1.8 - half, oy, Math.max(1, u * 0.12), accent, 0.9);
  hairline(ctx, cx + u * 1.8, cx + u * 1.8 + half, oy, Math.max(1, u * 0.12), accent, 0.9);
  if (p > 0) {
    ctx.save();
    ctx.globalAlpha *= p;
    ctx.translate(cx, oy);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = accent;
    const d = u * 0.7;
    ctx.fillRect(-d / 2, -d / 2, d, d);
    ctx.restore();
  }
  text(ctx, f.subtitle, cx, cy + u * 10, { family: SERIF, size: u * 3.8, weight: 400, italic: true, color: "rgba(255,255,255,0.78)", p: (t - 1.15) / 0.9, maxWidth: maxW });
  text(ctx, f.extra, cx, H - u * 7, { family: SANS, size: u * 1.55, weight: 600, tracking: 0.55, upper: true, color: "rgba(255,255,255,0.42)", p: (t - 1.45) / 0.9, maxWidth: maxW, shadow: false });
}

function modern(ctx, W, H, f, t, accent) {
  const u = layoutUnit(W, H);
  const portrait = H > W;
  const x = W * (portrait ? 0.09 : 0.1);
  const maxW = W - x * 2;
  const cy = H * 0.5;
  // faint concentric "echo" rings on the right, slowly turning
  ctx.save();
  ctx.globalAlpha = 0.07 * easeOut(t / 1.2);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(1, u * 0.12);
  const rx = W * (portrait ? 0.5 : 0.8);
  const ry = portrait ? H * 0.82 : cy;
  for (let i = 0; i < 7; i++) {
    ctx.setLineDash([u * (6 + i * 3), u * (2 + i)]);
    ctx.lineDashOffset = -t * u * (4 + i);
    ctx.beginPath();
    ctx.arc(rx, ry, u * (7 + i * 4.2), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  // accent bar grows from the centre
  const bar = easeInOut(t / 0.9);
  ctx.fillStyle = accent;
  ctx.fillRect(x - u * 2.4, cy - u * 10 * bar, u * 0.55, u * 20 * bar);
  text(ctx, f.extra, x, cy - u * 8.6, { family: SANS, size: u * 1.8, weight: 700, tracking: 0.32, upper: true, color: accent, align: "left", p: (t - 0.3) / 0.8, maxWidth: maxW, wipe: true, rise: 0, shadow: false });
  text(ctx, f.title, x, cy - u * 2.6, { family: SANS, size: u * 8.6, weight: 800, tracking: -0.02, align: "left", p: (t - 0.45) / 0.9, maxWidth: maxW, wipe: true, rise: 0 });
  text(ctx, f.composer, x, cy + u * 4.4, { family: SANS, size: u * 3.3, weight: 500, color: "rgba(255,255,255,0.9)", align: "left", p: (t - 0.7) / 0.9, maxWidth: maxW, wipe: true, rise: 0 });
  text(ctx, f.subtitle, x, cy + u * 8.6, { family: SANS, size: u * 2.3, weight: 400, tracking: 0.02, color: "rgba(255,255,255,0.6)", align: "left", p: (t - 0.9) / 0.9, maxWidth: maxW, wipe: true, rise: 0 });
}

function cinematic(ctx, W, H, f, t, accent) {
  const u = layoutUnit(W, H);
  const cx = W / 2;
  const maxW = W * 0.84;
  const band = H * 0.115 * easeInOut(t / 0.9);
  // a slow warm light sweeping across
  const sweep = ctx.createLinearGradient(0, 0, W, 0);
  const sx = ((t * 0.08) % 1.6) - 0.3;
  sweep.addColorStop(Math.max(0, Math.min(1, sx)), "rgba(255,200,140,0)");
  sweep.addColorStop(Math.max(0, Math.min(1, sx + 0.15)), "rgba(255,200,140,0.06)");
  sweep.addColorStop(Math.max(0, Math.min(1, sx + 0.3)), "rgba(255,200,140,0)");
  ctx.fillStyle = sweep;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, band);
  ctx.fillRect(0, H - band, W, band);
  const cy = H * 0.47;
  text(ctx, f.title, cx, cy, { family: DISPLAY, size: u * 6.6, weight: 500, tracking: 0.2, upper: true, color: "#f3efe6", p: (t - 0.5) / 1.3, maxWidth: maxW, rise: 0.12, glow: "rgba(255,230,200,0.18)" });
  if (f.composer) {
    const ly = cy + u * 7.4;
    const size = text(ctx, f.composer, cx, ly, { family: SANS, size: u * 2.1, weight: 600, tracking: 0.48, upper: true, color: accent, p: (t - 0.9) / 1.0, maxWidth: maxW * 0.6, shadow: false });
    setFont(ctx, { family: SANS, size, weight: 600, tracking: 0.48 });
    const tw = ctx.measureText(upperCase(f.composer)).width;
    const p = easeInOut((t - 1.0) / 1.0);
    hairline(ctx, cx - tw / 2 - u * 2, cx - tw / 2 - u * 2 - u * 8 * p, ly, Math.max(1, u * 0.1), accent, 0.8);
    hairline(ctx, cx + tw / 2 + u * 2, cx + tw / 2 + u * 2 + u * 8 * p, ly, Math.max(1, u * 0.1), accent, 0.8);
  }
  text(ctx, f.subtitle, cx, H - Math.max(band, u * 2) / 2 - u * 0.2, { family: SERIF, size: u * 2.6, weight: 400, italic: true, color: "rgba(255,255,255,0.78)", p: (t - 1.3) / 0.9, maxWidth: maxW, rise: 0, shadow: false });
  text(ctx, f.extra, cx, Math.max(band, u * 2) / 2, { family: SANS, size: u * 1.45, weight: 600, tracking: 0.55, upper: true, color: "rgba(255,255,255,0.5)", p: (t - 1.5) / 0.9, maxWidth: maxW, rise: 0, shadow: false });
}

const TEMPLATES = { classic, modern, cinematic };

/**
 * Draws a card frame at local time t (0 … duration) over the whole canvas W×H.
 * @param assets { video?: HTMLVideoElement at the right time, bgMedia?: image for the backdrop, accent }
 */
export function drawCard(ctx, W, H, card, t, duration, assets = {}) {
  // a video + text screen may play them one after the other: draw only the current part
  const ph = cardPhaseAt(card, t);
  const c = { ...card, textEnabled: ph.kind !== "video", videoFile: ph.kind === "text" ? null : card.videoFile };
  drawCardPart(ctx, W, H, c, ph.t, ph.duration, ph.kind === "text" ? { ...assets, video: null } : assets);
}

function drawCardPart(ctx, W, H, card, t, duration, assets) {
  const accent = assets.accent || "#cca700";
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.globalCompositeOperation = "source-over";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (assets.video && card.videoFile) {
    drawVideoFrame(ctx, W, H, assets.video);
    if (card.textEnabled) {
      // readable over any video: soft scrim
      const s = ctx.createLinearGradient(0, 0, 0, H);
      const a = easeOut(t / FADE);
      s.addColorStop(0, `rgba(0,0,0,${0.28 * a})`);
      s.addColorStop(0.5, `rgba(0,0,0,${0.62 * a})`);
      s.addColorStop(1, `rgba(0,0,0,${0.28 * a})`);
      ctx.fillStyle = s;
      ctx.fillRect(0, 0, W, H);
    }
  } else {
    drawBackdrop(ctx, W, H, t, duration, assets.bgMedia || null, accent);
  }

  if (card.textEnabled) {
    const out = duration > 0 ? clamp01((duration - t) / FADE) : 1; // text leaves with the card
    ctx.globalAlpha = out;
    (TEMPLATES[card.template] || classic)(ctx, W, H, card.fields || {}, t, accent);
    ctx.globalAlpha = 1;
  }
  if (!(assets.video && card.videoFile)) drawGrain(ctx, W, H, t);

  // fade from / to black
  const fade = Math.max(0, 1 - Math.min(t / FADE, (duration - t) / FADE, 1));
  if (fade > 0) {
    ctx.fillStyle = `rgba(0,0,0,${fade})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}
