// timelineBuilder.js — walks the OSMD cursor and builds:
//   steps : one per onset { x, beat, beats, fermataBeats } → scrolling and timing
//   items : glow items { startBeat, endBeat, elements, rects (with layer), slot } → each note / rest / beam /
//           slur / tie / expression lit for its OWN written duration
// CRITICAL: durations come from timestamp differences (not note lengths), so polyphony and rests never drift.
// CRITICAL: OSMD draws stems/beams of beamed notes, ledger lines and expressions OUTSIDE the note group —
//           they are collected separately (outsideParts, SPAN/POINT selectors). Class names are OSMD 2.3.1's.

const PAD = 1.5; // padding around highlight boxes (CSS px)

// expression marks drawn on the staff line, independent of the notes (OSMD 2.3.1 class names)
const SPAN_SELECTOR = ".vf-pedalmarking, .osmd-wedge, .vf-vibratobracket, .vf-textbracket"; // cover a range
const POINT_SELECTOR = ".osmd-dynamic"; // tek bir notaya aittir (p, f, sfz…)
const SPAN_MARGIN = 6; // px, also catch the note just before
const TRILL_LINE_REACH = 30; // px, wavy line → its trill note on the left

function resetCursor(cursor) {
  try {
    if (typeof cursor.reset === "function") cursor.reset();
    else if (typeof cursor.resetIterator === "function") cursor.resetIterator();
  } catch (_) { /* yoksay */ }
}

/** Iterator position in quarter beats, or null. */
function readBeat(it) {
  const frac = it.CurrentSourceTimestamp || it.currentTimeStamp || it.CurrentEnrolledTimestamp;
  if (frac && typeof frac.RealValue === "number") return frac.RealValue * 4;
  return null;
}

/** Fallback when rules.GNote is missing: sourceNote → GraphicalNote map from GraphicSheet.MeasureList. */
function buildGraphicalNoteMap(osmd) {
  const map = new Map();
  const measureList = (osmd.GraphicSheet && osmd.GraphicSheet.MeasureList) || [];
  for (const row of measureList) {
    for (const measure of row || []) {
      for (const se of (measure && measure.staffEntries) || []) {
        for (const gve of se.graphicalVoiceEntries || []) {
          for (const gn of gve.notes || []) {
            if (!gn || !gn.sourceNote) continue;
            const list = map.get(gn.sourceNote);
            if (list) list.push(gn);
            else map.set(gn.sourceNote, [gn]);
          }
        }
      }
    }
  }
  return map;
}

/** Graphical note(s) of a source note: rules.GNote first, then the MeasureList map. */
function findGraphicalNotes(osmd, note, ctx) {
  try {
    if (osmd.rules && typeof osmd.rules.GNote === "function") {
      const g = osmd.rules.GNote(note);
      if (g) return [g];
    }
  } catch (_) { /* use the fallback */ }
  if (!ctx.map) ctx.map = buildGraphicalNoteMap(osmd);
  return ctx.map.get(note) || [];
}

/** Parts drawn outside the note group: stem, ledger lines, flag ("notes" layer) and beams ("beam" layer). */
function outsideParts(gNote) {
  const parts = [];
  const add = (v, layer) => {
    if (!v) return;
    (Array.isArray(v) ? v : [v]).forEach((el) => el && parts.push({ el, layer }));
  };
  const parts_ = [["getStemSVG", "notes"], ["getLedgerLineSVGs", "notes"], ["getFlagSVG", "notes"], ["getBeamSVGs", "beam"]];
  for (const [fn, layer] of parts_) {
    try {
      if (typeof gNote[fn] === "function") add(gNote[fn](), layer);
    } catch (_) { /* part not present */ }
  }
  return parts;
}

function hasFermata(voiceEntry) {
  const arts = voiceEntry.Articulations || [];
  // ArticulationEnum: fermata = 10, invertedfermata = 11
  return arts.some((a) => a && (a.articulationEnum === 10 || a.articulationEnum === 11));
}

/** A rest (OSMD 2.3.1: Note.isRest()). Tied continuations are not new note heads either. */
function isRestNote(note) {
  try {
    if (typeof note.isRest === "function" ? note.isRest() : !note.Pitch) return true;
    const tie = note.NoteTie;
    return !!(tie && tie.StartNote && tie.StartNote !== note);
  } catch (_) {
    return false;
  }
}

