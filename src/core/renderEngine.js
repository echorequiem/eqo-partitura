// renderEngine.js — frame-by-frame video render (WebCodecs) and score-strip image export.
// CRITICAL: drawing uses the same playbackEngine timeline as the preview, so preview and video match exactly.
// CRITICAL: the video is streamed to disk (StreamTarget), never held in memory.

import { Muxer as Mp4Muxer, StreamTarget as Mp4StreamTarget } from "mp4-muxer";
import { Muxer as WebmMuxer, StreamTarget as WebmStreamTarget } from "webm-muxer";
import { pickAudioEncoder, AudioTrackEncoder, audioEndTime, renderAudioTracks, AUDIO_SAMPLE_RATE, AUDIO_CHANNELS } from "./audioEngine.js";
import { PngStreamEncoder } from "./pngEncoder.js";
import { drawCard, ensureCardFonts, cardPhaseAt, cardVideoOffset } from "./titleCards.js";
import { drawInfoOverlay, normalizeInfo, infoValues, infoActive, ensureInfoFont, infoCornerBox, infoReserve, meanLuma } from "./infoOverlay.js";
import { drawKeyboard, keyboardHeight, keyboardRange, scoreShift } from "./keyboardOverlay.js";

/** The card of a list that covers list-local time t. */
const partAt = (list, t) => {
  for (const p of list) if (t < p.start + p.duration) return p;
  return list[list.length - 1] || null;
};
import { drawAmbientFx } from "./ambientFx.js";
import { trillLevel, flowStops } from "./playbackEngine.js";
import { withScoreFont } from "./scoreFont.js";

const WRITE_CHUNK = 8 * 1024 * 1024; // bytes per disk write
const MAX_PENDING_WRITE = 96 * 1024 * 1024; // wait for the disk above this

export class RenderError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "RenderError";
    this.code = code;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const even = (v) => Math.max(2, Math.round(v / 2) * 2);

const BASE_HEIGHTS = { "720p": 720, "1080p": 1080, "2k": 1440, "4k": 2160 };
export const ASPECTS = { "16-9": [16, 9], "9-16": [9, 16], "1-1": [1, 1], "4-3": [4, 3], "4-5": [4, 5] };

/** The short side equals the chosen resolution (720/1080/1440/2160). */
export function getRenderDimensions(aspect, resolution) {
  const short = BASE_HEIGHTS[resolution] || 1080;
  const [aw, ah] = ASPECTS[aspect] || ASPECTS["16-9"];
  if (aw >= ah) return { width: even((short * aw) / ah), height: even(short) };
  return { width: even(short), height: even((short * ah) / aw) };
}

/** H.264 level_idc (hex) for the frame size and macroblocks per second. */
export function avcLevelHex(width, height, fps) {
  const mbs = Math.ceil(width / 16) * Math.ceil(height / 16);
  const mbps = mbs * fps;
  const levels = [
    ["1f", 3600, 108000], ["28", 8192, 245760], ["2a", 8704, 522240], ["32", 22080, 589824],
    ["33", 36864, 983040], ["34", 36864, 2073600], ["3c", 139264, 4177920]
  ];
  for (const [hex, maxFs, maxMbps] of levels) {
    if (mbs <= maxFs && mbps <= maxMbps) return hex;
  }
  return "3e";
}

/** Bitrate from size and fps (or the user's choice in Mbit/s), capped so a file stays below ~8 GB. */
export function chooseBitrate(width, height, fps, durationSec, chosenMbps = 0) {
  let bps = chosenMbps > 0 ? clamp(chosenMbps * 1e6, 1e6, 100e6) : clamp(width * height * fps * 0.09, 4e6, 40e6);
  const maxBytes = 8e9;
  if (durationSec > 0 && (bps * durationSec) / 8 > maxBytes) {
    bps = Math.max(2e6, (maxBytes * 8) / durationSec);
  }
  return Math.round(bps);
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.size === 0) reject(new RenderError("EMPTY_CANVAS", "Canvas returned no data"));
      else resolve(blob);
    }, type, quality);
  });
}

async function loadImage(url) {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  try {
    await img.decode();
  } catch (e) {
    if (!(img.complete && img.naturalWidth > 0)) {
      throw new RenderError("IMAGE_DECODE", "The image could not be decoded");
    }
  }
  return img;
}

/** Loads a (muted, offscreen) video element and waits until its first frame is available. */
function loadVideoElement(url) {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = url;
  return new Promise((resolve, reject) => {
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new RenderError("BG_VIDEO", "A video could not be loaded"));
  });
}

/** Lead-in before the notes (the score settles into place, then the music starts); the lead-out after them is as long. */
export const LEAD_IN_SECONDS = 2.0;

/**
 * Preview (real time): let the video play and only correct it when it drifts; paused / seeked = exact frame.
 * The render never uses this (it seeks frame by frame).
 */
async function syncVideoRealtime(f, v, vt) {
  if (f.activeVideos) f.activeVideos.add(v);
  if (!f.playing) {
    if (!v.paused) v.pause();
    if (Math.abs(v.currentTime - vt) > 0.04) await seekVideo(v, vt);
    return;
  }
  if (v.paused) {
    v.currentTime = vt;
    v.play().catch(() => {});
  } else if (Math.abs(v.currentTime - vt) > 0.3) {
    v.currentTime = vt;
  }
}

function seekVideo(video, time) {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - time) < 1e-3) return resolve();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener("seeked", finish);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, 4000); // never hang
    video.addEventListener("seeked", finish);
    video.currentTime = time;
  });
}

// ---------------------------------------------------------------------------------------------
// ScoreRaster: rasterises the SVG strip in tiles, on demand.
// CRITICAL: one big canvas fails silently above ~16k px, hence tiles.
//   "base" = the score; "notes" / "beam" / "expr" = highlight layers, tinted with the glow colour.
// ---------------------------------------------------------------------------------------------
/** Highlight layers (rect.layer values from timelineBuilder). */
export const HIGHLIGHT_LAYERS = ["notes", "beam", "expr"];

export class ScoreRaster {
  /**
   * @param opts.markGroups { notes, beam, expr }: elements of each highlight layer.
   *   CRITICAL: separate layers — a beam's wide box must not light the stems of other notes under it.
   */
  static async create(opts) {
    const r = new ScoreRaster(opts);
    const groups = opts.markGroups || (opts.markEls ? { notes: opts.markEls } : {});
    await r._init(opts.svgEl, groups, !!opts.withNotes);
    return r;
  }

  constructor({ svgW, svgH, scale, isDark, activeColor }) {
    this.svgW = svgW;
    this.svgH = svgH;
    this.k = scale;
    this.isDark = !!isDark;
    this.activeColor = activeColor || "#FF0000";
    this.hOut = Math.max(1, Math.ceil(svgH * scale));
    if (this.hOut > 16000) throw new RenderError("TOO_TALL", "Score is too tall to rasterize");
    this.T = clamp(Math.floor(6e6 / this.hOut), 512, 4096); // tile width (output px)
    this.M = 2; // tile overlap (no seams)
    this.tileCount = Math.max(1, Math.ceil((svgW * scale) / this.T));
    this.caches = { base: new Map() };
    this.maxTiles = 6;
    this.urls = [];
    this.images = { base: null };
    this.hasNotes = false;
  }

