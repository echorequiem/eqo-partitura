import * as OSMDModule from "opensheetmusicdisplay";
import { SCORE_FONT, ensureScoreFont } from "./scoreFont.js";

const OpenSheetMusicDisplay =
  OSMDModule.OpenSheetMusicDisplay ||
  (OSMDModule.default && OSMDModule.default.OpenSheetMusicDisplay) ||
  OSMDModule.default;

// Patch for OSMD's internal "start index of line is greater than the end index" error (zero-width containers).
function applyOSMDPatch() {
  const Calc =
    OSMDModule.SkyBottomLineCalculator ||
    (OSMDModule.default && OSMDModule.default.SkyBottomLineCalculator) ||
    (typeof window !== "undefined" && window.opensheetmusicdisplay && window.opensheetmusicdisplay.SkyBottomLineCalculator);

  if (Calc && Calc.prototype && !Calc.prototype._isEchoNotesPatched) {
    Calc.prototype.updateInRange = function (t, e = 0, i = t ? t.length : 0, s = 0) {
      if (!t || t.length === 0) return;
      let start = Math.floor(e * this.SamplingUnit);
      let end = Math.ceil(i * this.SamplingUnit);

      if (end < start) {
        const temp = start;
        start = end;
        end = temp;
      }

      start = Math.max(0, start);
      end = Math.min(t.length, end);

      for (let n = start; n < end; n++) {
        t[n] = Math.abs(s) > Math.abs(t[n]) ? s : t[n];
      }
    };
    Calc.prototype._isEchoNotesPatched = true;
  }
}

applyOSMDPatch();

export class ScoreManager {
  constructor(containerEl) {
    this.containerEl = containerEl;
    applyOSMDPatch();

    this.osmd = new OpenSheetMusicDisplay(containerEl, {
      autoResize: false,
      backend: "svg",
      drawingParameters: "default",
      renderSingleHorizontalStaffline: true, // CRITICAL: one continuous line
      drawPartNames: false,
      drawTitle: false,
      drawSubtitle: false,
      drawComposer: false,
      drawLyricist: false,
      drawCredits: false,
      drawFingerings: false,
      drawMeasureNumbers: false, // not needed in a scrolling video
      defaultFontFamily: SCORE_FONT // MuseScore's text font, notation only
    });

    this._applyRules();
    this.currentZoom = 0.7;
  }

  _applyRules() {
    const r = this.osmd.rules;
    if (!r) return;
    r.RenderSingleHorizontalStaffline = true;
    // CRITICAL: default 32767 breaks long pieces onto a second line the strip can't show (SVG has no such limit).
    r.SheetMaximumWidth = 1e7;
    r.RenderCredits = false;
    r.RenderTitle = false;
    r.RenderSubtitle = false;
    r.RenderComposer = false;
    r.RenderLyricist = false;
    r.RenderPartNames = false;
    r.RenderMeasureNumbers = false;
    r.DefaultFontFamily = SCORE_FONT;
  }

  // 70 or 0.7 → ratio in 0.2…3.0
  _normalizeZoom(zoom) {
    let z = Number(zoom);
    if (!Number.isFinite(z) || z <= 0) z = 0.7;
    if (z > 5) z = z / 100;
    return Math.min(3.0, Math.max(0.2, z));
  }

  // Reads UTF-8 / UTF-16 text; returns null for a compressed .mxl (ZIP), which OSMD opens itself as a Blob.
  async _readXmlText(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    if (buf.length > 1 && buf[0] === 0x50 && buf[1] === 0x4b) return null;

    let text;
    if (buf.length > 1 && buf[0] === 0xff && buf[1] === 0xfe) text = new TextDecoder("utf-16le").decode(buf);
    else if (buf.length > 1 && buf[0] === 0xfe && buf[1] === 0xff) text = new TextDecoder("utf-16be").decode(buf);
    else text = new TextDecoder("utf-8").decode(buf);

    return text
      .replace(/^\uFEFF/, "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .trim();
  }

  async loadFromFile(file, zoom = 0.7) {
    this.currentZoom = this._normalizeZoom(zoom);
    this.osmd.zoom = this.currentZoom;

    let cleanXml;
    try {
      cleanXml = await this._readXmlText(file);
    } catch (error) {
      throw new Error("MusicXML: " + error.message);
    }
    const isMxl = cleanXml === null;

    try {
      await ensureScoreFont(); // text widths are measured during layout
      this._applyRules();
      await this.osmd.load(isMxl ? file : cleanXml, file.name);
      // CRITICAL: load() resets the zoom — set it again AFTER loading.
      this.osmd.zoom = this.currentZoom;
      this._applyRules();
      await this.osmd.render();
      this._fixSvgSize();
      return this.osmd;
    } catch (error) {
      console.error("OSMD yükleme hatası:", error);
      const err = new Error(error && error.message ? error.message : String(error));
      if (isMxl) err.code = "MXL_FAILED";
      throw err;
    }
  }

  /** Tempo written in the score (quarter BPM): { hasInfo, startBpm, changes: [{ beat, bpm }] } (measure starts). */
  getScoreTempo() {
    const sheet = this.osmd && this.osmd.Sheet;
    if (!sheet) return null;
    const startBpm = Number(sheet.DefaultStartTempoInBpm) || 0;
    const changes = [];
    let prev = startBpm;
    for (const m of sheet.SourceMeasures || []) {
      const bpm = Number(m.TempoInBPM) || 0;
      const ts = m.AbsoluteTimestamp;
      if (bpm > 0 && ts && Math.abs(bpm - prev) > 0.01) {
        changes.push({ beat: ts.RealValue * 4, bpm });
        prev = bpm;
      }
    }
    return { hasInfo: !!sheet.HasBPMInfo, startBpm, changes };
  }

  async setZoom(zoom) {
    this.currentZoom = this._normalizeZoom(zoom);
    this.osmd.zoom = this.currentZoom;
    this._applyRules();
    await this.osmd.render();
    this._fixSvgSize();
  }

  /**
   * CRITICAL: the viewBox is the UNZOOMED size (width = viewBox × zoom). OSMD caps width at 32767 px;
   * restore the expected size only when the drawn one is smaller (never touch normal zoom levels).
   */
  _fixSvgSize() {
    const z = this.osmd.zoom || this.currentZoom || 1;
    for (const svg of this.containerEl.querySelectorAll("svg")) {
      const vb = (svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
      if (vb.length !== 4 || !(vb[2] > 0) || !(vb[3] > 0)) continue;
      const w = Number(svg.getAttribute("width"));
      const expectedW = vb[2] * z;
      if (Number.isFinite(w) && w < expectedW - 1) {
        svg.setAttribute("width", String(expectedW));
        svg.setAttribute("height", String(vb[3] * z));
      }
    }
  }
}