/** Trill mark on the note (OrnamentEnum.Trill = 0 in OSMD 2.3.1). */
function hasTrill(note) {
  try {
    const oc = note.ParentVoiceEntry && note.ParentVoiceEntry.OrnamentContainer;
    return !!oc && oc.GetOrnament === 0;
  } catch (_) {
    return false;
  }
}

function rectOf(el, svgRect) {
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { x: r.left - svgRect.left, y: r.top - svgRect.top, w: r.width, h: r.height };
}

function collectStep(osmd, voices, svgRect, ctx) {
  if (!voices || voices.length === 0) return null;

  let minLen = Infinity;
  let maxLen = 0;
  let sumX = 0;
  let anchors = 0;
  let fermata = false;
  let restFermataBeats = 0; // fermatas on rest-only voices
  const elements = [];
  const rects = [];
  const seen = new Set();
  let left = Infinity;
  let right = -Infinity;

  const addEl = (el, isAnchor, layer = "notes") => {
    if (!el || seen.has(el)) return;
    const r = rectOf(el, svgRect);
    if (!r) return;
    seen.add(el);
    elements.push(el);
    rects.push({ x: r.x - PAD, y: r.y - PAD, w: r.w + PAD * 2, h: r.h + PAD * 2, layer });
    if (isAnchor) {
      sumX += r.x + r.w / 2;
      anchors++;
      left = Math.min(left, r.x);
      right = Math.max(right, r.x + r.w);
    }
  };

  for (const voiceEntry of voices) {
    const entryFermata = hasFermata(voiceEntry);
    for (const note of voiceEntry.Notes || []) {
      const quarter = note.Length && typeof note.Length.RealValue === "number" ? note.Length.RealValue * 4 : 0;
      if (typeof note.isRest === "function" && note.isRest()) {
        if (entryFermata && quarter > 0) restFermataBeats = Math.max(restFermataBeats, quarter);
        continue;
      }
      if (quarter > 0) {
        minLen = Math.min(minLen, quarter);
        maxLen = Math.max(maxLen, quarter);
      }
      if (entryFermata) fermata = true;

      for (const gNote of findGraphicalNotes(osmd, note, ctx)) {
        const group = gNote && typeof gNote.getSVGGElement === "function" ? gNote.getSVGGElement() : null;
        addEl(group, true); // akor = tek <g>; yinelenenler elenir
        for (const part of outsideParts(gNote)) addEl(part.el, false, part.layer);
      }
    }
  }

  if (anchors === 0 || minLen === Infinity) {
    // rests only: no step, but a fermata on them stretches the previous step
    return restFermataBeats > 0 ? { restOnly: true, restFermataBeats } : null;
  }
  if (restFermataBeats > 0) fermata = true; // a fermata rest in another voice holds everything
  return { x: sumX / anchors, left, right, elements, rects, minLen, maxLen, fermata };
}

/** Attaches pedals, hairpins etc. to the steps they cover (legacy step-based fallback). */
function attachExpressions(svg, svgRect, steps) {
  if (steps.length === 0) return;
  const push = (step, el, r) => {
    if (step.elements.includes(el)) return;
    step.elements.push(el);
    step.rects.push({ x: r.x - PAD, y: r.y - PAD, w: r.w + PAD * 2, h: r.h + PAD * 2, layer: "expr" });
  };

  svg.querySelectorAll(SPAN_SELECTOR).forEach((el) => {
    const r = rectOf(el, svgRect);
    if (!r) return;
    // a note is covered when its centre lies inside; no margin at the end (the pedal is released there)
    const x0 = r.x - SPAN_MARGIN;
    const x1 = r.x + r.w;
    for (const s of steps) {
      if (s.x >= x0 && s.x <= x1) push(s, el, r);
    }
  });

  svg.querySelectorAll(POINT_SELECTOR).forEach((el) => {
    const r = rectOf(el, svgRect);
    if (!r) return;
    let best = null;
    let bestD = Infinity;
    for (const s of steps) {
      const d = Math.abs(s._left - r.x); // a dynamic starts at its note's left edge
      if (d < bestD) { bestD = d; best = s; }
    }
    if (best && bestD < 40) push(best, el, r);
  });
}

const SVG_NS = "http://www.w3.org/2000/svg";
let beamClipSeq = 0;