  async _init(svgEl, groups, withNotes) {
    const tagged = [];
    for (const layer of HIGHLIGHT_LAYERS) {
      for (const el of groups[layer] || []) {
        el.classList.add(`echo-mark-${layer}`);
        tagged.push([el, layer]);
      }
    }
    let text;
    try {
      const clone = svgEl.cloneNode(true);
      clone.setAttribute("width", String(this.svgW));
      clone.setAttribute("height", String(this.svgH));
      clone.removeAttribute("style");
      text = new XMLSerializer().serializeToString(clone);
    } finally {
      tagged.forEach(([el, layer]) => el.classList.remove(`echo-mark-${layer}`));
    }

    text = await withScoreFont(text); // CRITICAL: an SVG image can't see page fonts
    this.images.base = await this._toImage(text);

    if (withNotes) {
      for (const layer of HIGHLIGHT_LAYERS) {
        if (!(groups[layer] || []).length) continue;
        // keep only this layer's marked elements visible
        const cls = `.echo-mark-${layer}`;
        // clipPath shapes stay visible (a hidden one clips everything away — e.g. the beam parts)
        const css = `svg *{visibility:hidden !important}${cls},${cls} *,clipPath,clipPath *{visibility:visible !important}`;
        const layerText = text.replace(/<svg\b[^>]*>/, (m) => m + "<style>" + css + "</style>");
        this.images[layer] = await this._toImage(layerText);
        this.hasNotes = true;
      }
    }
  }

  hasLayer(layer) {
    return !!this.images[layer];
  }

  /** Draws the output-space rectangle (xOut, yOut, wOut, hOut) of the base score into ctx at (0, 0). */
  drawBaseRect(ctx, xOut, yOut, wOut, hOut) {
    const k = this.k;
    const img = this.images.base;
    if (!img) return;
    const sx0 = Math.max(0, xOut / k);
    const sy0 = Math.max(0, yOut / k);
    const sx1 = Math.min(this.svgW, (xOut + wOut) / k);
    const sy1 = Math.min(this.svgH, (yOut + hOut) / k);
    if (sx1 <= sx0 || sy1 <= sy0) return;
    if (this.isDark) ctx.filter = "invert(1) hue-rotate(180deg)";
    ctx.drawImage(img, sx0, sy0, sx1 - sx0, sy1 - sy0, sx0 * k - xOut, sy0 * k - yOut, (sx1 - sx0) * k, (sy1 - sy0) * k);
    ctx.filter = "none";
  }

  async _toImage(svgText) {
    const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }));
    this.urls.push(url);
    return loadImage(url);
  }

  /** Paints output-space x range [xOutStart, xOutStart + wOut) on a transparent canvas; highlight layers in `color`. */
  paintRegion(layer, xOutStart, wOut, color = this.activeColor) {
    const k = this.k;
    const img = this.images[layer] || null;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(wOut));
    canvas.height = this.hOut;
    const ctx = canvas.getContext("2d");

    const srcX0 = xOutStart / k;
    const srcX1 = (xOutStart + wOut) / k;
    const sx0 = Math.max(0, srcX0);
    const sx1 = Math.min(this.svgW, srcX1);
    if (sx1 > sx0 && img) {
      const dx = (sx0 - srcX0) * k;
      const dw = (sx1 - sx0) * k;
      if (layer === "base" && this.isDark) ctx.filter = "invert(1) hue-rotate(180deg)";
      ctx.drawImage(img, sx0, 0, sx1 - sx0, this.svgH, dx, 0, dw, this.svgH * k);
      ctx.filter = "none";
      if (layer !== "base") {
        // tint black glyphs with the glow colour (alpha kept)
        ctx.globalCompositeOperation = "source-in";
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = "source-over";
      }
    }
    return canvas;
  }

  _getTile(layer, i, color) {
    const key = layer === "base" ? "base" : `${layer}|${color}`;
    const cache = this.caches[key] || (this.caches[key] = new Map());
    let tile = cache.get(i);
    if (tile) {
      cache.delete(i); // LRU
      cache.set(i, tile);
      return tile;
    }
    tile = this.paintRegion(layer, i * this.T - this.M, this.T + 2 * this.M, color);
    cache.set(i, tile);
    while (cache.size > this.maxTiles) {
      const oldestKey = cache.keys().next().value;
      const old = cache.get(oldestKey);
      if (old) old.width = 0; // free memory now
      cache.delete(oldestKey);
    }
    return tile;
  }

  /** Draws the visible tiles; scrollOut = x of the view's left edge in output space. */
  draw(ctx, layer, scrollOut, destY, viewW, color = this.activeColor) {
    const T = this.T;
    const M = this.M;
    const first = Math.max(0, Math.floor((scrollOut - M) / T));
    const last = Math.min(this.tileCount - 1, Math.floor((scrollOut + viewW + M) / T));
    for (let i = first; i <= last; i++) {
      ctx.drawImage(this._getTile(layer, i, color), i * T - M - scrollOut, destY);
    }
  }

  dispose() {
    for (const cache of Object.values(this.caches)) {
      cache.forEach((c) => { c.width = 0; });
      cache.clear();
    }
    this.urls.forEach((u) => URL.revokeObjectURL(u));
    this.urls = [];
    this.images = { base: null };
  }
}

// ---------------------------------------------------------------------------------------------
// Encoder selection
// ---------------------------------------------------------------------------------------------
/**
 * How many software encoders to run side by side. Measured on a real 1080p60 render on 4 cores:
 * 1 lane 65.7 s, 2 lanes 48.7 s, 3 lanes 60.2 s (drawing, GPU process and audio need cores too) → half the cores.
 */
export function softwareLanes(cores = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4) {
  if (typeof globalThis.__ECHO_LANES === "number") return clamp(globalThis.__ECHO_LANES, 1, 8); // profiling override
  return clamp(Math.floor(cores / 2), 1, 4);
}

/**
 * Supported encoder configurations, best first. For each codec a GPU encoder is preferred when the system
 * exposes one (fast, one lane); otherwise the software encoder runs in parallel lanes (see _encodeWith).
 * @param allowLanes false when lanes can't be used (e.g. a background video must be decoded in order)
 */
async function listEncoderCandidates(format, { width, height, fps, bitrate }, { allowLanes = true } = {}) {
  const raw = await listCodecCandidates(format, { width, height, fps, bitrate });
  const out = [];
  for (const cand of raw) {
    const hwConfig = { ...cand.config, hardwareAcceleration: "prefer-hardware" };
    let hw = false;
    try { hw = !!(await VideoEncoder.isConfigSupported(hwConfig)).supported; } catch (_) { hw = false; }
    if (hw) out.push({ ...cand, config: hwConfig, lanes: 1, hardware: true });
    const lanes = allowLanes ? softwareLanes() : 1;
    out.push({ ...cand, lanes, hardware: false });
    if (lanes > 1) out.push({ ...cand, lanes: 1, hardware: false }); // safety net: same codec, single encoder
  }
  return out;
}

async function listCodecCandidates(format, { width, height, fps, bitrate }) {
  const list = [];
  if (format === "mp4") {
    const level = avcLevelHex(width, height, fps);
    for (const profile of ["64", "4d", "42"]) { // High, Main, Baseline
      list.push({
        container: "mp4",
        config: {
          codec: `avc1.${profile}00${level}`, width, height, bitrate, framerate: fps,
          latencyMode: "quality", avc: { format: "avc" }
        }
      });
    }
  }
  for (const codec of ["vp09.00.10.08", "vp09.00.41.08"]) {
    list.push({ container: "webm", config: { codec, width, height, bitrate, framerate: fps, latencyMode: "quality" } });
  }

  const supported = [];
  for (const cand of list) {
    try {
      const res = await VideoEncoder.isConfigSupported(cand.config);
      if (res && res.supported) supported.push(cand);
    } catch (_) { /* desteklenmiyor say */ }
  }
  return supported;
}

