// tempoWords.js — gradual tempo changes written as words in a MusicXML score: rit., rall., accel., a tempo …
// OSMD lays these words out but the timeline ignored them, so a ritardando never slowed the video down (and a
// recording played with it drifted ahead of the notes at the end). They are read here straight from the XML.
//
// Result, in quarter beats from the start (the same unit as the timeline's step.beat):
//   ramps:  [{ startBeat, endBeat, to }]  the tempo goes linearly from ×1 (or the current factor) to ×`to`
//   resets: [beat]                         "a tempo" / "tempo primo": back to ×1
// Like MuseScore 4: the change runs along its dashed line ("rall. - - - -"); without a line, to the end of its
// measure (at least two beats). After a ramp the new tempo holds until "a tempo" or the next written tempo.

// MuseScore 4 defaults for gradual tempo changes (end tempo as a factor of the tempo before it)
const WORDS = [
  [/^(poco\s+)?(rit|ritard|ritardando|ritenuto|riten)\b/, 0.75],
  [/^(poco\s+)?(rall|rallent|rallentando)\b/, 0.75],
  [/^(molto\s+)(rit|ritard|ritardando|rall|rallentando)\b/, 0.6],
  [/^allarg(ando)?\b/, 0.75],
  [/^(s?lentando)\b/, 0.75],
  [/^(calando|morendo|smorzando)\b/, 0.5],
  [/^(poco\s+)?(accel|accelerando)\b/, 1.33],
  [/^(molto\s+)(accel|accelerando)\b/, 1.5],
  [/^stringendo\b|^string\b/, 1.5],
  [/^precipitando\b/, 1.15]
];
const RESET = /^(a\s+tempo|tempo\s+(i|1|primo)|tempo\s+giusto|in\s+tempo)\b/;

function rampFactor(text) {
  const t = text.toLowerCase().replace(/[.…]+/g, " ").replace(/\s+/g, " ").trim();
  if (RESET.test(t)) return "reset";
  for (const [re, f] of WORDS) if (re.test(t)) return f;
  return null;
}

/** Reads a .mxl (zip) or plain MusicXML file and returns the score XML text. */
export async function readMusicXmlText(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (!(buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b)) {
    let text;
    if (buf[0] === 0xff && buf[1] === 0xfe) text = new TextDecoder("utf-16le").decode(buf);
    else if (buf[0] === 0xfe && buf[1] === 0xff) text = new TextDecoder("utf-16be").decode(buf);
    else text = new TextDecoder("utf-8").decode(buf);
    return text.replace(/^﻿/, "");
  }
  const entries = unzipIndex(buf);
  let root = null;
  const container = entries.get("META-INF/container.xml");
  if (container) {
    const m = /full-path="([^"]+)"/.exec(new TextDecoder().decode(await inflate(buf, container)));
    if (m) root = m[1];
  }
  if (!root || !entries.has(root)) root = [...entries.keys()].find((n) => !n.startsWith("META-INF/") && /\.(xml|musicxml)$/i.test(n));
  if (!root) return null;
  return new TextDecoder("utf-8").decode(await inflate(buf, entries.get(root))).replace(/^﻿/, "");
}

// --- minimal zip reader (central directory; stored or deflated entries) ---
function unzipIndex(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  const map = new Map();
  if (eocd < 0) return map;
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  for (let k = 0; k < count && dv.getUint32(p, true) === 0x02014b50; k++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nlen));
    map.set(name, { method, csize, local });
    p += 46 + nlen + elen + clen;
  }
  return map;
}