/** Hidden copy of a beam, clipped to x0 … x1 (svg-relative CSS px), placed right after it. */
function beamCopy(el, r, x0, x1) {
  const svg = el.ownerSVGElement;
  if (!svg || !el.parentNode) return null;
  let bb;
  try { bb = el.getBBox(); } catch (_) { return null; }
  if (!(bb.width > 0) || !(r.w > 0)) return null;
  const kx = bb.width / r.w; // CSS px -> the beam's own user units
  const ky = bb.height > 0 && r.h > 0 ? bb.height / r.h : kx;
  let defs = svg.querySelector("defs.echo-beam-clips");
  if (!defs) {
    defs = document.createElementNS(SVG_NS, "defs");
    defs.setAttribute("class", "echo-beam-clips");
    svg.prepend(defs);
  }
  const clip = document.createElementNS(SVG_NS, "clipPath");
  clip.id = "echo-beam-clip-" + ++beamClipSeq;
  clip.setAttribute("clipPathUnits", "userSpaceOnUse");
  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("x", String(bb.x + (x0 - r.x) * kx));
  rect.setAttribute("width", String((x1 - x0) * kx));
  rect.setAttribute("y", String(bb.y - 30 * ky)); // room above and below for the glow
  rect.setAttribute("height", String(bb.height + 60 * ky));
  clip.append(rect);
  defs.append(clip);
  const copy = el.cloneNode(true);
  copy.removeAttribute("id");
  copy.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
  copy.classList.add("echo-beam-part");
  copy.setAttribute("visibility", "hidden"); // shown by .note-active (style.css); stays hidden in the video's base
  copy.setAttribute("clip-path", `url(#${clip.id})`);
  el.after(copy);
  return copy;
}

/** Removes the beam copies of an earlier build (the timeline is rebuilt on the same drawing). */
function clearBeamCopies(svg) {
  svg.querySelectorAll(".echo-beam-part, defs.echo-beam-clips").forEach((n) => n.remove());
}

/** Step-based fallback: a beam (given only to the group's FIRST note) is added to every step under it. */
function extendBeams(steps) {
  const beams = [];
  for (const s of steps) {
    s.rects.forEach((r, i) => { if (r.layer === "beam") beams.push({ el: s.elements[i], r }); });
  }
  for (const { el, r } of beams) {
    const x0 = r.x;
    const x1 = r.x + r.w;
    for (const s of steps) {
      if (s._right >= x0 && s._left <= x1 && !s.elements.includes(el)) {
        s.elements.push(el);
        s.rects.push(r);
      }
    }
  }
}

// =================================================================================================
// Glow items — slot 0 = first staff, 1 = other staves (second colour). Beats → seconds in playbackEngine.
// =================================================================================================

const MIN_GLOW_BEATS = 1 / 32; // grace notes etc. (no written length): a short flash

function makeRect(r, layer) {
  return { x: r.x - PAD, y: r.y - PAD, w: r.w + PAD * 2, h: r.h + PAD * 2, layer };
}

class ItemCollector {
  constructor(osmd, svgRect, ctx) {
    this.osmd = osmd;
    this.svgRect = svgRect;
    this.ctx = ctx;
    this.items = [];
    this.noteInfo = new Map(); // source Note -> { beat, len, slot }
    this.groupItem = new Map(); // note group element -> item (chord notes share one group)
    this.pendingSlurs = []; // { slur, els, slot }
    this.pendingTies = [];
    this.pendingBeams = []; // { beam, els, slot }
    this.seenSpanEls = new Set();
    this.staves = (osmd.Sheet && osmd.Sheet.Staves) || [];
    this.keys = []; // { beat, endBeat, midi, slot } — the keyboard view
  }

  /** MIDI number of a sounding note (null for rests / unpitched). */
  midiOf(note) {
    try {
      if (isRestNote(note)) return null;
      const ht = typeof note.halfTone === "number" ? note.halfTone : note.Pitch && note.Pitch.getHalfTone ? note.Pitch.getHalfTone() : null;
      if (!Number.isFinite(ht)) return null;
      const midi = Math.round(ht) + 12; // OSMD: halfTone 48 = middle C (MIDI 60)
      return midi >= 0 && midi <= 127 ? midi : null;
    } catch (_) {
      return null;
    }
  }