// ---------------------------------------------------------------------------------------------
// RenderEngine
// ---------------------------------------------------------------------------------------------
export class RenderEngine {
  /**
   * @param playbackEngine  timeline (timedSteps, timedItems, getStateAtTime)
   * @param appState        app state (theme, colours, background, playhead …)
   * @param getLayout       () => preview measurements. CRITICAL: measured on page 3 while it is visible.
   * @param osmdContainer   element holding the OSMD <svg>
   */
  constructor({ playbackEngine, appState, getLayout, osmdContainer }) {
    this.playbackEngine = playbackEngine;
    this.appState = appState;
    this.getLayout = getLayout;
    this.osmdContainer = osmdContainer;
    this._cancel = false;
  }

  cancel() {
    this._cancel = true;
    this._paused = false;
  }

  /** Pause / resume a running render. While paused the loop just waits: no drawing, no encoding, no CPU load. */
  pause() {
    this._paused = true;
  }

  resume() {
    this._paused = false;
  }

  get paused() {
    return !!this._paused;
  }

  async _waitWhilePaused() {
    while (this._paused && !this._cancel) await sleep(150);
    if (this._cancel) throw new RenderError("CANCELLED");
  }

  // ---- Background ----------------------------------------------------------------------------
  async _prepareBackground() {
    const s = this.appState.bgSettings || {};
    const bg = { settings: s, media: null, video: null, lastSeek: null };
    if (!s.url || !s.type) return bg;

    if (s.type === "image") {
      bg.media = await loadImage(s.url);
    } else if (s.type === "video") {
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      v.src = s.url;
      await new Promise((resolve, reject) => {
        v.onloadeddata = resolve;
        v.onerror = () => reject(new RenderError("BG_VIDEO", "The background video could not be loaded"));
      });
      bg.media = v;
      bg.video = v;
    }
    return bg;
  }

  async _drawBackground(f, t) {
    const bg = f.bg;
    if (!bg.media) return;
    const s = bg.settings;

    if (bg.video) {
      const v = bg.video;
      const dur = v.duration;
      if (Number.isFinite(dur) && dur > 0) {
        let vt = s.loop !== false ? t % dur : Math.min(t, Math.max(0, dur - 0.04));
        const q = 1 / Math.min(f.fps, 30); // source videos assumed ≤ ~30 fps
        vt = Math.floor(vt / q) * q;
        if (f.realtime) {
          v.loop = s.loop !== false;
          await syncVideoRealtime(f, v, vt);
        } else if (bg.lastSeek === null || Math.abs(vt - bg.lastSeek) > 1e-4) {
          await seekVideo(v, vt);
          bg.lastSeek = vt;
        }
      }
    }

    const nw = bg.media.videoWidth || bg.media.naturalWidth;
    const nh = bg.media.videoHeight || bg.media.naturalHeight;
    if (!nw || !nh) return;

    // same as the preview CSS: object-fit: contain, then translate(%) + scale
    const fit = Math.min(f.W / nw, f.H / nh);
    const sc = (s.scale ?? 100) / 100;
    const dw = nw * fit * sc;
    const dh = nh * fit * sc;
    const cx = f.W / 2 + ((s.posX ?? 0) / 100) * f.W;
    const cy = f.H / 2 + ((s.posY ?? 0) / 100) * f.H;

    const ctx = f.ctx;
    ctx.save();
    ctx.globalAlpha = clamp((s.opacity ?? 50) / 100, 0, 1);
    if (s.grayscale) ctx.filter = "grayscale(100%)";
    ctx.drawImage(bg.media, cx - dw / 2, cy - dh / 2, dw, dh);
    ctx.restore();
  }

  // ---- Frame drawing ---------------------------------------------------------------------------
  /** Whole video timeline: [intro screens] → [lead-in] → [notes] → [outro screens]. */
  async _drawFrame(f, t) {
    const sec = f.sections;
    if (t < sec.introDuration) return this._drawCardFrame(f, partAt(sec.intro, t), t);
    const tl = t - sec.introDuration; // time since the end of the intro
    const lead = sec.leadIn || 0;
    if (tl < lead) return this._drawLeadIn(f, tl);
    const tm = tl - lead;
    const out = sec.leadOut || 0;
    if (tm >= sec.mainDuration + out) {
      const to = tm - sec.mainDuration - out;
      return this._drawCardFrame(f, partAt(sec.outro, to), to);
    }
    if (tm >= sec.mainDuration) return this._drawLeadOut(f, tm - sec.mainDuration, tl);
    return this._drawMain(f, tm, tl); // background / atmosphere keep running through the lead-in / lead-out
  }

