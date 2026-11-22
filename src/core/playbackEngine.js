// playbackEngine.js — timeline (tempo map, fermatas, glow items) and the page-3 preview player.
// CRITICAL: the render engine uses the same getStateAtTime() / getActiveItemsAt(), so preview = video.

/** MuseScore 4 default for a normal fermata: ×2.0 (short 1.5, long 3.0, very long 4.0). */
export const DEFAULT_FERMATA_STRETCH = 2.0;

// =================================================================================================
// Animated glows, shared by the preview (DOM) and the render (canvas) so both look the same.
//   fx "trill": the note shimmers at a real trill speed (32nd notes at the local tempo, 6–14 notes/s)
//   fx "flow" : slurs / ties fill from left to right like running water, following the playhead
// =================================================================================================
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Trill notes per second at a tempo: 32nd notes, kept in the range players actually trill at. */
export const trillRate = (bpm) => Math.min(14, Math.max(6, (8 * bpm) / 60));

/** Glow strength 0…1 of a trill item at t: bright on the main note, dim on the upper one, steady at the end. */
export function trillLevel(it, t) {
  const dt = t - it.startTime;
  const dur = it.endTime - it.startTime;
  if (dt < 0.06 || dt > dur * 0.92) return 1; // clear start, resolved ending
  const wave = 0.5 + 0.5 * Math.cos(Math.PI * it.trillRate * dt); // one bright pulse per main/upper pair
  return 0.3 + 0.7 * Math.pow(wave, 1.6);
}

const SVG_NS = "http://www.w3.org/2000/svg";
let flowSeq = 0;

function hexRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return [255, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mixRgb = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);

function clearFlow(el) {
  const targets = el.matches("path, rect, polygon") ? [el] : el.querySelectorAll("path, rect, polygon");
  for (const p of targets) { p.style.removeProperty("fill"); p.style.removeProperty("stroke"); }
  if (el._flowGrad) { el._flowGrad.remove(); el._flowGrad = null; }
}

const FLOW_WAVE = 30; // px (score layout), ripple wavelength
const FLOW_SPEED = 55; // px/s, ripples run with the music

/**
 * Water-like fill of a slur / tie at playhead x (score px) and time t.
 * -> { x0, w, stops: [offset 0…1, level 0…1][], crest: offset } | null. Level 0 = unlit, 1 = full glow.
 */
export function flowStops(it, x, t) {
  let x0 = Infinity, x1 = -Infinity;
  for (const r of it.rects) { x0 = Math.min(x0, r.x); x1 = Math.max(x1, r.x + r.w); }
  const w = x1 - x0;
  if (!(w > 0)) return null;
  const front = clamp01((x - x0) / w + 6 / w); // slightly ahead of the playhead
  if (front >= 1) return { x0, w, stops: [[0, 1], [1, 1]], crest: -1 };
  const feather = Math.min(0.3, Math.max(16 / w, 0.05));
  const head = Math.max(0, front - feather / 2);
  const stops = [];
  const step = Math.max(FLOW_WAVE / 6, w / 48) / w; // ≤ ~50 stops
  for (let o = 0; o < head; o += step) {
    const px = o * w;
    stops.push([o, 0.78 + 0.22 * (0.5 + 0.5 * Math.sin((2 * Math.PI * (px - t * FLOW_SPEED)) / FLOW_WAVE))]);
  }
  stops.push([head, 1]);
  stops.push([Math.min(1, front + feather / 2), 0]);
  if (front + feather / 2 < 1) stops.push([1, 0]);
  return { x0, w, stops, crest: head };
}

export class PlaybackEngine {
  constructor({ viewportEl, trackEl, onFinish, onPlay, onStop, onTick }) {
    this.viewportEl = viewportEl;
    this.trackEl = trackEl;
    this.onFinish = onFinish;
    this.onPlay = onPlay; // (t) => void, playback started at t (music sync)
    this.onStop = onStop; // () => void
    this.onTick = onTick; // (t) => void, position changed (time display)

    this.baseBpm = 120;
    this.fermataStretch = DEFAULT_FERMATA_STRETCH;
    this.tempoDiamonds = [];
    this.tempoWords = null; // rit. / rall. / accel. / a tempo from the score (setTempoWords)
    this.steps = [];
    this.timedSteps = [];
    this.totalDuration = 0; // end of the notes
    this.minEnd = 0; // e.g. the end of the music track: playback never stops before it

    this.isPlaying = false;
    this.animationFrameId = null;
    this.startTime = 0;
    this.pausedMs = 0;

    this.items = [];
    this.timedItems = [];
    this.maxItemDuration = 0;
    this._lit = new Map(); // element -> slot currently lit
    this._activeKey = null;

    // CRITICAL: optional master clock () => seconds | null. While the music plays the preview follows it,
    // so notes and music cannot drift apart.
    this.getExternalTime = null;
  }