  addKey(note, beat, len, slot) {
    const midi = this.midiOf(note);
    if (midi === null) return;
    // a tied note keeps the key down: it lengthens the key of the note it is tied from
    const tie = note.NoteTie;
    if (tie && tie.StartNote && tie.StartNote !== note) {
      for (let i = this.keys.length - 1; i >= 0; i--) {
        const k = this.keys[i];
        if (k.midi === midi && Math.abs(k.endBeat - beat) < 1e-6) { k.endBeat = beat + len; return; }
      }
    }
    this.keys.push({ beat, endBeat: beat + len, midi, slot });
  }

  slotOf(note) {
    try {
      const idx = this.staves.indexOf(note.ParentStaff);
      return idx > 0 ? 1 : 0;
    } catch (_) {
      return 0;
    }
  }

  addNote(note, beat) {
    let len = note.Length && typeof note.Length.RealValue === "number" ? note.Length.RealValue * 4 : 0;
    if (!(len > 0)) len = MIN_GLOW_BEATS;
    const slot = this.slotOf(note);
    const info = { beat, len, slot, x: null };
    this.noteInfo.set(note, info);
    this.addKey(note, beat, len, slot);

    for (const gNote of findGraphicalNotes(this.osmd, note, this.ctx)) {
      const group = gNote && typeof gNote.getSVGGElement === "function" ? gNote.getSVGGElement() : null;
      if (!group) continue;
      // x of the note's stem (where it meets its beam); the note head's centre without a stem
      if (info.x === null) {
        let r = null;
        try { const st = gNote.getStemSVG && gNote.getStemSVG(); if (st) r = rectOf(st, this.svgRect); } catch (_) { r = null; }
        if (!r) r = rectOf(group, this.svgRect);
        if (r) info.x = r.x + r.w / 2;
      }
      // chord notes share one group: one item, lasting as long as the longest of them
      const existing = this.groupItem.get(group);
      const heads = isRestNote(note) ? 0 : 1;
      if (existing && Math.abs(existing.startBeat - beat) < 1e-9) {
        existing.endBeat = Math.max(existing.endBeat, beat + len);
        if (!(existing.noteCount >= 0)) existing.noteCount = 0;
        existing.noteCount += heads;
      } else {
        const item = { startBeat: beat, endBeat: beat + len, elements: [], rects: [], slot, noteCount: heads };
        if (hasTrill(note)) item.fx = "trill";
        this._addEl(item, group, "notes");
        for (const part of outsideParts(gNote)) {
          if (part.layer === "beam") continue; // beams become their own items (whole group)
          this._addEl(item, part.el, part.layer);
        }
        if (item.elements.length) {
          this.items.push(item);
          this.groupItem.set(group, item);
        }
      }

      // beam (OSMD gives it to the first note of the group), slurs and ties starting at this note
      let beamEls = [];
      try { beamEls = gNote.getBeamSVGs ? gNote.getBeamSVGs() || [] : []; } catch (_) { beamEls = []; }
      if (beamEls.length && note.NoteBeam) this.pendingBeams.push({ beam: note.NoteBeam, els: beamEls, slot });
      for (const slur of note.NoteSlurs || []) {
        if (slur && slur.StartNote === note) {
          let els = [];
          try { els = gNote.getSlurSVGs ? gNote.getSlurSVGs() || [] : []; } catch (_) { els = []; }
          if (els.length) this.pendingSlurs.push({ slur, els, slot });
        }
      }
      const tie = note.NoteTie;
      if (tie && tie.StartNote === note) {
        let els = [];
        try { els = gNote.getTieSVGs ? gNote.getTieSVGs() || [] : []; } catch (_) { els = []; }
        if (els.length) this.pendingTies.push({ tie, els, slot });
      }
    }
  }

  _addEl(item, el, layer) {
    if (!el || item.elements.includes(el)) return;
    const r = rectOf(el, this.svgRect);
    if (!r) return;
    item.elements.push(el);
    item.rects.push(makeRect(r, layer));
  }

  _spanItem(els, startBeat, endBeat, slot, layer, fx) {
    if (!(endBeat > startBeat)) return;
    const item = { startBeat, endBeat, elements: [], rects: [], slot };
    if (fx) item.fx = fx;
    for (const el of els) this._addEl(item, el, layer);
    if (item.elements.length) this.items.push(item);
  }