async function inflate(b, e) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const start = e.local + 30 + dv.getUint16(e.local + 26, true) + dv.getUint16(e.local + 28, true);
  const data = b.subarray(start, start + e.csize);
  if (e.method === 0) return data;
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// --- the words and their positions ---
/** Gradual tempo changes of a MusicXML score (see the top of this file). */
export function parseTempoWords(xmlText) {
  const out = { ramps: [], resets: [], tempos: [], lines: [] };
  if (!xmlText) return out;
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const part = doc.querySelector("part");
  if (!part) return out;

  let divisions = 1;
  let measureStart = 0; // in quarters
  const found = []; // { beat, factor, measureEnd, dashes: number|null }
  const dashStops = []; // { beat, number }
  const tempoMarks = []; // { beat, bpm, metronome } from <sound tempo="…">
  const wordLines = []; // words followed by a dashed line ("rall. - - - -", "cresc. - - -"): { text, beat, dashes }
  let lastWords = null;
  const readSound = (el, beat) => {
    const s = el.tagName === "sound" ? el : el.querySelector(":scope > sound");
    const bpm = s ? Number(s.getAttribute("tempo")) : 0;
    if (bpm > 0) tempoMarks.push({ beat, bpm, metronome: !!(el.querySelector && el.querySelector("direction-type > metronome")) });
  };
  for (const measure of part.children) {
    if (measure.tagName !== "measure") continue;
    let cursor = 0, maxCursor = 0; // in divisions, inside the measure
    const pending = [];
    for (const el of measure.children) {
      const tag = el.tagName;
      if (tag === "attributes") {
        const d = el.querySelector("divisions");
        if (d) divisions = Number(d.textContent) || divisions;
      } else if (tag === "note") {
        const dur = Number((el.querySelector(":scope > duration") || {}).textContent) || 0;
        if (!el.querySelector(":scope > chord") && !el.querySelector(":scope > grace")) cursor += dur;
      } else if (tag === "backup") {
        cursor -= Number((el.querySelector("duration") || {}).textContent) || 0;
      } else if (tag === "forward") {
        cursor += Number((el.querySelector("duration") || {}).textContent) || 0;
      } else if (tag === "direction") {
        const off = Number((el.querySelector(":scope > offset") || {}).textContent) || 0;
        const beat = measureStart + (cursor + off) / divisions;
        const words = [...el.querySelectorAll("direction-type > words")].map((w) => w.textContent).join(" ").trim();
        const dash = el.querySelector("direction-type > dashes");
        if (words) {
          const f = rampFactor(words);
          const num = dash && dash.getAttribute("type") === "start" ? dash.getAttribute("number") || "1" : null;
          if (f !== null) pending.push({ beat, factor: f, dashes: num });
          lastWords = { text: words, beat, dashes: num };
          if (num !== null) wordLines.push(lastWords);
        } else if (dash && dash.getAttribute("type") === "start") {
          // the line of the word just before it ("rall." then a separate dashes-start)
          const num = dash.getAttribute("number") || "1";
          const last = pending[pending.length - 1] || found[found.length - 1];
          if (last && last.factor !== "reset" && last.dashes === null) last.dashes = num;
          if (lastWords && lastWords.dashes === null) { lastWords.dashes = num; wordLines.push(lastWords); }
        }
        if (dash && dash.getAttribute("type") === "stop") dashStops.push({ beat, number: dash.getAttribute("number") || "1" });
        readSound(el, beat);
      } else if (tag === "sound") {
        readSound(el, measureStart + cursor / divisions);
      }
      if (cursor > maxCursor) maxCursor = cursor;
    }
    const measureEnd = measureStart + maxCursor / divisions;
    for (const f of pending) found.push({ ...f, measureEnd });
    measureStart = measureEnd;
  }

  for (const f of found) {
    if (f.factor === "reset") { out.resets.push(f.beat); continue; }
    let end = null;
    if (f.dashes !== null) {
      const stop = dashStops.find((s) => s.number === f.dashes && s.beat > f.beat);
      if (stop) end = stop.beat;
    }
    if (end === null) end = Math.max(f.measureEnd, f.beat + 2);
    if (end > f.beat) out.ramps.push({ startBeat: f.beat, endBeat: end, to: f.factor });
  }
  out.ramps.sort((a, b) => a.startBeat - b.startBeat);
  // the dashed lines themselves (OSMD draws the word but not its line — drawWordLines draws it)
  for (const w of wordLines) {
    const stop = dashStops.find((st) => st.number === w.dashes && st.beat > w.beat);
    if (stop) out.lines.push({ text: w.text, startBeat: w.beat, endBeat: stop.beat });
  }
  out.resets.sort((a, b) => a - b);

  // Written tempos. Several at the same spot (e.g. "Andantino" with a hidden 94 and "♩ = 90"): the visible
  // metronome mark wins, otherwise the last one — as MuseScore plays it. (OSMD took the first one, so such a
  // score ran 94 instead of 90 and a recording drifted away from the notes.)
  const byBeat = new Map();
  for (const t of tempoMarks) {
    const k = Math.round(t.beat * 1000) / 1000;
    const prev = byBeat.get(k);
    if (!prev || t.metronome || !prev.metronome) byBeat.set(k, t);
  }
  out.tempos = [...byBeat.entries()].map(([beat, t]) => ({ beat, bpm: t.bpm })).sort((a, b) => a.beat - b.beat);
  return out;
}