  /**
   * Lead-in (LEAD_IN_SECONDS): the score fades up from black and its columns rise into place from left to
   * right, then the playhead appears — the music starts only after it.
   */
  async _drawLeadIn(f, t) {
    const { ctx, W, H } = f;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.filter = "none";
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = f.bgColor;
    ctx.fillRect(0, 0, W, H);
    await this._drawBackground(f, t);
    if (f.fx) drawAmbientFx(ctx, W, H, t, f.fx);

    // the score as it stands at the first note, drawn once
    if (!f.leadCache) {
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const st0 = this.playbackEngine.getStateAtTime(0);
      f.raster.draw(c.getContext("2d"), "base", st0.x * f.k - W / 2, f.svgTop, W);
      f.leadCache = c;
    }
    const cols = 48;
    const cw = W / cols;
    const rise = 0.035 * H;
    for (let i = 0; i < cols; i++) {
      const delay = 0.25 + (i / cols) * 0.85; // a wave from left to right
      const p = clamp((t - delay) / 0.6, 0, 1);
      if (p <= 0) continue;
      const e = 1 - Math.pow(1 - p, 3);
      const sx = Math.floor(i * cw);
      const sw = Math.ceil((i + 1) * cw) - sx;
      ctx.globalAlpha = e;
      ctx.drawImage(f.leadCache, sx, 0, sw, H, sx, (1 - e) * rise, sw, H);
    }
    ctx.globalAlpha = 1;

    if (f.showPlayhead) {
      const a = clamp((t - (LEAD_IN_SECONDS - 0.55)) / 0.4, 0, 1);
      if (a > 0) {
        ctx.globalAlpha = a;
        ctx.fillStyle = f.accent;
        const h = H * (1 - Math.pow(1 - a, 3)); // grows from the centre
        ctx.fillRect(Math.round(W / 2), (H - h) / 2, f.playheadW, h);
        ctx.globalAlpha = 1;
      }
    }
    if (f.keyboard) {
      const ka = clamp((t - 0.3) / 0.8, 0, 1);
      if (ka > 0) drawKeyboard(ctx, W, H, null, f.keyboard.range, f.colors, ka * ka * (3 - 2 * ka));
    }
    // soft entrance from black (screens end in black)
    const fade = clamp(1 - t / 0.45, 0, 1);
    if (fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${fade})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  async _drawCardFrame(f, part, tListStart) {
    if (!part) return;
    const tl = tListStart - part.start; // local time inside this card
    const videoTime = cardPhaseAt(part.card, tl).videoTime; // null while only the text is shown
    if (part.video && videoTime !== null) {
      const v = part.video;
      const q = 1 / Math.min(f.fps, 60);
      const vt = Math.min(Math.max(0, v.duration - 0.03), Math.floor(videoTime / q) * q);
      if (f.realtime) await syncVideoRealtime(f, v, vt);
      else if (part.lastSeek === null || Math.abs(vt - part.lastSeek) > 1e-4) {
        await seekVideo(v, vt);
        part.lastSeek = vt;
      }
    }
    drawCard(f.ctx, f.W, f.H, part.card, tl, part.duration, {
      video: part.video,
      bgMedia: f.bg && f.bg.media && !f.bg.video ? f.bg.media : null,
      accent: f.activeColor
    });
    if (f.fx && (!part.video || videoTime === null)) drawAmbientFx(f.ctx, f.W, f.H, tl, f.fx);
  }

  /**
   * Lead-out (same length as the lead-in): the playhead shrinks away, then the score is wiped from left to
   * right — each column lifts and fades — and the frame goes to black before the outro screens.
   * @param tb background / atmosphere time (continues from the notes)
   */
  async _drawLeadOut(f, t, tb) {
    const { ctx, W, H } = f;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.filter = "none";
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = f.bgColor;
    ctx.fillRect(0, 0, W, H);
    await this._drawBackground(f, tb);
    if (f.fx) drawAmbientFx(ctx, W, H, tb, f.fx);

    // the score as it stands after the last note (no glow), drawn once
    if (!f.leadOutCache) {
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const pb = this.playbackEngine;
      const stEnd = pb.getStateAtTime(pb.totalDuration);
      f.raster.draw(c.getContext("2d"), "base", stEnd.x * f.k - W / 2, f.svgTop, W);
      f.leadOutCache = c;
    }
    const D = f.sections.leadOut;
    const cols = 48;
    const cw = W / cols;
    const lift = 0.035 * H;
    for (let i = 0; i < cols; i++) {
      const delay = 0.3 + (i / cols) * 0.75; // a wave from left to right
      const p = clamp((t - delay) / 0.5, 0, 1);
      if (p >= 1) continue;
      const e = p * p * (3 - 2 * p);
      const sx = Math.floor(i * cw);
      const sw = Math.ceil((i + 1) * cw) - sx;
      ctx.globalAlpha = 1 - e;
      ctx.drawImage(f.leadOutCache, sx, 0, sw, H, sx, -e * lift, sw, H);
    }
    ctx.globalAlpha = 1;

    if (f.showPlayhead) {
      const a = 1 - clamp(t / 0.35, 0, 1); // shrinks towards the centre first
      if (a > 0) {
        ctx.globalAlpha = a;
        ctx.fillStyle = f.accent;
        const h = H * a;
        ctx.fillRect(Math.round(W / 2), (H - h) / 2, f.playheadW, h);
        ctx.globalAlpha = 1;
      }
    }
    if (f.keyboard) {
      const ka = 1 - clamp(t / 0.8, 0, 1);
      if (ka > 0) drawKeyboard(ctx, W, H, null, f.keyboard.range, f.colors, ka * ka * (3 - 2 * ka));
    }
    // to black at the end (screens start from black)
    const fade = clamp((t - (D - 0.45)) / 0.45, 0, 1);
    if (fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${fade})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  /** @param t notes time; tb background / atmosphere time (continues from the lead-in) */
  async _drawMain(f, t, tb = t) {
    const { ctx, W, H } = f;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.filter = "none";
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = f.bgColor;
    ctx.fillRect(0, 0, W, H);

    await this._drawBackground(f, tb);
    if (f.fx) drawAmbientFx(ctx, W, H, tb, f.fx); // over the background, under the notes

    const st = this.playbackEngine.getStateAtTime(t);
    const scrollOut = st.x * f.k - W / 2; // active position exactly under the playhead
    f.raster.draw(ctx, "base", scrollOut, f.svgTop, W);

    if (f.raster.hasNotes) {
      const active = this.playbackEngine.getActiveItemsAt(t); // every note/rest/slur… for its own duration
      for (const slot of [0, 1]) {
        const rects = [];
        const animated = [];
        for (const it of active) {
          if ((it.slot === 1 ? 1 : 0) !== slot) continue;
          if (it.fx) animated.push(it);
          else rects.push(...it.rects);
        }
        const color = f.colors[slot];
        if (rects.length) this._drawHighlight(f, rects, scrollOut, color);
        // same shimmer / flow as the preview (playbackEngine.trillLevel / flowStops)
        for (const it of animated) {
          if (it.fx === "trill") this._drawHighlight(f, it.rects, scrollOut, color, { alpha: trillLevel(it, t) });
          else this._drawHighlight(f, it.rects, scrollOut, color, { flow: flowStops(it, st.x, t) });
        }
      }
    }

    if (f.showPlayhead) {
      ctx.fillStyle = f.accent;
      ctx.fillRect(Math.round(W / 2), 0, f.playheadW, H);
    }
    // live tempo / notes played in a corner (optional, page 3)
    // piano keyboard along the bottom (optional, page 3)
    const kbH = f.keyboard ? keyboardHeight(W, H) : 0;
    if (f.keyboard) drawKeyboard(ctx, W, H, this.playbackEngine.keysAt(t), f.keyboard.range, f.colors);
    if (f.info) {
      const pb = this.playbackEngine;
      // dark type on a light picture: how light the corner is, measured twice a second (with some hysteresis)
      const bucket = Math.floor(t * 2);
      if (f.infoToneBucket !== bucket) {
        f.infoToneBucket = bucket;
        const b = infoCornerBox(W, H - kbH, f.info.corner);
        try {
          if (!f.toneCtx) { const tc = document.createElement("canvas"); tc.width = 32; tc.height = 16; f.toneCtx = tc.getContext("2d", { willReadFrequently: true }); }
          f.toneCtx.drawImage(f.canvas, b.x, b.y, b.w, b.h, 0, 0, 32, 16); // a small copy: a cheap read
          const l = meanLuma(f.toneCtx.getImageData(0, 0, 32, 16).data);
          f.infoTone = f.infoTone === "dark" ? (l < 0.45 ? "light" : "dark") : (l > 0.55 ? "dark" : "light");
        } catch (_) { /* keep the last tone */ }
      }
      drawInfoOverlay(ctx, W, H - kbH, f.info, infoValues(pb, t), f.infoLabels, f.infoTone || "light");
    }
  }

  /** Draws the lit items in the glow colour with a soft glow (video counterpart of .note-active). */
  _drawHighlight(f, allRects, scrollOut, color, { alpha = 1, flow = null } = {}) {
    const { ctx, tmp, tmpCtx, k, W, H } = f;
    const blur = Math.max(2, 6 * k);

    // on-screen boxes in output space + their union
    const boxes = [];
    const rects = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of allRects) {
      const x = r.x * k - scrollOut;
      const y = f.svgTop + r.y * k;
      const w = r.w * k;
      const h = r.h * k;
      if (x > W || x + w < 0) continue; // off-screen (e.g. the far end of a long pedal or slur)
      rects.push(r);
      boxes.push([x, y, w, h]);
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
    }
    const pad = Math.ceil(blur * 2);
    const rx0 = Math.max(0, Math.floor(minX - pad));
    const ry0 = Math.max(0, Math.floor(minY - pad));
    const rx1 = Math.min(W, Math.ceil(maxX + pad));
    const ry1 = Math.min(H, Math.ceil(maxY + pad));
    const rw = rx1 - rx0;
    const rh = ry1 - ry0;
    if (rw <= 0 || rh <= 0) return;

    // 1) per layer, only the inside of that layer's lit boxes
    tmpCtx.clearRect(rx0, ry0, rw, rh);
    for (const layer of HIGHLIGHT_LAYERS) {
      if (!f.raster.hasLayer(layer)) continue;
      const own = boxes.filter((b, i) => (rects[i].layer || "notes") === layer);
      if (own.length === 0) continue;
      tmpCtx.save();
      tmpCtx.beginPath();
      for (const [x, y, w, h] of own) tmpCtx.rect(x, y, w, h);
      tmpCtx.clip();
      f.raster.draw(tmpCtx, layer, scrollOut, f.svgTop, W, color);
      tmpCtx.restore();
    }

    // 1b) slur / tie flow: keep the lit part (left of the front, with ripples) and brighten the crest
    if (flow) {
      const gx0 = flow.x0 * k - scrollOut;
      const gw = flow.w * k;
      const mask = tmpCtx.createLinearGradient(gx0, 0, gx0 + gw, 0);
      for (const [o, level] of flow.stops) mask.addColorStop(clamp(o, 0, 1), `rgba(0,0,0,${level})`);
      tmpCtx.save();
      tmpCtx.globalCompositeOperation = "destination-in";
      tmpCtx.fillStyle = mask;
      tmpCtx.fillRect(rx0, ry0, rw, rh);
      if (flow.crest >= 0) {
        const cx = gx0 + flow.crest * gw;
        const cw = Math.max(8 * k, gw * 0.06);
        const shine = tmpCtx.createLinearGradient(cx - cw, 0, cx + cw, 0);
        shine.addColorStop(0, "rgba(255,255,255,0)");
        shine.addColorStop(0.5, "rgba(255,255,255,0.45)");
        shine.addColorStop(1, "rgba(255,255,255,0)");
        tmpCtx.globalCompositeOperation = "source-atop";
        tmpCtx.fillStyle = shine;
        tmpCtx.fillRect(cx - cw, ry0, cw * 2, rh);
      }
      tmpCtx.restore();
    }

    // 2) onto the frame with the glow (shadow)
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.drawImage(tmp, rx0, ry0, rw, rh, rx0, ry0, rw, rh);
    ctx.restore();
  }

  // ---- Encoding ------------------------------------------------------------------------------
  async _encodeWith(cand, f, { fps, totalFrames, duration, videoDuration }, emit, sink, audio) {
    const isMp4 = cand.container === "mp4";
    const onData = (data, position) => sink.write(data, position);
    const target = isMp4
      ? new Mp4StreamTarget({ onData, chunked: true, chunkSize: WRITE_CHUNK })
      : new WebmStreamTarget({ onData, chunked: true, chunkSize: WRITE_CHUNK });
    const audioOpt = audio ? { codec: audio.cand.muxCodec, numberOfChannels: AUDIO_CHANNELS, sampleRate: AUDIO_SAMPLE_RATE } : undefined;
    const muxer = isMp4
      ? new Mp4Muxer({
          target,
          video: { codec: "avc", width: f.W, height: f.H, frameRate: fps },
          ...(audioOpt ? { audio: audioOpt } : {}),
          fastStart: false // CRITICAL: moov at the end, required for streaming to disk
        })
      : new WebmMuxer({
          target,
          video: { codec: "V_VP9", width: f.W, height: f.H, frameRate: fps },
          ...(audioOpt ? { audio: audioOpt } : {})
        });

    let encError = null;

    // Parallel "lanes": GOP g (2 s, starts with a keyframe) goes to encoder g % L; a reorder buffer feeds the muxer.
    // CRITICAL: GOPs must reach the muxer strictly in order (flushGops). Same settings → same quality.
    const keyEvery = Math.max(1, Math.round(fps * 2));
    const gopCount = Math.ceil(totalFrames / keyEvery);
    const lanes = Math.max(1, Math.min(cand.lanes || 1, gopCount));
    const gopSize = (g) => Math.min(keyEvery, totalFrames - g * keyEvery);
    const pendingGops = new Map(); // gop index -> [[chunk, meta], ...]
    let nextGop = 0;
    const flushGops = () => {
      while (pendingGops.has(nextGop) && pendingGops.get(nextGop).length === gopSize(nextGop)) {
        for (const [chunk, meta] of pendingGops.get(nextGop)) muxer.addVideoChunk(chunk, meta);
        pendingGops.delete(nextGop);
        nextGop++;
      }
    };
    const onVideoChunk = (chunk, meta) => {
      try {
        const g = Math.floor(Math.round((chunk.timestamp * fps) / 1e6) / keyEvery);
        if (!pendingGops.has(g)) pendingGops.set(g, []);
        pendingGops.get(g).push([chunk, meta]);
        flushGops();
      } catch (e) { encError = encError || e; }
    };
    const encoders = [];
    for (let p = 0; p < lanes; p++) {
      encoders.push(new VideoEncoder({ output: onVideoChunk, error: (e) => { encError = encError || e; } }));
    }
    // Keep the frames waiting in the encoders' queues below ~400 MB in total (4K frames are ~33 MB each)
    const maxQueue = clamp(Math.floor(4e8 / (f.W * f.H * 4 * lanes)), 2, 8);

    let audioEnc = null;
    if (audio) {
      audioEnc = new AudioTrackEncoder(audio.mix, audio.cand, (chunk, meta) => {
        try { muxer.addAudioChunk(chunk, meta); } catch (e) { encError = encError || e; }
      });
    }
    const checkAudio = () => { if (audioEnc && audioEnc.error) encError = encError || audioEnc.error; };

    const fail = () => {
      const err = new RenderError("ENCODER_FAILED", encError && encError.message ? encError.message : String(encError));
      err.retryable = true;
      return err;
    };

    f.bg.lastSeek = null;
    f.raster.caches.base.clear();
    // lanes draw at `lanes` different places of the strip; each place needs ~2 tiles per layer/colour cache
    f.raster.maxTiles = 3 * lanes;

    try {
      for (const enc of encoders) enc.configure(cand.config);

      const frameDur = Math.round(1e6 / fps);
      let lastEmit = 0;
      let framesDone = 0;
      let maxFed = -1;
      // Timing breakdown (ms) — returned with the result, handy for profiling: drawing vs. encoder back-pressure
      const stats = { start: performance.now(), draw: 0, submit: 0, wait: 0, total: 0, frames: totalFrames, lanes };

      // Feed order: batches of `lanes` GOPs; inside a batch, frame j of every GOP in turn (keeps all lanes busy).
      for (let batch = 0; batch * lanes < gopCount; batch++) {
        for (let j = 0; j < keyEvery; j++) {
          for (let p = 0; p < lanes; p++) {
            const g = batch * lanes + p;
            const i = g * keyEvery + j;
            if (g >= gopCount || i >= totalFrames) continue;

            if (this._cancel) throw new RenderError("CANCELLED");
            if (this._paused) await this._waitWhilePaused();
            checkAudio();
            if (encError) throw fail();

            const t = i / fps;
            if (i > maxFed) {
              maxFed = i;
              if (audioEnc) audioEnc.encodeUntil((i + 1) / fps); // audio advances with the video
            }
            let p0 = performance.now();
            await this._drawFrame(f, t);
            let p1 = performance.now();
            stats.draw += p1 - p0;

            const frame = new VideoFrame(f.canvas, { timestamp: Math.round((i * 1e6) / fps), duration: frameDur });
            try {
              encoders[p].encode(frame, { keyFrame: j === 0 });
            } finally {
              frame.close();
            }
            p0 = performance.now();
            stats.submit += p0 - p1;
            framesDone++;

            // back-pressure: encoder queues and pending disk writes
            while (encoders[p].encodeQueueSize > maxQueue || (audioEnc && audioEnc.encoder.encodeQueueSize > 64)) {
              await sleep(1);
              if (this._cancel) throw new RenderError("CANCELLED");
              checkAudio();
              if (encError) throw fail();
            }
            if (sink.pendingBytes > MAX_PENDING_WRITE) await sink.flush();
            stats.wait += performance.now() - p0;

            const now = performance.now();
            if (now - lastEmit > 150 || framesDone === totalFrames) {
              lastEmit = now;
              emit({
                phase: "encode",
                frame: framesDone,
                total: totalFrames,
                pct: Math.min(99, Math.floor((framesDone / totalFrames) * 100)),
                time: Math.min((framesDone / totalFrames) * videoDuration, videoDuration),
                duration: videoDuration
              });
              await sleep(0); // let the UI breathe
            }
          }
        }
      }

      emit({ phase: "finalize", pct: 99 });
      await Promise.all(encoders.map((enc) => enc.flush()));
      if (audioEnc) await audioEnc.finish();
      checkAudio();
      if (encError) throw fail();
      flushGops();
      if (nextGop !== gopCount) {
        const e = new RenderError("ENCODER_FAILED", `GOP reorder incomplete (${nextGop}/${gopCount})`);
        e.retryable = true;
        throw e;
      }
      muxer.finalize();
      await sink.flush();
      stats.total = performance.now() - stats.start;
      for (const k of Object.keys(stats)) stats[k] = Math.round(stats[k]);
      return { container: cand.container, stats };
    } catch (err) {
      if (err instanceof RenderError) throw err;
      const wrapped = new RenderError("ENCODER_FAILED", err && err.message ? err.message : String(err));
      wrapped.retryable = true;
      throw wrapped;
    } finally {
      for (const enc of encoders) {
        try { if (enc.state !== "closed") enc.close(); } catch (_) { /* yoksay */ }
      }
      if (audioEnc) audioEnc.close();
    }
  }

  // ---- Entry point: video render ---------------------------------------------------------------
  /**
   * @param openSink  (defaultName, ext) => Promise<sink|null>, see platform/output.js
   * @param audio     { buffer: AudioBuffer, offset, volume, extendToAudio } | null
   * @param cards     { intro: CardPart[], outro: CardPart[] } — CardPart = { card, duration, url?, audioBuffer? }
   * @param fx        { fog, embers } levels 0…1 — atmosphere over the background
   */
  /**
   * Everything a frame needs (score raster, background, intro / outro screens, sections, audio mix), shared by
   * the render and the page-4 preview — CRITICAL: one code path, so the preview shows exactly the video.
   * @param realtime  preview: videos play instead of being seeked frame by frame
   */
  async _buildFrameContext({ width, height, fps, audio = null, cards = null, fx = null, leadIn = true, realtime = false }) {
    const pb = this.playbackEngine;
    const steps = pb.timedSteps || [];
    if (steps.length === 0 || !(pb.totalDuration > 0)) throw new RenderError("NO_NOTES");
    const layout = this.getLayout ? this.getLayout() : null;
    if (!layout || !(layout.viewportW > 0) || !(layout.viewportH > 0) || !(layout.svgW > 0) || !(layout.svgH > 0)) {
      throw new RenderError("NO_LAYOUT");
    }
    const svgEl = this.osmdContainer.querySelector("svg");
    if (!svgEl) throw new RenderError("NO_NOTES");

    const W = even(width);
    const H = even(height);
    const TAIL_SECONDS = 1; // short pause after the last note
    const duration = pb.totalDuration;
    // Main part (notes): never shorter than the music — the video follows the music, not the other way round
    let mainDuration = duration + TAIL_SECONDS;
    if (audio && audio.buffer && audio.extendToAudio !== false) {
      mainDuration = Math.max(mainDuration, audioEndTime(audio.buffer, audio.offset || 0));
    }
    const leadDur = leadIn ? LEAD_IN_SECONDS : 0; // notes take their places before the music starts
    // intro / outro: lists of cards played in order (each part gets its start time inside its list)
    const toParts = (list) => {
      let start = 0;
      return (list || []).filter((p) => p && p.duration > 0).map((p) => {
        const part = { ...p, start, video: null, lastSeek: null };
        start += p.duration;
        return part;
      });
    };
    const intro = toParts(cards && cards.intro);
    const outro = toParts(cards && cards.outro);
    const introDur = intro.reduce((s, p) => s + p.duration, 0);
    const outroDur = outro.reduce((s, p) => s + p.duration, 0);
    const totalDuration = introDur + leadDur + mainDuration + leadDur + outroDur; // lead-in … lead-out
    await ensureCardFonts();

    const isDark = this.appState.animTheme === "dark";
    const activeColor = this.appState.activeColor || "#FF0000";
    const k = Math.min(W / layout.viewportW, H / layout.viewportH); // exact scale of the preview

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { alpha: false });
    const tmp = document.createElement("canvas");
    tmp.width = W;
    tmp.height = H;
    const tmpCtx = tmp.getContext("2d");

    let raster = null;
    let bg = null;
    const dispose = () => {
      if (raster) raster.dispose();
      for (const v of [bg && bg.video, ...intro.map((p) => p.video), ...outro.map((p) => p.video)]) {
        if (!v) continue;
        v.pause();
        v.removeAttribute("src");
        try { v.load(); } catch (_) { /* ignore */ }
      }
      canvas.width = 0;
      tmp.width = 0;
    };
    try {
      const markGroups = { notes: new Set(), beam: new Set(), expr: new Set() };
      const glowItems = pb.timedItems && pb.timedItems.length ? pb.timedItems : steps;
      for (const s of glowItems) {
        (s.elements || []).forEach((el, i) => {
          const layer = (s.rects && s.rects[i] && s.rects[i].layer) || "notes";
          (markGroups[layer] || markGroups.notes).add(el);
        });
      }
      raster = await ScoreRaster.create({
        svgEl,
        markGroups: { notes: [...markGroups.notes], beam: [...markGroups.beam], expr: [...markGroups.expr] },
        svgW: layout.svgW, svgH: layout.svgH, scale: k, isDark, activeColor, withNotes: true
      });
      if (this._cancel) throw new RenderError("CANCELLED");

      if (infoActive(this.appState.info)) await ensureInfoFont(); // canvas text needs the face loaded
      bg = await this._prepareBackground();
      if (this._cancel) throw new RenderError("CANCELLED");
      for (const part of [...intro, ...outro]) {
        if (part && part.url) {
          part.video = await loadVideoElement(part.url);
          part.video.muted = true; // their sound is in the mix
        }
      }

      // audio: music (from the start of the notes + offset) + the intro/outro videos' own sound
      const tracks = [];
      const notesStart = introDur + leadDur;
      if (audio && audio.buffer) tracks.push({ buffer: audio.buffer, at: notesStart + (audio.offset || 0), volume: audio.volume ?? 1 });
      // a screen's video sound starts with its video (after the text when "text first")
      for (const p of intro) if (p.audioBuffer) tracks.push({ buffer: p.audioBuffer, at: p.start + cardVideoOffset(p.card), volume: 1 });
      for (const p of outro) if (p.audioBuffer) tracks.push({ buffer: p.audioBuffer, at: notesStart + mainDuration + leadDur + p.start + cardVideoOffset(p.card), volume: 1 });

      const bodyStyle = getComputedStyle(document.body);
      const secondColor = this.appState.dualColor ? this.appState.activeColor2 || activeColor : activeColor;
      // the score keeps clear of the keyboard and the live info (same rule as the preview: scoreShift)
      const kbOut = this.appState.keyboard ? keyboardHeight(W, H) : 0;
      const infoRoom = infoActive(this.appState.info) ? infoReserve(W, H - kbOut, normalizeInfo(this.appState.info)) : { top: 0, bottom: 0 };
      const scoreTop0 = H / 2 - (layout.containerH * k) / 2 + layout.svgOffsetTop * k;
      const drawnTop = scoreTop0 + (layout.contentH > 0 ? layout.contentTop : 0) * k; // the drawing, not the SVG box
      const drawnH = (layout.contentH > 0 ? layout.contentH : layout.svgH) * k;
      const shift = scoreShift(H, infoRoom.top, kbOut + infoRoom.bottom, drawnTop, drawnTop + drawnH);
      const f = {
        W, H, k, fps, canvas, ctx, tmp, tmpCtx, raster, bg, activeColor, realtime,
        colors: [activeColor, secondColor], // glow colour per staff slot (0 = first staff, 1 = others)
        svgTop: Math.round(scoreTop0) + shift,
        keyboard: this.appState.keyboard
          ? { range: keyboardRange(this.playbackEngine.keyRange && this.playbackEngine.keyRange.lo, this.playbackEngine.keyRange && this.playbackEngine.keyRange.hi, W / H) }
          : null,
        // same rule as the preview (.has-bg-media): with background media the base is black in both themes
        bgColor: isDark || bg.media ? "#000000" : "#eaf3ec",
        accent: bodyStyle.getPropertyValue("--accent-yellow").trim() || "#cca700",
        showPlayhead: this.appState.showPlayhead !== false,
        info: infoActive(this.appState.info) ? normalizeInfo(this.appState.info) : null,
        infoLabels: this.appState.infoLabels || {},
        playheadW: Math.max(1, Math.round(2 * k)),
        sections: { intro, outro, introDuration: introDur, leadIn: leadDur, mainDuration, leadOut: leadDur },
        fx: fx && (fx.fog > 0 || fx.embers > 0) ? fx : null,
        leadCache: null,
        leadOutCache: null
      };
      const anyVideo = !!(bg.video || [...intro, ...outro].some((p) => p.video));
      return { f, tracks, duration, totalDuration, anyVideo, dispose };
    } catch (err) {
      dispose();
      throw err;
    }
  }