  /**
   * One note's part of a beam, between x = lo … hi (svg-relative CSS px; ±Infinity = the beam's end).
   * Preview: a hidden copy of the beam clipped to that part, shown while the note is lit.
   * Video: the beam layer, cut to the same part by the item's box.
   */
  _beamPart(els, lo, hi, startBeat, endBeat, slot) {
    if (!(endBeat > startBeat)) return;
    const item = { startBeat, endBeat, elements: [], rects: [], slot };
    for (const el of els) {
      const r = rectOf(el, this.svgRect);
      if (!r) continue;
      const x0 = Math.max(lo, r.x - PAD);
      const x1 = Math.min(hi, r.x + r.w + PAD);
      if (!(x1 > x0)) continue;
      // the outer ends get room for the glow; the cut between two notes is exact
      const copy = beamCopy(el, r, lo === -Infinity ? r.x - 14 : lo, hi === Infinity ? r.x + r.w + 14 : hi);
      if (!copy) continue;
      item.elements.push(copy);
      item.rects.push({ x: x0, y: r.y - PAD, w: x1 - x0, h: r.h + PAD * 2, layer: "beam" });
    }
    if (item.elements.length) this.items.push(item);
  }

  /** Beams, slurs and ties: from their first note's start to their last note's end. */
  resolveSpans() {
    const range = (notes) => {
      let s = Infinity, e = -Infinity;
      for (const n of notes) {
        const info = this.noteInfo.get(n);
        if (!info) continue;
        s = Math.min(s, info.beat);
        e = Math.max(e, info.beat + info.len);
      }
      return [s, e];
    };
    // a beam is shared out: every note lights its own part of it — from halfway to the note before to
    // halfway to the note after — for its own duration (two notes share the beam between them equally)
    for (const { beam, els, slot } of this.pendingBeams) {
      const pts = [];
      for (const n of beam.Notes || []) {
        const info = this.noteInfo.get(n);
        if (!info || info.x === null) continue;
        const p = pts.find((q) => Math.abs(q.x - info.x) < 1.5); // chord notes share one stem
        if (p) { p.s = Math.min(p.s, info.beat); p.e = Math.max(p.e, info.beat + info.len); }
        else pts.push({ x: info.x, s: info.beat, e: info.beat + info.len });
      }
      pts.sort((a, b) => a.x - b.x);
      if (pts.length < 2) {
        const [s, e] = range(beam.Notes || []);
        this._spanItem(els, s, e, slot, "beam");
        continue;
      }
      for (let i = 0; i < pts.length; i++) {
        const lo = i === 0 ? -Infinity : (pts[i - 1].x + pts[i].x) / 2;
        const hi = i === pts.length - 1 ? Infinity : (pts[i].x + pts[i + 1].x) / 2;
        this._beamPart(els, lo, hi, pts[i].s, pts[i].e, slot);
      }
    }
    for (const { slur, els, slot } of this.pendingSlurs) {
      const [s, e] = range([slur.StartNote, slur.EndNote].filter(Boolean));
      this._spanItem(els, s, e, slot, "expr", "flow");
    }
    for (const { tie, els, slot } of this.pendingTies) {
      const [s, e] = range(tie.Notes || [tie.StartNote]);
      this._spanItem(els, s, e, slot, "expr", "flow");
    }
  }

  /** Pedal, hairpins, trill lines, 8va (spans) and dynamics (points) — mapped to the steps under them. */
  resolveExpressions(svg, steps) {
    if (!steps.length) return;
    // vertical centre of each slot's notes → an expression goes with the nearer staff
    const centres = [0, 1].map((slot) => {
      const ys = [];
      for (const it of this.items) if (it.slot === slot && it.rects[0] && it.rects[0].layer === "notes") ys.push(it.rects[0].y + it.rects[0].h / 2);
      return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null;
    });
    const slotForY = (y) => {
      if (centres[1] === null) return 0;
      if (centres[0] === null) return 1;
      return Math.abs(y - centres[0]) <= Math.abs(y - centres[1]) ? 0 : 1;
    };
    const stepEnd = (s) => s.beat + s.beats;

    svg.querySelectorAll(SPAN_SELECTOR).forEach((el) => {
      const r = rectOf(el, this.svgRect);
      if (!r) return;
      const isTrillLine = el.classList.contains("vf-vibratobracket");
      // the trill's wavy line starts right of its "tr" note: reach back to that note
      const x0 = r.x - (isTrillLine ? TRILL_LINE_REACH : SPAN_MARGIN);
      const x1 = r.x + r.w;
      const covered = steps.filter((s) => s.x >= x0 && s.x <= x1);
      if (!covered.length) return;
      const fx = isTrillLine ? "trill" : undefined;
      this._spanItem([el], covered[0].beat, stepEnd(covered[covered.length - 1]), slotForY(r.y + r.h / 2), "expr", fx);
    });

    svg.querySelectorAll(POINT_SELECTOR).forEach((el) => {
      const r = rectOf(el, this.svgRect);
      if (!r) return;
      let best = null;
      let bestD = Infinity;
      for (const s of steps) {
        const d = Math.abs(s._left - r.x);
        if (d < bestD) { bestD = d; best = s; }
      }
      if (best && bestD < 40) this._spanItem([el], best.beat, stepEnd(best), slotForY(r.y + r.h / 2), "expr");
    });
  }
}