  /** Playback (and the video) lasts until the later of: the last note, or minEnd (the music's end). */
  get playEnd() {
    return Math.max(this.totalDuration, this.minEnd || 0);
  }

  setMinEnd(seconds) {
    this.minEnd = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
    if (this.onTick) this.onTick(this.getTime());
  }

  setBpm(bpm) {
    const val = Number(bpm);
    if (Number.isFinite(val) && val > 0) {
      this.baseBpm = val;
      this._recalculateTimings();
    }
  }

  setFermataStretch(stretch) {
    const val = Number(stretch);
    if (Number.isFinite(val) && val >= 1) {
      this.fermataStretch = val;
      this._recalculateTimings();
    }
  }

  setDiamonds(diamonds) {
    this.tempoDiamonds = [...(diamonds || [])].sort((a, b) => a.xPx - b.xPx);
    this._recalculateTimings();
  }

  /** Gradual tempo changes from the score's words (core/tempoWords.js): { ramps, resets } in beats. */
  setTempoWords(tw) {
    this.tempoWords = tw && (tw.ramps.length || tw.resets.length) ? tw : null;
    this._recalculateTimings();
  }

  /**
   * Tempo factor at a beat from rit. / rall. / accel. (×1 = as written). A ramp goes linearly from the factor
   * before it to (that × its `to`); the result holds until "a tempo" or a tempo diamond (an absolute tempo).
   */
  _factorAt(beat, resetBeats) {
    const tw = this.tempoWords;
    if (!tw) return 1;
    let f = 1;
    let ri = 0;
    const resets = resetBeats;
    for (const r of tw.ramps) {
      if (r.startBeat > beat) break;
      // resets between the previous event and this ramp
      while (ri < resets.length && resets[ri] <= r.startBeat) { f = 1; ri++; }
      const from = f;
      const to = from * r.to;
      if (beat < r.endBeat) {
        while (ri < resets.length && resets[ri] <= beat) { return 1; }
        const p = (beat - r.startBeat) / (r.endBeat - r.startBeat);
        return from + (to - from) * p;
      }
      f = to;
    }
    while (ri < resets.length && resets[ri] <= beat) { f = 1; ri++; }
    return f;
  }

  setSteps(steps) {
    this.steps = steps || [];
    this.items = (steps && steps.items) || [];
    this._recalculateTimings();
    this.reset();
  }

