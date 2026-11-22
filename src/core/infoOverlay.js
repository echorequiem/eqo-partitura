// infoOverlay.js — optional live values in a corner of the video, set in type rather than in boxes:
//   Notes: 524          (note heads sounded so far — the large line)
//   Speed: 5 n/s        (note heads per second, over the last two seconds)
//   Tempo: ♩ 82         (the tempo heard right now, rit. / accel. included)
// Italic Cormorant (the title-card serif, bundled), soft white with a dark shadow so it reads on any
// background — no box, no glow. Drawn by the same function in the page-3 preview (a canvas over the stage)
// and in the render, so both look alike.

export const INFO_CORNERS = ["tl", "tr", "bl", "br"];
export const DEFAULT_INFO = { notes: false, speed: false, bpm: false, corner: "tl" };
export const INFO_FONT = `"Cormorant Garamond Variable", "Cormorant Garamond", Georgia, serif`;
const SPEED_WINDOW = 2; // s

/** Normalised overlay settings (older projects have none). */
export function normalizeInfo(s) {
  const o = s || {};
  return {
    notes: !!o.notes,
    speed: !!o.speed,
    bpm: !!o.bpm,
    corner: INFO_CORNERS.includes(o.corner) ? o.corner : DEFAULT_INFO.corner
  };
}

export const infoActive = (info) => !!info && (info.notes || info.speed || info.bpm);

/** Loads the italic serif before the first frame (canvas text falls back silently otherwise). */
export function ensureInfoFont() {
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve();
  return Promise.all([
    document.fonts.load(`italic 500 40px ${INFO_FONT}`),
    document.fonts.load(`italic 600 40px ${INFO_FONT}`)
  ]).catch(() => {});
}

/** Live values from the playback engine at time t. */
export function infoValues(pb, t) {
  const time = Math.max(0, Math.min(t, pb.totalDuration || 0));
  const played = pb.notesPlayedAt(time);
  const w = Math.max(0.5, Math.min(SPEED_WINDOW, time));
  const speed = (played - pb.notesPlayedAt(time - w)) / w;
  return { played, total: pb.totalNotes || 0, speed, bpm: pb.tempoAt(time) };
}

/**
 * @param info    overlay settings { notes, speed, bpm, corner }
 * @param vals    infoValues(…)
 * @param labels  { notes, speed, perSecond, tempo } in the interface language
 */
export function drawInfoOverlay(ctx, W, H, info, vals, labels = {}) {
  if (!infoActive(info) || !vals) return;
  const L = { notes: "Notes", speed: "Speed", perSecond: "n/s", tempo: "Tempo", ...labels };
  const lines = [];
  if (info.notes) lines.push(`${L.notes}: ${vals.played}`);
  if (info.speed) lines.push(`${L.speed}: ${Math.round(vals.speed)} ${L.perSecond}`);
  if (info.bpm && Number.isFinite(vals.bpm)) lines.push(`${L.tempo}: ♩ ${Math.round(vals.bpm)}`);
  if (!lines.length) return;

  const u = Math.min(W, H) / 1080; // 1 at 1080p
  const big = 64 * u; // the first line
  const small = 42 * u; // the others
  const lead = 1.08;
  const marginX = 56 * u;
  const marginY = 44 * u;
  const right = info.corner === "tr" || info.corner === "br";
  const bottom = info.corner === "bl" || info.corner === "br";
  const sizes = lines.map((_, i) => (i === 0 ? big : small));
  const blockH = sizes.reduce((a, s) => a + s * lead, 0);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = right ? "right" : "left";
  // a dark, soft shadow (legibility on light pictures) — not a glow
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 14 * u;
  ctx.shadowOffsetY = 2 * u;
  const x = right ? W - marginX : marginX;
  let y = bottom ? H - marginY - blockH : marginY;
  lines.forEach((text, i) => {
    const size = sizes[i];
    y += size * lead;
    ctx.font = `italic ${i === 0 ? 600 : 500} ${size}px ${INFO_FONT}`;
    ctx.fillStyle = i === 0 ? "rgba(240, 236, 246, 0.86)" : "rgba(232, 228, 240, 0.72)";
    ctx.fillText(text, x, y - size * 0.18);
  });
  ctx.restore();
}