// --- drawing the dashed lines into the score ---
const SVG_NS = "http://www.w3.org/2000/svg";
// what the dashed line must stay clear of (OSMD 2.3.1 / VexFlow class names; the beam copies are hidden twins)
const OBSTACLES = "g.vf-stavenote, path.vf-stem, path.vf-beam:not(.echo-beam-part), path.vf-flag, g.vf-stavetie, g.vf-modifiers, g.vf-ledgers";
const ORIG_TRANSFORM = "data-echo-orig-transform";
const norm = (t) => String(t || "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Draws the dashed line after a word ("rall. - - - - -") into the rendered score, up to the note where the
 * line stops — as MuseScore shows it. OSMD lays out the word only.
 * @param steps the timeline steps ({ x, beat }: x in CSS px from the svg's left edge)
 */
export function drawWordLines(containerEl, steps, tempoWords) {
  const svg = containerEl && containerEl.querySelector("svg");
  if (!svg) return;
  for (const old of svg.querySelectorAll(".echo-word-line")) old.parentNode.removeChild(old);
  // words moved up by an earlier build go back first (the timeline is rebuilt on the same drawing)
  for (const t of svg.querySelectorAll(`[${ORIG_TRANSFORM}]`)) {
    const orig = t.getAttribute(ORIG_TRANSFORM);
    if (orig) t.setAttribute("transform", orig);
    else t.removeAttribute("transform");
    t.removeAttribute(ORIG_TRANSFORM);
  }
  const lines = (tempoWords && tempoWords.lines) || [];
  if (!lines.length || !steps || !steps.length) return;
  const svgRect = svg.getBoundingClientRect();
  if (!svgRect.width) return;
  const texts = [...svg.querySelectorAll("text")];
  const xAtBeat = (beat) => {
    const s = steps.find((st) => st.beat >= beat - 1e-6);
    if (s) return s.x - 4;
    return steps[steps.length - 1].x + 24;
  };
  const used = new Set();
  for (const line of lines) {
    const want = norm(line.text);
    const x0Target = xAtBeat(line.startBeat);
    // the word OSMD drew, nearest to where the line starts
    let best = null;
    let bestD = Infinity;
    for (const t of texts) {
      if (used.has(t)) continue;
      const txt = norm(t.textContent);
      if (!txt || !(want.startsWith(txt) || txt.startsWith(want))) continue;
      const r = t.getBoundingClientRect();
      const d = Math.abs(r.left - svgRect.left - x0Target);
      if (d < bestD) { bestD = d; best = t; }
    }
    if (!best || bestD > 200) continue;
    used.add(best);
    const r = best.getBoundingClientRect();
    let bb;
    try { bb = best.getBBox(); } catch (_) { continue; }
    if (!(bb.width > 0) || !(r.width > 0)) continue;
    const k = bb.width / r.width; // CSS px -> user units of the word
    const startPx = r.right - svgRect.left + 5;
    const endPx = xAtBeat(line.endBeat);
    if (!(endPx > startPx + 8)) continue;
    // at the height of the letters, like MuseScore — but never through the notes: when a stem, beam, flag or
    // note head under the line reaches that high, the line and its word move up above them
    const kY = bb.height > 0 && r.height > 0 ? bb.height / r.height : k;
    const gap = r.height * 0.3;
    const x0 = r.right + 5;
    const x1 = svgRect.left + endPx;
    const obstacles = [];
    for (const o of svg.querySelectorAll(OBSTACLES)) {
      const or = o.getBoundingClientRect();
      if (or.width || or.height) if (or.right > x0 && or.left < x1) obstacles.push(or);
    }
    let lineY = r.top + r.height * 0.62; // screen px
    for (let pass = 0; pass < 12; pass++) {
      let top = Infinity;
      for (const or of obstacles) if (or.top < lineY + gap && or.bottom > lineY - gap) top = Math.min(top, or.top);
      if (top === Infinity) break;
      lineY = top - gap;
    }
    const lift = r.top + r.height * 0.62 - lineY; // screen px the line went up
    if (lift > 0.5) {
      const orig = best.getAttribute(ORIG_TRANSFORM) ?? best.getAttribute("transform") ?? "";
      best.setAttribute(ORIG_TRANSFORM, orig);
      best.setAttribute("transform", `translate(0 ${-lift * kY}) ${orig}`.trim());
    }
    const y = bb.y + (lineY - r.top) * kY;
    const el = document.createElementNS(SVG_NS, "line");
    el.setAttribute("class", "echo-word-line");
    el.setAttribute("x1", String(bb.x + bb.width + 5 * k));
    el.setAttribute("x2", String(bb.x + bb.width + (endPx - startPx + 5) * k));
    el.setAttribute("y1", String(y));
    el.setAttribute("y2", String(y));
    el.setAttribute("stroke", "#000000");
    el.setAttribute("stroke-width", String(Math.max(0.6, bb.height * 0.07)));
    el.setAttribute("stroke-dasharray", `${bb.height * 0.45} ${bb.height * 0.4}`);
    best.after(el);
  }
}
