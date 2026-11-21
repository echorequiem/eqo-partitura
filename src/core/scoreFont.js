// scoreFont.js — the text font of the score: Edwin, MuseScore's default text font (SIL OFL 1.1, MuseScore BVBA).
// Used ONLY inside the notation (tempo marks, words, tuplet / text marks…); the app UI keeps its own font.
// CRITICAL: an SVG drawn as an image (render, strip export) cannot see the page's fonts, so the font is
// embedded into that SVG as a data: URL (scoreFontCss).
import roman from "@vexflow-fonts/edwin/edwin-roman.woff2";
import bold from "@vexflow-fonts/edwin/edwin-bold.woff2";
import italic from "@vexflow-fonts/edwin/edwin-italic.woff2";
import boldItalic from "@vexflow-fonts/edwin/edwin-bold-italic.woff2";

export const SCORE_FONT = "Edwin";

const FACES = [
  { url: roman, weight: "normal", style: "normal" },
  { url: bold, weight: "bold", style: "normal" },
  { url: italic, weight: "normal", style: "italic" },
  { url: boldItalic, weight: "bold", style: "italic" }
];

let loading = null;
/** Registers and loads the faces once (OSMD measures text while laying out, so load before rendering). */
export function ensureScoreFont() {
  if (!loading) {
    loading = Promise.all(FACES.map(async (f) => {
      const face = new FontFace(SCORE_FONT, `url(${f.url}) format("woff2")`, { weight: f.weight, style: f.style });
      document.fonts.add(face);
      await face.load();
    })).catch((err) => console.warn("[score font]", err));
  }
  return loading;
}

// VexFlow hard-codes some text fonts (tempo "times", 8va "Serif"): every score text uses Edwin.
// Same rule in style.css for the preview.
const SCORE_TEXT_RULE = `text{font-family:"${SCORE_FONT}",serif !important}`;

let cssPromise = null;
/** @font-face rules with the font inlined, for SVG text rasterised as an image. */
export function scoreFontCss() {
  if (!cssPromise) {
    cssPromise = Promise.all(FACES.map(async (f) => {
      const buf = new Uint8Array(await (await fetch(f.url)).arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return `@font-face{font-family:"${SCORE_FONT}";font-weight:${f.weight};font-style:${f.style};src:url(data:font/woff2;base64,${btoa(bin)}) format("woff2")}`;
    })).then((rules) => rules.join("") + SCORE_TEXT_RULE).catch(() => "");
  }
  return cssPromise;
}

/** Adds the embedded font to a serialised SVG that contains text. */
export async function withScoreFont(svgText) {
  if (!/<text\b/.test(svgText)) return svgText;
  const css = await scoreFontCss();
  return css ? svgText.replace(/<svg\b[^>]*>/, (m) => `${m}<style>${css}</style>`) : svgText;
}