  /** Beat position (quarters from the start) → seconds, through the tempo map and fermatas of the steps. */
  beatToTime(beat) {
    const steps = this.timedSteps;
    const n = steps.length;
    if (n === 0) return 0;
    if (beat <= steps[0].beat) return steps[0].startTime;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (steps[mid].beat <= beat) lo = mid;
      else hi = mid - 1;
    }
    const s = steps[lo];
    const p = s.beats > 0 ? Math.min(1, (beat - s.beat) / s.beats) : 1;
    return s.startTime + (s.endTime - s.startTime) * p;
  }

  /** Glow items lit at time t (each note/rest/slur/… for its own duration). Sorted by start. */
  getActiveItemsAt(t) {
    const items = this.timedItems || [];
    const out = [];
    if (!items.length || t < 0 || t >= this.totalDuration) return out;
    // items start in order; anything that could still be lit started after t - maxItemDuration
    let lo = 0;
    let hi = items.length;
    const from = t - this.maxItemDuration;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (items[mid].startTime < from) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < items.length; i++) {
      const it = items[i];
      if (it.startTime > t) break;
      if (t < it.endTime) out.push(it);
    }
    return out;
  }

  /** BPM at strip position x (px from the svg's left edge). */
  getBpmAtX(xPx) {
    let bpm = this.baseBpm;
    for (const d of this.tempoDiamonds) {
      if (xPx >= d.xPx) bpm = d.bpm;
      else break;
    }
    return bpm;
  }

  _recalculateTimings() {
    // keep the same musical position when the tempo changes
    const before = this.totalDuration > 0 ? this.getTime() / this.totalDuration : 0;

    this.timedSteps = [];
    let acc = 0;
    // rit. / accel. from the score: "a tempo" and every tempo diamond (an absolute tempo) end their effect
    let resetBeats = [];
    if (this.tempoWords) {
      resetBeats = [...this.tempoWords.resets];
      for (const d of this.tempoDiamonds) {
        const s = this.steps.find((st) => st.x >= d.xPx);
        if (s) resetBeats.push(s.beat);
      }
      resetBeats.sort((a, b) => a - b);
    }
    this._resetBeats = resetBeats;
    for (const step of this.steps) {
      const bpm = this.getBpmAtX(step.x);
      const beats = step.beats > 0 ? step.beats : 1;
      const held = Math.min(beats, step.fermataBeats || 0);
      let dur;
      if (!this.tempoWords) {
        dur = ((beats + held * (this.fermataStretch - 1)) * 60) / bpm;
      } else {
        // a changing tempo inside the step: add it up in small slices
        const SL = 8;
        dur = 0;
        for (let k = 0; k < SL; k++) {
          const f = this._factorAt(step.beat + ((k + 0.5) / SL) * beats, resetBeats);
          dur += ((beats / SL) * 60) / (bpm * f);
        }
        if (held > 0) dur += (held * (this.fermataStretch - 1) * 60) / (bpm * this._factorAt(step.beat + beats, resetBeats));
      }
      this.timedSteps.push({ ...step, startTime: acc, endTime: acc + dur });
      acc += dur;
    }
    this.totalDuration = acc;

    // glow items in seconds
    this.timedItems = (this.items || []).map((it) => {
      const startTime = this.beatToTime(it.startBeat);
      const endTime = Math.min(acc, Math.max(startTime + 0.02, this.beatToTime(it.endBeat)));
      const out = { ...it, startTime, endTime };
      if (it.fx === "trill") {
        const r = it.rects[0];
        out.trillRate = trillRate(this.getBpmAtX(r ? r.x + r.w / 2 : 0));
      }
      return out;
    }).sort((a, b) => a.startTime - b.startTime);
    this.maxItemDuration = this.timedItems.reduce((m, it) => Math.max(m, it.endTime - it.startTime), 0);
    // note heads in time order (info overlay: notes played so far / total)
    const onsets = this.timedItems.filter((it) => it.noteCount > 0);
    this._noteTimes = onsets.map((it) => it.startTime);
    this._noteCum = [];
    let sum = 0;
    for (const it of onsets) { sum += it.noteCount; this._noteCum.push(sum); }
    this.totalNotes = sum;
    this._activeKey = null; // force a refresh of the lit elements

    if (!this.isPlaying && before > 0) this.pausedMs = before * acc * 1000;
    if (this.onTick) this.onTick(this.getTime());
  }

  /** Note heads that have sounded by time t (chord notes each count). */
  notesPlayedAt(t) {
    const times = this._noteTimes || [];
    let lo = 0;
    let hi = times.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= t + 1e-6) lo = mid + 1;
      else hi = mid;
    }
    return lo > 0 ? this._noteCum[lo - 1] : 0;
  }

  /** Tempo (quarter BPM) heard at time t: diamonds and the score's rit. / accel. included. */
  tempoAt(t) {
    const st = this.getStateAtTime(Math.max(0, t));
    const s = st.step;
    if (!s) return this.baseBpm;
    const span = s.endTime - s.startTime;
    const p = span > 0 ? Math.min(1, Math.max(0, (t - s.startTime) / span)) : 0;
    const f = this.tempoWords ? this._factorAt(s.beat + p * (s.beats || 0), this._resetBeats || []) : 1;
    return this.getBpmAtX(s.x) * f;
  }

  /** State at time t (s): strip x under the playhead (linear between notes) and the current step. */
  getStateAtTime(t) {
    const steps = this.timedSteps;
    const n = steps.length;
    if (n === 0) return { x: 0, index: -1, step: null, active: false };

    if (t <= 0) return { x: steps[0].x, index: 0, step: steps[0], active: true };
    if (t >= this.totalDuration) return { x: steps[n - 1].x, index: n - 1, step: steps[n - 1], active: false };

    const lo = this._indexAtTime(t);
    const cur = steps[lo];
    const next = steps[lo + 1];
    let x = cur.x;
    if (next) {
      const span = cur.endTime - cur.startTime;
      const p = span > 0 ? Math.max(0, Math.min(1, (t - cur.startTime) / span)) : 1;
      x = cur.x + (next.x - cur.x) * p;
    }
    return { x, index: lo, step: cur, active: true };
  }

  /** Largest step index with startTime <= t (binary search). */
  _indexAtTime(t) {
    const steps = this.timedSteps;
    let lo = 0;
    let hi = steps.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (steps[mid].startTime <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** Inverse of getStateAtTime: time at strip position x. */
  getTimeAtX(x) {
    const steps = this.timedSteps;
    const n = steps.length;
    if (n === 0) return 0;
    if (x <= steps[0].x) return 0;
    for (let i = 0; i < n - 1; i++) {
      const a = steps[i];
      const b = steps[i + 1];
      if (x < b.x) {
        const p = b.x > a.x ? (x - a.x) / (b.x - a.x) : 0;
        return a.startTime + (a.endTime - a.startTime) * Math.max(0, Math.min(1, p));
      }
    }
    return steps[n - 1].startTime;
  }

  /** Start time of the previous / next note (arrow keys). */
  getNeighbourStepTime(t, direction) {
    const steps = this.timedSteps;
    if (steps.length === 0) return 0;
    const i = this._indexAtTime(Math.min(Math.max(t, 0), this.totalDuration));
    if (direction > 0) return i + 1 < steps.length ? steps[i + 1].startTime : steps[i].startTime;
    // back: first to the start of the current note, then to the previous one
    if (t - steps[i].startTime > 0.05) return steps[i].startTime;
    return i > 0 ? steps[i - 1].startTime : 0;
  }

  start() {
    if (this.isPlaying || this.timedSteps.length === 0) return;
    if (this.pausedMs / 1000 >= this.playEnd - 1e-3) this.pausedMs = 0; // at the end: from the start
    this.isPlaying = true;
    this.startTime = performance.now() - this.pausedMs;
    if (this.onPlay) this.onPlay(this.pausedMs / 1000);
    this._loop();
  }

  /** Current playback time (s). */
  getTime() {
    return this.isPlaying ? (performance.now() - this.startTime) / 1000 : this.pausedMs / 1000;
  }

  /** Jumps to t (s); keeps playing if playing. opts.silent: don't resync the music (while dragging the seek bar). */
  seek(t, { silent = false } = {}) {
    if (this.timedSteps.length === 0) return;
    const tt = Math.min(Math.max(0, Number(t) || 0), this.playEnd);
    if (this.isPlaying) {
      this.startTime = performance.now() - tt * 1000;
      if (!silent && this.onPlay) this.onPlay(tt);
    } else {
      this.pausedMs = tt * 1000;
      const state = this.getStateAtTime(tt);
      this._scrollToX(state.x);
      this._showAt(tt > 0 ? tt : -1);
    }
    if (this.onTick) this.onTick(tt);
  }

  stop() {
    const wasPlaying = this.isPlaying;
    if (this.isPlaying) {
      this.pausedMs = performance.now() - this.startTime; // keep the position only while playing
    }
    this.isPlaying = false;
    if (wasPlaying && this.onStop) this.onStop();
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  reset() {
    this.stop();
    this.pausedMs = 0;
    this._showAt(-1);
    this._scrollToX(this.timedSteps.length > 0 ? this.timedSteps[0].x : 0);
    if (this.onTick) this.onTick(0);
  }

  _loop() {
    if (!this.isPlaying) return;
    const now = performance.now();
    let t = (now - this.startTime) / 1000;
    if (this.getExternalTime) {
      const ext = this.getExternalTime();
      if (Number.isFinite(ext)) {
        t = ext;
        this.startTime = now - t * 1000; // keep the wall clock aligned for when the music stops/ends
      }
    }

    if (t >= this.playEnd) {
      const last = this.timedSteps[this.timedSteps.length - 1];
      if (last) this._scrollToX(last.x);
      this._showAt(-1);
      this.isPlaying = false;
      this.pausedMs = this.playEnd * 1000;
      this.animationFrameId = null;
      if (this.onTick) this.onTick(this.playEnd);
      if (this.onStop) this.onStop();
      if (this.onFinish) this.onFinish();
      return;
    }

    const state = this.getStateAtTime(t);
    this._scrollToX(state.x);
    this._showAt(t);
    if (this.onTick) this.onTick(t);
    this.animationFrameId = requestAnimationFrame(() => this._loop());
  }

  /** Lights the elements of the items active at t (t < 0: none); only changes touch the DOM. */
  _showAt(t) {
    const active = t >= 0 ? this.getActiveItemsAt(t) : [];
    this._applyFx(active, t); // animated glows change every frame
    const key = active.length ? active.map((it) => it.startTime + ":" + it.endTime).join("|") : "";
    if (key === this._activeKey) return;
    this._activeKey = key;

    const next = new Map();
    for (const it of active) for (const el of it.elements) if (!next.has(el)) next.set(el, it.slot);
    for (const [el, slot] of this._lit) {
      if (next.get(el) !== slot) el.classList.remove("note-active", "glow-b");
    }
    for (const [el, slot] of next) {
      if (this._lit.get(el) === slot) continue;
      el.classList.add("note-active");
      el.classList.toggle("glow-b", slot === 1);
    }
    this._lit = next;
  }

  /** Trill shimmer (opacity) and slur / tie flow (SVG gradient fill) on the lit elements. */
  _applyFx(active, t) {
    if (!this._fxEls) this._fxEls = new Map(); // element -> "trill" | "flow"
    const now = new Map();
    let x = null;
    let colors = null;
    const dark = this.viewportEl.classList.contains("dark-anim-theme");
    for (const it of active) {
      if (it.fx === "trill") {
        const a = trillLevel(it, t).toFixed(3);
        for (const el of it.elements) { el.style.opacity = a; now.set(el, "trill"); }
      } else if (it.fx === "flow") {
        if (x === null) x = this.getStateAtTime(t).x;
        if (!colors) {
          const cs = getComputedStyle(document.documentElement);
          const c1 = cs.getPropertyValue("--active-note-color").trim() || "#ff0000";
          colors = [c1, cs.getPropertyValue("--active-note-color-2").trim() || c1];
        }
        const flow = flowStops(it, x, t);
        if (!flow) continue;
        for (const el of it.elements) {
          this._paintFlow(el, flow, colors[it.slot === 1 ? 1 : 0], dark ? "#ffffff" : "#000000");
          now.set(el, "flow");
        }
      }
    }
    for (const [el, kind] of this._fxEls) {
      if (now.get(el) === kind) continue;
      if (kind === "trill") el.style.opacity = "";
      else clearFlow(el);
    }
    this._fxEls = now;
  }

  _paintFlow(el, flow, glow, base) {
    const svg = el.ownerSVGElement || el.closest("svg");
    if (!svg) return;
    let grad = el._flowGrad;
    if (!grad || !grad.isConnected) {
      let defs = svg.querySelector("defs.echo-fx");
      if (!defs) {
        defs = document.createElementNS(SVG_NS, "defs");
        defs.setAttribute("class", "echo-fx");
        svg.prepend(defs);
      }
      grad = document.createElementNS(SVG_NS, "linearGradient");
      grad.id = "echo-flow-" + ++flowSeq;
      grad.setAttribute("x1", "0"); grad.setAttribute("x2", "1"); grad.setAttribute("y1", "0"); grad.setAttribute("y2", "0");
      defs.append(grad);
      el._flowGrad = grad;
    }
    const g = hexRgb(glow);
    const b = hexRgb(base);
    const crest = mixRgb(g, [255, 255, 255], 0.45);
    const html = [];
    const stop = (o, rgb) => html.push(`<stop offset="${(o * 100).toFixed(2)}%" stop-color="rgb(${rgb.map(Math.round).join(",")})"/>`);
    for (const [o, level] of flow.stops) {
      if (flow.crest >= 0 && Math.abs(o - flow.crest) < 1e-9) stop(o, crest);
      else stop(o, mixRgb(b, g, level));
    }
    grad.innerHTML = html.join("");
    const url = `url(#${grad.id})`;
    const targets = el.matches("path, rect, polygon") ? [el] : el.querySelectorAll("path, rect, polygon");
    for (const p of targets) {
      // CRITICAL: inline !important is needed to win over the .note-active fill rule
      if (p.getAttribute("fill") !== "none") p.style.setProperty("fill", url, "important");
      if (p.getAttribute("stroke") && p.getAttribute("stroke") !== "none") p.style.setProperty("stroke", url, "important");
    }
  }

  _scrollToX(noteX) {
    const viewportCenter = this.viewportEl.clientWidth / 2;
    const translateX = viewportCenter - noteX;
    this.trackEl.style.transform = `translate(${translateX}px, -50%)`;
    this.trackEl.dataset.currentX = String(translateX);
  }
}