  async startRender({ width, height, fps, format = "mp4", baseName = "Eqo Partitura", openSink, audio = null, cards = null, fx = null, leadIn = true, bitrateMbps = 0 }, onProgress) {
    const emit = (info) => { if (onProgress) onProgress(info); };

    if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") {
      throw new RenderError("NO_WEBCODECS");
    }
    this._cancel = false;
    this._paused = false;
    fps = Number(fps) || 60;
    emit({ phase: "prepare", pct: 0 });

    let built = null;
    let sink = null;
    let done = false;
    try {
      built = await this._buildFrameContext({ width, height, fps, audio, cards, fx, leadIn });
      const { f, tracks, duration, anyVideo } = built;
      const { W, H } = f;
      const totalFrames = Math.ceil(built.totalDuration * fps);
      const videoDuration = totalFrames / fps;

      const bitrate = chooseBitrate(W, H, fps, videoDuration, Number(bitrateMbps) || 0);
      // Videos (background, intro, outro) are decoded by seeking in time order: parallel lanes would make them
      // jump back and forth, so they use a single encoder.
      const candidates = await listEncoderCandidates(format, { width: W, height: H, fps, bitrate }, { allowLanes: !anyVideo });
      if (candidates.length === 0) throw new RenderError("NO_ENCODER");

      let mix = null;
      if (tracks.length) {
        mix = await renderAudioTracks(tracks, videoDuration);
        if (this._cancel) throw new RenderError("CANCELLED");
      }
      const audioCands = {};
      let audioDropped = false;

      const safeBase = String(baseName || "Eqo Partitura").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80) || "Eqo Partitura";
      const defaultName = `${safeBase}_${W}x${H}_${fps}fps`;