export function buildTimeline(osmd, containerEl) {
  const steps = [];
  steps.items = [];
  if (!osmd || !osmd.GraphicSheet || !osmd.cursor) return steps;

  const svg = containerEl.querySelector("svg");
  if (!svg) return steps;
  const svgRect = svg.getBoundingClientRect();
  if (!svgRect.width) return steps; // CRITICAL: hidden page = no measurements
  clearBeamCopies(svg);

  const cursor = osmd.cursor;
  resetCursor(cursor);
  const it = cursor.Iterator;
  if (!it) return steps;

  const raw = [];
  const ctx = { map: null }; // fallback graphical-note map (built once if needed)
  const collector = new ItemCollector(osmd, svgRect, ctx);
  let lastBeat = -Infinity;
  let guard = 0;

  while (!it.EndReached && guard++ < 500000) {
    const beat = readBeat(it);
    // repeats rewind the timestamp: the strip is taken once, as written
    const isRepeatPass = beat !== null && beat <= lastBeat + 1e-9;

    if (!isRepeatPass) {
      if (beat !== null) {
        for (const ve of it.CurrentVoiceEntries || []) {
          for (const note of ve.Notes || []) collector.addNote(note, beat); // notes AND rests
        }
      }
      const info = collectStep(osmd, it.CurrentVoiceEntries, svgRect, ctx);
      if (info && info.restOnly) {
        if (raw.length) raw[raw.length - 1].restFermataBeats += info.restFermataBeats;
      } else if (info) {
        raw.push({ ...info, beat, restFermataBeats: 0 });
      }
      if (beat !== null) lastBeat = beat;
    }
    it.moveToNext();
  }

  resetCursor(cursor);
  if (raw.length === 0) return steps;

  const hasBeats = raw.every((r) => r.beat !== null);
  let acc = 0;
  for (let i = 0; i < raw.length; i++) {
    const cur = raw[i];
    const next = raw[i + 1];
    let beats;
    if (hasBeats) beats = next ? next.beat - cur.beat : cur.maxLen; // last step: its longest note
    else beats = cur.minLen; // no timestamps: note length
    beats = Math.max(beats, 1e-4);

    // a fermata note stretches the whole step, a fermata rest only its own length (as MuseScore does)
    const fermataBeats = Math.min(beats, (cur.fermata ? beats : 0) + cur.restFermataBeats);

    steps.push({
      x: cur.x,
      beat: hasBeats ? cur.beat : acc,
      beats,
      fermataBeats,
      elements: cur.elements,
      rects: cur.rects,
      _left: cur.left,
      _right: cur.right
    });
    acc += beats;
  }

  attachExpressions(svg, svgRect, steps);
  extendBeams(steps);

  if (hasBeats) {
    collector.resolveSpans();
    collector.resolveExpressions(svg, steps);
    steps.items = collector.items.sort((a, b) => a.startBeat - b.startBeat);
    steps.keys = collector.keys.sort((a, b) => a.beat - b.beat);
  } else {
    // no timestamps (very unusual): fall back to "lit until the next note" per step
    steps.items = steps.map((s) => ({ startBeat: s.beat, endBeat: s.beat + s.beats, elements: s.elements, rects: s.rects, slot: 0 }));
  }
  steps.hasSecondStaff = steps.items.some((i) => i.slot === 1);
  for (const s of steps) { delete s._left; delete s._right; }
  return steps;
}