      let result = null;
      let lastErr = null;
      for (const cand of candidates) {
        const ext = cand.container;
        // ask for the file once; a retry with the same extension truncates and reuses it
        if (!sink || sink.ext !== ext) {
          if (sink) { await sink.abort(); sink = null; }
          sink = await openSink(defaultName, ext);
          if (!sink) throw new RenderError("CANCELLED");
        } else {
          await sink.reset();
        }

        let audioPart = null;
        if (mix) {
          if (!(ext in audioCands)) audioCands[ext] = await pickAudioEncoder(ext);
          if (audioCands[ext]) audioPart = { mix, cand: audioCands[ext] };
          else audioDropped = true;
        }

        try {
          result = await this._encodeWith(cand, f, { fps, totalFrames, duration, videoDuration }, emit, sink, audioPart);
          result.cand = cand;
          break;
        } catch (err) {
          if (err.code === "CANCELLED") throw err;
          if (err.retryable) { lastErr = err; continue; } // try the next encoder
          throw err;
        }
      }
      if (!result) throw lastErr || new RenderError("NO_ENCODER");

      const filePath = await sink.close();
      done = true;
      const ext = result.container;
      emit({ phase: "finalize", pct: 100 });
      return {
        path: filePath,
        fileName: filePath ? filePath.split(/[\\/]/).pop() : `${defaultName}.${ext}`,
        ext, width: W, height: H, fps,
        duration: videoDuration,
        hasAudio: !!mix && !audioDropped,
        audioDropped: !!mix && audioDropped,
        fellBack: format === "mp4" && ext !== "mp4",
        codec: `${result.cand.config.codec}${result.cand.hardware ? " (GPU)" : ` (CPU ×${result.cand.lanes})`}`,
        stats: result.stats
      };
    } finally {
      if (sink && !done) { try { await sink.abort(); } catch (_) { /* ignore */ } }
      if (built) built.dispose();
      this._paused = false;
    }
  }

  /**
   * Page-4 preview of the finished video (intro → lead-in → notes → outro, with sound), drawn by the render's
   * own frame code into `targetCanvas` at a reduced size. Returns a player; call dispose() when done.
   */
  async createPreview(opts, targetCanvas) {
    this._cancel = false;
    const built = await this._buildFrameContext({ ...opts, realtime: true });
    const { f, tracks, totalDuration } = built;
    const mix = tracks.length ? await renderAudioTracks(tracks, totalDuration) : null;
    targetCanvas.width = f.W;
    targetCanvas.height = f.H;
    const out = targetCanvas.getContext("2d", { alpha: false });
    let ac = null;
    let src = null;
    let playing = false;
    let startWall = 0; // performance.now() at t = 0 (no music)
    let acStart = 0; // ac.currentTime at t = 0
    let pos = 0;
    let raf = 0;
    let drawing = false;
    let disposed = false;
    const listeners = { time: null, end: null };

    const now = () => {
      if (!playing) return pos;
      if (src && ac) return ac.currentTime - acStart; // the sound is the clock
      return (performance.now() - startWall) / 1000;
    };
    const pauseVideos = () => {
      for (const v of [f.bg.video, ...f.sections.intro.map((p) => p.video), ...f.sections.outro.map((p) => p.video)]) if (v && !v.paused) v.pause();
    };
    const draw = async (t) => {
      if (drawing || disposed) return;
      drawing = true;
      try {
        f.activeVideos = new Set();
        await this._drawFrame(f, Math.min(t, totalDuration - 1e-3));
        // videos not used by this frame stop playing
        for (const v of [f.bg.video, ...f.sections.intro.map((p) => p.video), ...f.sections.outro.map((p) => p.video)]) {
          if (v && !f.activeVideos.has(v) && !v.paused) v.pause();
        }
        out.drawImage(f.canvas, 0, 0);
      } finally {
        drawing = false;
      }
    };
    const stopSound = () => {
      if (src) { try { src.stop(); } catch (_) { /* ignore */ } src.disconnect(); src = null; }
    };
    const tick = async () => {
      if (!playing) return;
      const t = now();
      if (t >= totalDuration) {
        player.pause();
        pos = totalDuration;
        await draw(totalDuration);
        if (listeners.end) listeners.end();
        return;
      }
      await draw(t);
      if (listeners.time) listeners.time(t);
      raf = requestAnimationFrame(tick);
    };

    const player = {
      duration: totalDuration,
      width: f.W,
      height: f.H,
      get playing() { return playing; },
      get time() { return now(); },
      onTime(fn) { listeners.time = fn; },
      onEnd(fn) { listeners.end = fn; },
      async play() {
        if (playing || disposed) return;
        if (pos >= totalDuration - 0.05) pos = 0;
        playing = true;
        f.playing = true;
        if (mix) {
          if (!ac) ac = new AudioContext();
          if (ac.state === "suspended") await ac.resume();
          src = ac.createBufferSource();
          src.buffer = mix;
          src.connect(ac.destination);
          acStart = ac.currentTime + 0.05 - pos;
          src.start(ac.currentTime + 0.05, pos);
        } else {
          startWall = performance.now() - pos * 1000;
        }
        raf = requestAnimationFrame(tick);
      },
      pause() {
        if (!playing) return;
        pos = Math.min(totalDuration, now());
        playing = false;
        f.playing = false;
        cancelAnimationFrame(raf);
        stopSound();
        pauseVideos();
      },
      async seek(t) {
        const wasPlaying = playing;
        if (wasPlaying) player.pause();
        pos = clamp(Number(t) || 0, 0, totalDuration);
        await draw(pos);
        if (listeners.time) listeners.time(pos);
        if (wasPlaying) await player.play();
      },
      async drawAt(t) { pos = clamp(t, 0, totalDuration); await draw(pos); },
      dispose() {
        if (disposed) return;
        player.pause();
        disposed = true;
        if (ac) ac.close().catch(() => {});
        built.dispose();
      }
    };
    f.playing = false;
    await draw(0);
    return player;
  }

  /** Background photo stretched over the whole strip, blurred at low resolution (no pixelation, little memory). */
  async _buildBlurredBackdrop(totalW, totalH) {
    const bg = await this._prepareBackground();
    if (!bg.media) return null;
    try {
      const s = bg.settings || {};
      const f = Math.min(1, 4096 / totalW, 1024 / totalH); // low-resolution working copy
      const lw = Math.max(8, Math.round(totalW * f));
      const lh = Math.max(8, Math.round(totalH * f));
      const blur = Math.max(3, Math.round(Math.min(lw, lh) * 0.08));
      const m = blur * 3; // overscan: the blur's soft edges are cropped away

      const work = document.createElement("canvas");
      work.width = lw + 2 * m;
      work.height = lh + 2 * m;
      const wc = work.getContext("2d");
      wc.filter = `blur(${blur}px)${s.grayscale ? " grayscale(100%)" : ""}`;
      wc.drawImage(bg.media, 0, 0, work.width, work.height);

      const canvas = document.createElement("canvas");
      canvas.width = lw;
      canvas.height = lh;
      canvas.getContext("2d").drawImage(work, m, m, lw, lh, 0, 0, lw, lh);
      work.width = 0;
      return { canvas, scale: f, opacity: clamp((s.opacity ?? 50) / 100, 0, 1) };
    } finally {
      if (bg.video) {
        bg.video.removeAttribute("src");
        try { bg.video.load(); } catch (_) { /* yoksay */ }
      }
    }
  }

  // ---- Score strip image (PNG / JPEG / WebP / SVG) ----------------------------------------------
  /** @param bgBlur  raster formats: put the background photo, blurred, behind the strip */
  async exportStrip({ format, baseName = "Eqo_Partitura_Score", bgBlur = false }) {
    const layout = this.getLayout ? this.getLayout() : null;
    const svgEl = this.osmdContainer.querySelector("svg");
    if (!svgEl || !layout || !(layout.svgW > 0) || !(layout.svgH > 0)) throw new RenderError("NO_LAYOUT");

    const isDark = this.appState.animTheme === "dark";

    if (format === "svg") {
      const clone = svgEl.cloneNode(true);
      clone.setAttribute("width", String(layout.svgW));
      clone.setAttribute("height", String(layout.svgH));
      if (isDark) clone.style.filter = "invert(1) hue-rotate(180deg)";
      const text = await withScoreFont(new XMLSerializer().serializeToString(clone)); // opens anywhere with the right font
      return [{ blob: new Blob([text], { type: "image/svg+xml;charset=utf-8" }), fileName: `${baseName}.svg` }];
    }

    // Always ONE image. PNG is streamed in bands (any width, full resolution);
    // JPEG/WebP need one canvas (≤ 32k / 16383 px), so very long strips are scaled down.
    const padFactor = bgBlur ? 1.24 : 1; // room above/below for the photo
    const isPng = format !== "jpeg" && format !== "webp" && format !== "jxl";
    let mime = "image/png";
    let ext = "png";
    if (format === "jpeg") { mime = "image/jpeg"; ext = "jpg"; }
    else if (format === "webp" || format === "jxl") { mime = "image/webp"; ext = "webp"; }

    const HD = 2;
    let scale = Math.min(HD, 15000 / (layout.svgH * padFactor)); // height limit of the raster
    if (!isPng) {
      const maxSide = ext === "webp" ? 16383 : 32000;
      const maxArea = 2.4e8;
      scale = Math.min(scale, maxSide / layout.svgW, Math.sqrt(maxArea / (layout.svgW * layout.svgH * padFactor)));
    }
    const downscaled = scale < HD - 1e-6;

    const raster = await ScoreRaster.create({
      svgEl, markEls: [], svgW: layout.svgW, svgH: layout.svgH, scale, isDark, activeColor: "#000000", withNotes: false
    });

    let backdrop = null;
    try {
      const totalW = Math.ceil(layout.svgW * scale);
      // With a photo, leave some room above and below the staff so the backdrop shows around the notes
      const padY = bgBlur ? Math.round(raster.hOut * 0.12) : 0;
      const totalH = raster.hOut + 2 * padY;
      if (bgBlur) backdrop = await this._buildBlurredBackdrop(totalW, totalH);
      // same rule as the preview/video: with background media the base is black in both themes
      const baseColor = isDark || backdrop ? "#000000" : "#eaf3ec";

      /** Paints the output rectangle (x, y, w, h) — backdrop + score — into ctx at (0, 0). */
      const paint = (ctx, x, y, w, h) => {
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, w, h);
        if (backdrop) {
          const kb = backdrop.scale;
          ctx.save();
          ctx.globalAlpha = backdrop.opacity;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(backdrop.canvas, x * kb, y * kb, w * kb, h * kb, 0, 0, w, h);
          ctx.restore();
        }
        raster.drawBaseRect(ctx, x, y - padY, w, h);
      };

      let blob;
      if (isPng) {
        const png = new PngStreamEncoder(totalW, totalH);
        const SEG = 8192; // segment width per canvas
        const M = 2; // overlap so no seam can appear where segments/bands meet
        const bandH = clamp(Math.floor(3.2e7 / (totalW * 4)), 16, Math.min(512, totalH));
        const seg = document.createElement("canvas");
        const sc = seg.getContext("2d", { willReadFrequently: true });
        const band = new Uint8ClampedArray(totalW * bandH * 4);
        for (let y0 = 0; y0 < totalH; y0 += bandH) {
          const bh = Math.min(bandH, totalH - y0);
          for (let x0 = 0; x0 < totalW; x0 += SEG) {
            const w = Math.min(SEG, totalW - x0);
            seg.width = w + 2 * M;
            seg.height = bh + 2 * M;
            paint(sc, x0 - M, y0 - M, w + 2 * M, bh + 2 * M);
            const px = sc.getImageData(M, M, w, bh).data;
            for (let r = 0; r < bh; r++) band.set(px.subarray(r * w * 4, (r + 1) * w * 4), (r * totalW + x0) * 4);
          }
          await png.addRowsRGBA(band, bh);
          await sleep(0);
        }
        seg.width = 0;
        blob = await png.finish();
      } else {
        const canvas = document.createElement("canvas");
        canvas.width = totalW;
        canvas.height = totalH;
        paint(canvas.getContext("2d"), 0, 0, totalW, totalH);
        blob = await canvasToBlob(canvas, mime, 0.95);
        canvas.width = 0;
      }
      return [{ blob, fileName: `${baseName}_HD.${ext}`, width: totalW, height: totalH, downscaled }];
    } finally {
      raster.dispose();
      if (backdrop) backdrop.canvas.width = 0;
    }
  }
}
