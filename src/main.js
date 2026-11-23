import "./styles/fonts.js";
import "./styles/diapason.css"; // shared Echo design language (Echo Masterworks), used unchanged
import "./styles/style.css";
import { buildTimeline } from "./core/timelineBuilder.js";
import { drawWordLines } from "./core/tempoWords.js";
import { PlaybackEngine, DEFAULT_FERMATA_STRETCH } from "./core/playbackEngine.js";
import { InlineColorPicker, normalizeHex } from "./ui/colorPicker.js";
import { AmbientFxOverlay, drawAmbientFx, DEFAULT_FX_INTENSITY } from "./core/ambientFx.js";
import {
  drawCard, defaultCard, cardDuration, listDuration, cardSettings, ensureCardFonts, cardPhaseAt, isSequential,
  CARD_TEMPLATES, TEXT_ORDERS
} from "./core/titleCards.js";
import { RenderEngine, getRenderDimensions, ASPECTS, LEAD_IN_SECONDS } from "./core/renderEngine.js";
import { decodeAudioFile } from "./core/audioEngine.js";
import { translate, applyStaticTranslations } from "./i18n.js";
import * as projectStore from "./platform/projectStore.js";
import { openVideoSink, saveImages, showInFolder, appInfo } from "./platform/output.js";
import { alertDialog, confirmDialog, showDialog, isDialogOpen } from "./ui/dialogs.js";
import { BG_PRESETS, makePresetFile, drawPresetThumb } from "./core/bgPresets.js";
import { drawKeyboard, keyboardHeight, keyboardRange } from "./core/keyboardOverlay.js";
import { DEFAULT_INFO, normalizeInfo, drawInfoOverlay, infoValues, infoActive, ensureInfoFont, meanLuma } from "./core/infoOverlay.js";
import { Sfx } from "./ui/sound.js";
import { createLangPicker } from "./ui/langPicker.js";
import { createRenderSpinner } from "./ui/renderSpinner.js";

// =================================================================================================
// 1) DOM references (a missing id throws immediately)
// =================================================================================================
const $ = (id) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`index.html içinde #${id} bulunamadı`);
  return el;
};
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const pages = { 1: $("page-1"), 2: $("page-2"), 3: $("page-3"), 4: $("page-4"), 5: $("page-5") };
const stepIndicators = { 1: $("step-ind-1"), 2: $("step-ind-2"), 3: $("step-ind-3"), 4: $("step-ind-4"), 5: $("step-ind-5") };

const languageSelect = $("language-select");
const langPicker = createLangPicker(languageSelect); // Echo-styled menu over the (hidden) native select
const themeButtons = $$("#theme-switch button");
const appVersionEl = $("app-version");

// Page 1
const fileInput = $("file-input");
const musicDropTrigger = $("music-drop-trigger");
const musicLoadedState = $("music-loaded-state");
const musicLoadedText = $("music-loaded-text");
const musicDropZoneWrap = $("music-drop-zone-wrap");
const projectsListContainer = $("projects-list-container");
const fpsButtons = $$("#fps-group .pill");
const aspectButtons = $$("#aspect-group .pill");
const resButtons = $$("#res-group .pill");
const bitrateButtons = $$("#bitrate-group .pill");
const BITRATES = [0, 8, 16, 32, 50]; // Mbit/s choices on page 1 (0 = automatic)
const colorBtns = $$("#preset-colors .color-btn");
const savedColorsEl = $("saved-colors");
const saveColorBtn = $("save-color-btn");
const svBox = $("sv-box");
const svCursor = $("sv-cursor");
const hueBar = $("hue-bar");
const hueCursor = $("hue-cursor");
const colorHexInput = $("color-hex-input");
const nextToPage2Btn = $("next-to-page2");

// Page 2 — background
const backToPage1Btn = $("back-to-page1");
const nextToPage3Btn = $("next-to-page3");
const bgMediaInput = $("bg-media-input");
const bgDropZoneWrap = $("bg-drop-zone-wrap");
const bgDropLabel = $("bg-drop-label");
const bgLoadedState = $("bg-loaded-state");
const bgLoadedText = $("bg-loaded-text");
const bgClearBtn = $("bg-clear-btn");
const bgLoopBtn = $("bg-loop-btn");
const bgStageWrapper = $("bg-stage-wrapper");
const bgStageViewport = $("bg-stage-viewport");
const bgStageImg = $("bg-stage-img");
const bgStageVideo = $("bg-stage-video");
const bgScaleRange = $("bg-scale-range");
const bgScaleVal = $("bg-scale-val");
const bgOpacityRange = $("bg-opacity-range");
const bgOpacityVal = $("bg-opacity-val");
const bgPosXRange = $("bg-pos-x-range");
const bgPosXVal = $("bg-pos-x-val");
const bgPosYRange = $("bg-pos-y-range");
const bgPosYVal = $("bg-pos-y-val");
const bgGrayscaleBtn = $("bg-grayscale-btn");
const bgPresetGrid = $("bg-preset-grid");

// Page 2 — music
const audioInput = $("audio-input");
const audioDropZoneWrap = $("audio-drop-zone-wrap");
const audioDropLabel = $("audio-drop-label");
const audioLoadedState = $("audio-loaded-state");
const audioLoadedText = $("audio-loaded-text");
const audioClearBtn = $("audio-clear-btn");
const audioControls = $("audio-controls");
const audioVolumeRange = $("audio-volume-range");
const audioVolumeVal = $("audio-volume-val");
const audioOffsetInput = $("audio-offset-input");
const audioOffsetRange = $("audio-offset-range");
const audioPreviewBtn = $("audio-preview-btn");

// Page 3
const backToPage2Btn = $("back-to-page2");
const toPage4Btn = $("to-page4");
const saveProjectBtn2 = $("save-project-btn-2");
const saveProjectBtn3 = $("save-project-btn-3");
const bpmInput = $("bpm-input");
const playheadToggle = $("playhead-toggle");
const zoomRange = $("zoom-range");
const zoomVal = $("zoom-val");
const playBtn = $("play-btn");
const resetBtn = $("reset-btn");
const animThemeButtons = $$("#anim-theme-group .pill-mini");
const configSummaryText = $("config-summary-text");
const exportStripBtn = $("export-strip-btn");
const stripExportModal = $("strip-export-modal");
const stripModalCancel = $("strip-modal-cancel");
const stripFmtBtns = $$(".strip-fmt-btn");
const stripBgBlur = $("strip-bg-blur");
const stripBgRow = $("strip-bg-row");
const stripBgHint = $("strip-bg-hint");
const viewportWrapper = $("viewport-wrapper");
const viewportEl = $("viewport");
const previewBgImg = $("preview-bg-img");
const previewBgVideo = $("preview-bg-video");
const trackEl = $("score-track");
const osmdContainer = $("osmd-container");
const scoreDiamondsLayer = $("score-diamonds-layer");
const scoreLoadingEl = $("score-loading");
const diamondTrack = $("diamond-track");
const lblDiamondCount = $("lbl-diamond-count");
const addDiamondBtn = $("add-diamond-btn");
const diamondModal = $("diamond-modal");
const modalBpmInput = $("modal-bpm-input");
const modalSaveBtn = $("modal-save-btn");
const modalCancelBtn = $("modal-cancel-btn");
const modalDeleteBtn = $("modal-delete-btn");
const audioOffsetMini = $("audio-offset-mini");
const audioOffsetInput3 = $("audio-offset-input-3");
const seekRange = $("seek-range");
const timeCurrentEl = $("time-current");
const timeTotalEl = $("time-total");
const fermataRange = $("fermata-range");
const fermataVal = $("fermata-val");
const infoCanvas = $("info-canvas");
const infoBpmToggle = $("info-bpm-toggle");
const infoNotesToggle = $("info-notes-toggle");
const infoSpeedToggle = $("info-speed-toggle");
const infoCornerButtons = $$("#info-corner-group .pill-mini");

// Page 4
const backToPage3Btn = $("back-to-page3"); // on page 4 (Preview)
const toPage5Btn = $("to-page5");
const backToPage4Btn = $("back-to-page4"); // on page 5 (Export)
const summaryFileName = $("summary-file-name");
const summaryBgName = $("summary-bg-name");
const formatPills = $$(".format-pill");
const renderBtn = $("render-btn");
const renderCancelBtn = $("render-cancel-btn");
const renderPauseBtn = $("render-pause-btn");
let renderPausedTotal = 0; // ms spent paused (excluded from the remaining-time estimate)
const renderOpenBtn = $("render-open-btn");
const renderProgressBar = $("render-progress-bar");
const renderActionArea = $("render-action-area");
const renderPct = $("render-pct");
// the Echo spiral turns while the card has the "rendering" class (setRenderVisual / pause / resume)
const renderSpinner = createRenderSpinner({ canvas: $("render-loader"), area: renderActionArea, pctEl: renderPct });
const renderEta = $("render-eta");
const successDesc = $("success-desc");
const restartBtn = $("restart-btn");

// =================================================================================================
// 2) State and engines
// =================================================================================================
const appState = {
  lang: "en", // default; the user's choice is remembered (LANG_KEY)
  musicFile: null,
  musicFileName: "",
  applyScoreTempo: false, // apply the score's tempo once for a new file
  fps: 60,
  aspect: "16-9",
  resolution: "1080p",
  bitrate: 0, // video bitrate in Mbit/s; 0 = automatic (from size and frame rate)
  appTheme: "dark",
  animTheme: "light",
  activeColor: "#FF0000",
  activeColor2: "#0055FF", // second staff (piano left hand etc.), used when dualColor is on
  dualColor: false,
  colorTarget: "a",
  savedColors: [], // user's saved colours (all projects, this computer)
  fx: { fogOn: false, fog: DEFAULT_FX_INTENSITY, embersOn: false, embers: DEFAULT_FX_INTENSITY },
  cards: { intro: [], outro: [] }, // intro / outro: ordered lists of screens (video and/or text)
  cardEditing: { list: "intro", index: -1 },
  scoreMeta: { title: "", composer: "" }, // from the MusicXML, prefills text screens
  fermataStretch: DEFAULT_FERMATA_STRETCH,
  format: "mp4",
  isScoreLoaded: false,
  showPlayhead: true,
  keyboard: false, // piano keyboard along the bottom of the video (core/keyboardOverlay.js)
  info: { ...DEFAULT_INFO }, // live tempo / notes played in a corner of the video (core/infoOverlay.js)
  leadIn: true, // video only: notes settle in before the music (LEAD_IN_SECONDS) and are wiped away after it
  tempoDiamonds: [], // { id, xPx, ratio, bpm }; ratio = xPx / svg width (zoom-independent)
  layout: null, // measured on page 3, used by the renderer
  projectId: null,
  rendering: false,
  statusKey: "readyToRender",
  lastOutputPath: null,
  bgFile: null,
  bgSettings: {
    type: null,
    fileName: "",
    url: null,
    scale: 100,
    opacity: 50,
    posX: 0,
    posY: 0,
    grayscale: false,
    loop: true,
    preset: null // id of a ready-made background (core/bgPresets.js) while one is in use
  },
  audio: {
    file: null,
    name: "",
    url: null,
    buffer: null, // decoded AudioBuffer
    loading: false,
    offset: 0, // sn — audioTime = videoTime - offset
    volume: 100, // %
    extendToAudio: false
  }
};

const tr = (key, vars) => translate(appState.lang, key, vars);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

let currentPage = 1;

// CRITICAL (startup speed): OSMD is ~1.2 MB of JS — loaded on demand (and prefetched when idle), not at start.
let scoreManager = null;
let scoreManagerLoading = null;
function getScoreManager() {
  if (!scoreManagerLoading) {
    scoreManagerLoading = import("./core/scoreManager.js").then((m) => (scoreManager = new m.ScoreManager(osmdContainer)));
  }
  return scoreManagerLoading;
}
const engine = new PlaybackEngine({
  viewportEl,
  trackEl,
  onFinish: () => {
    playBtn.textContent = tr("play");
  },
  onPlay: (t) => audioSyncPlay(t),
  onStop: () => audioSyncStop(),
  onTick: (t) => { updateTimeUi(t); drawInfoPreview(t); }
});
const renderEngine = new RenderEngine({
  playbackEngine: engine,
  appState,
  getLayout: () => appState.layout,
  osmdContainer
});

// =================================================================================================
// 3) Helpers
// =================================================================================================
function describeError(err) {
  const map = {
    NO_NOTES: "renderNoNotes",
    NO_LAYOUT: "renderNoLayout",
    NO_WEBCODECS: "renderNoWebCodecs",
    NO_ENCODER: "renderNoEncoder",
    MXL_FAILED: "scoreMxl"
  };
  if (err && err.code && map[err.code]) return tr(map[err.code]);
  return err && err.message ? err.message : String(err);
}

// a short message at the bottom of the window that goes by itself (undo, autosave, templates, tap tempo)
let toastEl = null;
let toastTimer = 0;
function toast(message) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "app-toast d-glass";
    toastEl.setAttribute("role", "status");
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1800);
}

function notify(message, kind = "info") {
  return alertDialog({
    title: tr(kind === "error" ? "dialogError" : "dialogInfo"),
    message,
    okLabel: tr("dialogOk"),
    kind
  });
}

function baseNameOfMusic() {
  return (appState.musicFileName || "").replace(/\.[^/.]+$/, "") || "Eqo Partitura";
}

function formatSeconds(s) {
  if (!Number.isFinite(s)) return "";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// =================================================================================================
// 4) Language / dynamic texts
// =================================================================================================
function refreshMusicFileState() {
  const has = !!appState.musicFile;
  musicLoadedText.textContent = has ? `${tr("ready")} (${appState.musicFileName})` : "";
  musicDropTrigger.style.display = has ? "none" : ""; // "" = CSS default (flex)
  musicLoadedState.style.display = has ? "flex" : "none";
  nextToPage2Btn.disabled = !has;
  if (typeof refreshStepLocks === "function") refreshStepLocks();
}

function refreshBgState() {
  const has = !!appState.bgSettings.type;
  bgDropLabel.style.display = has ? "none" : "flex";
  bgLoadedState.style.display = has ? "flex" : "none";
  bgLoadedText.textContent = has
    ? `${tr(appState.bgSettings.type === "video" ? "videoLabel" : "imageLabel")}: ${appState.bgSettings.fileName}`
    : "";
  // toggle rows: the label stays, ✓ / ✗ comes from the "on" class
  bgLoopBtn.classList.toggle("on", !!appState.bgSettings.loop);
  bgGrayscaleBtn.classList.toggle("on", !!appState.bgSettings.grayscale);
  for (const b of bgPresetGrid.children) b.classList.toggle("active", b.dataset.preset === appState.bgSettings.preset);
}

function refreshAudioState() {
  const a = appState.audio;
  const has = !!a.file;
  audioDropLabel.style.display = has ? "none" : "flex";
  audioLoadedState.style.display = has ? "flex" : "none";
  const dur = a.buffer ? ` (${formatSeconds(a.buffer.duration)})` : a.loading ? " …" : "";
  audioLoadedText.textContent = has ? `${tr("audioLabel")}: ${a.name}${dur}` : "";
  audioControls.classList.toggle("disabled", !a.buffer);
  audioPreviewBtn.textContent = audioPreviewPlaying ? tr("audioStop") : tr("audioPreview");
  audioOffsetMini.style.display = a.buffer ? "" : "none";
}

function syncAudioControls() {
  const a = appState.audio;
  audioVolumeRange.value = a.volume;
  audioVolumeVal.textContent = String(a.volume);
  audioOffsetRange.value = clamp(a.offset, -30, 30);
  audioOffsetInput.value = String(a.offset);
  audioOffsetInput3.value = String(a.offset);
}

function refreshSummary() {
  const music = appState.musicFileName || tr("noFile");
  summaryFileName.textContent = appState.audio.file ? `${music}  ·  ♪ ${appState.audio.name}` : music;
  const { width, height } = getRenderDimensions(appState.aspect, appState.resolution);
  const bgName = appState.bgSettings.type ? appState.bgSettings.fileName : tr("bgNone");
  const parts = [];
  for (const kind of ["intro", "outro"]) {
    const d = listDuration(appState.cards[kind]);
    if (d > 0) parts.push(`${tr(kind === "intro" ? "cardIntro" : "cardOutro")} ${d.toFixed(1)} s`);
  }
  summaryBgName.textContent = `${bgName} (${width}×${height} • ${appState.fps} FPS)${parts.length ? " • " + parts.join(" • ") : ""}`;
}

function updateConfigSummary() {
  const resMap = { "720p": "720p", "1080p": "1080p", "2k": "2K", "4k": "4K" };
  configSummaryText.textContent =
    `${appState.fps} FPS • ${resMap[appState.resolution] || appState.resolution} • ${appState.aspect.replace("-", ":")}` +
    (appState.bitrate ? ` • ${appState.bitrate} Mbps` : "");
}

// ---- Look templates (page 3): colours, theme, note size, playhead, effects, background placement, live info ----
const TEMPLATES_KEY = "eqo.lookTemplates";
const MAX_TEMPLATES = 30;
const templateModal = $("template-modal");
const templateList = $("template-list");
const templateName = $("template-name");
function loadTemplates() {
  try {
    const list = JSON.parse(localStorage.getItem(TEMPLATES_KEY) || "[]");
    return Array.isArray(list) ? list.filter((t) => t && typeof t.name === "string" && t.look).slice(0, MAX_TEMPLATES) : [];
  } catch (_) {
    return [];
  }
}
function storeTemplates(list) {
  try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(list.slice(0, MAX_TEMPLATES))); } catch (_) { /* storage full / blocked */ }
}
function currentLook() {
  const s = collectSettings();
  return {
    activeColor: s.activeColor, activeColor2: s.activeColor2, dualColor: s.dualColor, animTheme: s.animTheme,
    zoom: s.zoom, showPlayhead: s.showPlayhead, info: s.info, fx: s.fx, keyboard: s.keyboard,
    bg: { scale: s.bg.scale, opacity: s.bg.opacity, posX: s.bg.posX, posY: s.bg.posY, grayscale: s.bg.grayscale, preset: s.bg.preset }
  };
}
function applyLook(look) {
  const cur = collectSettings();
  const zoomBefore = Number(zoomRange.value);
  const { preset, ...bg } = look.bg || {};
  applySettings({ ...cur, ...look, bg: { ...cur.bg, ...bg } }, { keepCards: true });
  if (Number(zoomRange.value) !== zoomBefore) applyZoom();
  // a template made with a ready-made background brings it along (a picture of the user's own stays)
  if (preset && BG_PRESETS.includes(preset) && preset !== appState.bgSettings.preset) applyPreset(preset);
}
function renderTemplateList() {
  const list = loadTemplates();
  templateList.textContent = "";
  if (!list.length) {
    const p = document.createElement("div");
    p.className = "template-empty";
    p.textContent = tr("tplEmpty");
    templateList.appendChild(p);
    return;
  }
  list.forEach((t, i) => {
    const row = document.createElement("div");
    row.className = "template-item";
    const sw = document.createElement("span");
    sw.className = "tpl-swatch";
    sw.style.background = normalizeHex(t.look.activeColor) || "#888";
    const name = document.createElement("span");
    name.className = "tpl-name";
    name.textContent = t.name;
    const use = document.createElement("button");
    use.className = "d-btn is-sm is-positive";
    use.textContent = tr("apply");
    use.addEventListener("click", () => {
      applyLook(t.look);
      templateModal.style.display = "none";
      toast(tr("tplApplied", { name: t.name }));
    });
    const del = document.createElement("button");
    del.className = "d-btn is-sm is-danger";
    del.textContent = tr("tplDelete");
    del.addEventListener("click", () => {
      const all = loadTemplates();
      all.splice(i, 1);
      storeTemplates(all);
      renderTemplateList();
    });
    row.append(sw, name, use, del);
    templateList.appendChild(row);
  });
}
$("templates-btn").addEventListener("click", () => {
  renderTemplateList();
  templateName.value = "";
  templateModal.style.display = "flex";
  templateName.focus();
});
$("template-close").addEventListener("click", () => { templateModal.style.display = "none"; });
templateModal.addEventListener("mousedown", (e) => { if (e.target === templateModal) templateModal.style.display = "none"; });
function saveTemplate() {
  const name = templateName.value.trim().slice(0, 40);
  if (!name) { templateName.focus(); return; }
  const list = loadTemplates().filter((t) => t.name !== name); // same name: replaced
  list.unshift({ name, look: currentLook() });
  storeTemplates(list);
  templateName.value = "";
  renderTemplateList();
  toast(tr("tplSaved", { name }));
}
$("template-save").addEventListener("click", saveTemplate);
templateName.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); saveTemplate(); } });


function refreshDynamicTexts() {
  refreshMusicFileState();
  refreshBgState();
  refreshAudioState();
  playBtn.textContent = engine.isPlaying ? tr("pause") : tr("play");
  updateFinalUi();
  lblDiamondCount.textContent = tr("diamondCount", { n: appState.tempoDiamonds.length });
  refreshSummary();
  refreshProjectsList();
  renderSavedColors();
  applyFx();
  refreshCardEditor();
  if (appState.statusKey) successDesc.textContent = tr(appState.statusKey);
  refreshRangeFills();
  refreshStepLocks();
  refreshPresetTitles();
  setInfo(appState.info); // the overlay's words follow the language
}

const LANG_KEY = "eqo-partitura-lang";
function savedLanguage() {
  try { const v = localStorage.getItem(LANG_KEY); return v && [...languageSelect.options].some((o) => o.value === v) ? v : null; } catch (_) { return null; }
}

function changeLanguage(lang) {
  appState.lang = lang;
  try { localStorage.setItem(LANG_KEY, lang); } catch (_) { /* private mode: not remembered */ }
  languageSelect.value = lang;
  langPicker.sync();
  applyStaticTranslations(lang);
  refreshDynamicTexts();
}

// =================================================================================================
// 5) Stage sizing (largest box of the chosen aspect ratio that fits)
// =================================================================================================
function fitBox(box, wrapper) {
  const [aw, ah] = ASPECTS[appState.aspect] || ASPECTS["16-9"];
  const availW = wrapper.clientWidth;
  const availH = wrapper.clientHeight;
  if (availW < 20 || availH < 20) return; // sayfa gizli
  let w = availW;
  let h = (w * ah) / aw;
  if (h > availH) {
    h = availH;
    w = (h * aw) / ah;
  }
  box.style.width = `${Math.floor(w)}px`;
  box.style.height = `${Math.floor(h)}px`;
}

function refitViewports() {
  fitBox(bgStageViewport, bgStageWrapper);

  const before = viewportEl.clientWidth;
  fitBox(viewportEl, viewportWrapper);
  const after = viewportEl.clientWidth;

  // keep the current note centred when the width changes
  if (before > 0 && after > 0 && before !== after && appState.isScoreLoaded && !engine.isPlaying) {
    const x = before / 2 - Number(trackEl.dataset.currentX || 0);
    const translateX = after / 2 - x;
    trackEl.style.transform = `translate(${translateX}px, -50%)`;
    trackEl.dataset.currentX = String(translateX);
  }
  if (currentPage === 3 && appState.isScoreLoaded && after > 0) measureLayout();
  syncKeyboardShift();
  if (appState.isScoreLoaded) drawInfoPreview(engine.getTime());
}

/** Measurements for the renderer. CRITICAL: only valid while page 3 is visible (hidden pages measure 0). */
function measureLayout() {
  const svg = osmdContainer.querySelector("svg");
  if (!svg || !viewportEl.clientWidth) return appState.layout;
  const svgRect = svg.getBoundingClientRect();
  const cRect = osmdContainer.getBoundingClientRect();
  if (!svgRect.width || !svgRect.height) return appState.layout;

  appState.layout = {
    viewportW: viewportEl.clientWidth,
    viewportH: viewportEl.clientHeight,
    svgW: svgRect.width,
    svgH: svgRect.height,
    containerH: osmdContainer.offsetHeight || cRect.height,
    svgOffsetTop: svgRect.top - cRect.top
  };
  return appState.layout;
}

function goToPage(pageNumber) {
  const currentPageBefore = currentPage;
  if (currentPage === 2 && pageNumber !== 2) {
    stopAudioPreview();
    stopCardPreview();
  }
  if (currentPage === 4 && pageNumber !== 4) disposeFinalPreview();
  currentPage = pageNumber;
  Object.values(pages).forEach((p) => p.classList.remove("active"));
  Object.values(stepIndicators).forEach((s) => s.classList.remove("active"));
  const back = pageNumber < currentPageBefore;
  pages[pageNumber].classList.add("active");
  stepIndicators[pageNumber].classList.add("active");
  updateConfigSummary();
  refreshStepLocks();
  refreshRangeFills();
  if (currentPageBefore !== pageNumber) Sfx.slide(back);
  requestAnimationFrame(refitViewports);
}

// ---- Sidebar steps: any earlier step, and any later step whose way there is open (e.g. from page 1 straight to
// the last page once everything is set). The pages' own back / next buttons do the work, so their checks and
// preparations (score loading, measuring the layout on page 3, clean-up) always run.
const NEXT_BTN = { 1: "next-to-page2", 2: "next-to-page3", 3: "to-page4", 4: "to-page5" };
const BACK_BTN = { 2: "back-to-page1", 3: "back-to-page2", 4: "back-to-page3", 5: "back-to-page4" };
let stepBusy = false;

function stepAllowed(n) {
  if (n === currentPage) return true;
  if (stepBusy || appState.rendering) return false;
  if (n < currentPage) return !$(BACK_BTN[currentPage]).disabled;
  if (n > currentPage + 1 && !appState.musicFile) return false;
  for (let k = currentPage; k < n; k++) if ($(NEXT_BTN[k]).disabled) return false;
  return true;
}

function refreshStepLocks() {
  for (const [n, el] of Object.entries(stepIndicators)) el.classList.toggle("locked", !stepAllowed(Number(n)));
}

const waitUntil = async (fn, ms) => { const t0 = performance.now(); while (!fn() && performance.now() - t0 < ms) await nextFrame(); return fn(); };

async function goToStep(n) {
  if (!stepAllowed(n) || n === currentPage) return;
  stepBusy = true;
  try {
    // forwards: one page at a time; wait until each page is really there (page 3 loads the score first)
    while (currentPage < n) {
      const btn = $(NEXT_BTN[currentPage]);
      if (btn.disabled) break;
      const from = currentPage;
      btn.click();
      if (!(await waitUntil(() => currentPage !== from, 3000))) break;
      if (currentPage === 3) {
        await waitUntil(() => appState.isScoreLoaded && !nextToPage3Btn.disabled, 120000);
        if (!appState.isScoreLoaded || currentPage !== 3) break;
      }
      await nextFrame();
      await nextFrame();
    }
    // backwards: step by step, each page's own back button (keeps its clean-up logic)
    while (currentPage > n && !$(BACK_BTN[currentPage]).disabled) $(BACK_BTN[currentPage]).click();
  } finally {
    stepBusy = false;
    refreshStepLocks();
  }
}

for (const [n, el] of Object.entries(stepIndicators)) {
  el.addEventListener("click", () => goToStep(Number(n)));
  el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goToStep(Number(n)); } });
}

// ---- Sliders: the filled part of a Diapason slider follows --p (set here, also for values set from code) ----
function setRangeFill(el) {
  const min = Number(el.min) || 0;
  const max = Number(el.max) || 100;
  const p = max > min ? ((Number(el.value) - min) / (max - min)) * 100 : 0;
  el.style.setProperty("--p", `${Math.max(0, Math.min(100, p))}%`);
}
function refreshRangeFills() {
  document.querySelectorAll("input.d-range").forEach(setRangeFill);
}
document.addEventListener("input", (e) => { if (e.target.matches && e.target.matches("input.d-range")) setRangeFill(e.target); });

// ---- Interface sounds (Echo: soft water-drop clicks, made in the browser; can be switched off) ----
const uiSoundToggle = $("ui-sound-toggle");
uiSoundToggle.checked = Sfx.enabled;
uiSoundToggle.addEventListener("change", () => Sfx.setEnabled(uiSoundToggle.checked));
document.addEventListener("click", (e) => {
  const el = e.target.closest && e.target.closest("button, .d-btn, .pill, .pill-mini, .format-pill, .toggle-row, .step-indicator, .project-pill-item, .card-list li, input[type=checkbox]");
  if (el && !el.disabled && !el.classList.contains("locked")) Sfx.drop(0, !el.classList.contains("is-primary"));
}, true);

// ---- Drag & drop ----
function setupDropZone(wrapEl, onFile) {
  wrapEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    wrapEl.classList.add("drag-over");
  });
  wrapEl.addEventListener("dragleave", () => wrapEl.classList.remove("drag-over"));
  wrapEl.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    wrapEl.classList.remove("drag-over");
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) onFile(file);
  });
}

// a file dropped outside a drop zone must not navigate the window
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

// =================================================================================================
// 6) Page 1 — settings
// =================================================================================================
function activatePill(buttons, dataAttr, value) {
  buttons.forEach((b) => b.classList.toggle("active", b.dataset[dataAttr] === String(value)));
}

function setupPillGroup(buttons, dataAttr, stateKey, callback) {
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      activatePill(buttons, dataAttr, btn.dataset[dataAttr]);
      const val = btn.dataset[dataAttr];
      appState[stateKey] = stateKey === "fps" || stateKey === "bitrate" ? Number(val) : val;
      if (callback) callback(appState[stateKey]);
      updateConfigSummary();
      refreshSummary();
    });
  });
}

setupPillGroup(fpsButtons, "fps", "fps");
setupPillGroup(aspectButtons, "aspect", "aspect", () => {
  refitViewports();
  if (appState.bgSettings.preset) applyPreset(appState.bgSettings.preset);
});
setupPillGroup(resButtons, "res", "resolution");
setupPillGroup(bitrateButtons, "bitrate", "bitrate"); // video bitrate in Mbit/s, 0 = automatic

function setAppTheme(theme) {
  appState.appTheme = theme;
  document.body.classList.remove("dark-theme", "light-theme");
  document.body.classList.add(theme === "dark" ? "dark-theme" : "light-theme");
  document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
  themeButtons.forEach((b) => {
    const on = b.dataset.apptheme === theme;
    b.classList.toggle("active", on);
    b.setAttribute("aria-checked", String(on));
  });
}

themeButtons.forEach((b) => b.addEventListener("click", () => setAppTheme(b.dataset.apptheme)));

// ---- Glow colour: presets, inline picker, saved colours ----
const SAVED_COLORS_KEY = "echo-notes.savedColors";
const MAX_SAVED_COLORS = 18;

const colorPicker = new InlineColorPicker({
  svBox, svCursor, hueBar, hueCursor, hexInput: colorHexInput,
  onChange: (hex) => applyActiveColor(hex)
});

// two colours: target "a" = first staff, "b" = other staves (only with dualColor); the picker edits the target
const colorTargetBtns = { a: $("color-target-a"), b: $("color-target-b") };
const targetSwatches = { a: $("target-swatch-a"), b: $("target-swatch-b") };
const dualColorToggle = $("dual-color-toggle");
const colorPreviewEl = $("color-preview");

const currentTargetColor = () => (appState.colorTarget === "b" ? appState.activeColor2 : appState.activeColor);

function updateColorVars() {
  const root = document.documentElement.style;
  root.setProperty("--active-note-color", appState.activeColor);
  root.setProperty("--active-note-color-2", appState.dualColor ? appState.activeColor2 : appState.activeColor);
  targetSwatches.a.style.background = appState.activeColor;
  targetSwatches.b.style.background = appState.activeColor2;
  colorPreviewEl.style.background = currentTargetColor(); // the colour being edited
  colorTargetBtns.b.classList.toggle("dimmed", !appState.dualColor);
  for (const t of ["a", "b"]) colorTargetBtns[t].classList.toggle("active", appState.colorTarget === t);
  const hex = currentTargetColor().toUpperCase();
  const same = (el) => (el.dataset.color || "").toUpperCase() === hex;
  colorBtns.forEach((b) => b.classList.toggle("active", same(b)));
  savedColorsEl.querySelectorAll(".color-btn").forEach((b) => b.classList.toggle("active", same(b)));
  if (appState.keyboard && appState.isScoreLoaded) drawInfoPreview(engine.getTime());
}

function applyActiveColor(hex) {
  if (appState.colorTarget === "b") appState.activeColor2 = hex;
  else appState.activeColor = hex;
  updateColorVars();
}

function setActiveColor(hex) {
  const h = normalizeHex(hex);
  if (!h) return;
  colorPicker.setColor(h, { silent: true });
  applyActiveColor(h);
}

function selectColorTarget(target) {
  appState.colorTarget = target === "b" ? "b" : "a";
  if (appState.colorTarget === "b" && !appState.dualColor) setDualColor(true); // picking the 2nd staff turns it on
  colorPicker.setColor(currentTargetColor(), { silent: true });
  updateColorVars();
}

function setDualColor(on) {
  appState.dualColor = !!on;
  dualColorToggle.checked = appState.dualColor;
  if (!appState.dualColor && appState.colorTarget === "b") {
    appState.colorTarget = "a";
    colorPicker.setColor(appState.activeColor, { silent: true });
  }
  updateColorVars();
}

colorTargetBtns.a.addEventListener("click", () => selectColorTarget("a"));
colorTargetBtns.b.addEventListener("click", () => selectColorTarget("b"));
dualColorToggle.addEventListener("change", (e) => setDualColor(e.target.checked));

function loadSavedColors() {
  try {
    const list = JSON.parse(localStorage.getItem(SAVED_COLORS_KEY) || "[]");
    appState.savedColors = Array.isArray(list) ? list.map(normalizeHex).filter(Boolean).slice(0, MAX_SAVED_COLORS) : [];
  } catch (_) {
    appState.savedColors = [];
  }
}

function persistSavedColors() {
  try { localStorage.setItem(SAVED_COLORS_KEY, JSON.stringify(appState.savedColors)); } catch (_) { /* yoksay */ }
}

function renderSavedColors() {
  savedColorsEl.innerHTML = "";
  if (appState.savedColors.length === 0) {
    const span = document.createElement("span");
    span.className = "no-saved-text";
    span.textContent = tr("noSavedColors");
    savedColorsEl.appendChild(span);
    return;
  }
  appState.savedColors.forEach((hex) => {
    const btn = document.createElement("button");
    btn.className = "color-btn";
    btn.dataset.color = hex;
    btn.style.background = hex;
    btn.title = `${hex} — ${tr("savedColorTitle")}`;
    btn.classList.toggle("active", hex === currentTargetColor().toUpperCase());
    btn.addEventListener("click", () => setActiveColor(hex));
    const remove = (e) => {
      e.preventDefault();
      appState.savedColors = appState.savedColors.filter((c) => c !== hex);
      persistSavedColors();
      renderSavedColors();
    };
    btn.addEventListener("contextmenu", remove);
    btn.addEventListener("keydown", (e) => { if (e.key === "Delete" || e.key === "Backspace") remove(e); });
    savedColorsEl.appendChild(btn);
  });
}

saveColorBtn.addEventListener("click", () => {
  const hex = normalizeHex(currentTargetColor());
  if (!hex) return;
  appState.savedColors = [hex, ...appState.savedColors.filter((c) => c !== hex)].slice(0, MAX_SAVED_COLORS);
  persistSavedColors();
  renderSavedColors();
});

colorBtns.forEach((btn) => btn.addEventListener("click", () => setActiveColor(btn.dataset.color)));

// ---- Score file (CRITICAL: transparent full-size <input type=file> — keep this design) ----
function handleMusicFileSelect(file, { fromProject = false } = {}) {
  if (!file) return;
  appState.musicFile = file;
  appState.musicFileName = file.name;
  appState.isScoreLoaded = false;
  appState.layout = null;
  appState.applyScoreTempo = !fromProject;
  if (!fromProject) {
    appState.tempoDiamonds = []; // diamonds belong to the old score
    appState.projectId = null; // another file = new project
    engine.setDiamonds([]);
    renderAllDiamonds();
    // text screens that still show the score's title/composer follow the new score
    appState.scoreMeta = { title: "", composer: "" };
    applyScoreMeta("", "");
    prefillCardsFromScore(file);
  }
  refreshMusicFileState();
  refreshSummary();
}

fileInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) handleMusicFileSelect(file);
  e.target.value = ""; // fire "change" even for the same file again
});

setupDropZone(musicDropZoneWrap, (file) => handleMusicFileSelect(file));

nextToPage2Btn.addEventListener("click", () => {
  if (!appState.musicFile) return;
  goToPage(2);
});

// =================================================================================================
// 7) Page 2 — side panel tabs (background / music / intro-outro), then the background itself
// =================================================================================================
const sideTabs = $$("#page-2 .side-tab");
const sidePanes = $$("#page-2 .tab-pane");
sideTabs.forEach((tab) => tab.addEventListener("click", () => {
  sideTabs.forEach((t) => t.classList.toggle("active", t === tab));
  sidePanes.forEach((p) => p.classList.toggle("active", p.dataset.pane === tab.dataset.tab));
}));

function bgElements() {
  return [bgStageImg, bgStageVideo, previewBgImg, previewBgVideo];
}

function applyBgTransforms() {
  const { scale, opacity, posX, posY, grayscale, loop } = appState.bgSettings;
  const transformCss = `translate(${posX}%, ${posY}%) scale(${scale / 100})`;
  const filterCss = grayscale ? "grayscale(100%)" : "none";
  bgElements().forEach((el) => {
    el.style.transform = transformCss;
    el.style.filter = filterCss;
    el.style.opacity = String(opacity / 100);
    if (el.tagName === "VIDEO") el.loop = loop;
  });
}

function syncBgControls() {
  const s = appState.bgSettings;
  bgScaleRange.value = s.scale; bgScaleVal.textContent = String(s.scale);
  bgOpacityRange.value = s.opacity; bgOpacityVal.textContent = String(s.opacity);
  bgPosXRange.value = s.posX; bgPosXVal.textContent = String(s.posX);
  bgPosYRange.value = s.posY; bgPosYVal.textContent = String(s.posY);
}

// how light the background picture is (0..1), for the live-info type colour in the preview
function measureBgLuma(el) {
  try {
    const w = el.videoWidth || el.naturalWidth;
    const h = el.videoHeight || el.naturalHeight;
    if (!w || !h) return;
    const c = document.createElement("canvas");
    c.width = 32;
    c.height = 18;
    const cx = c.getContext("2d", { willReadFrequently: true });
    cx.drawImage(el, 0, 0, 32, 18);
    appState.bgLuma = meanLuma(cx.getImageData(0, 0, 32, 18).data);
    drawInfoPreview(engine.getTime());
  } catch (_) { /* unreadable: keep the last value */ }
}
/** "dark" type on a light stage (light score theme without a picture, or a light picture), "light" otherwise. */
function previewInfoTone() {
  if (!appState.bgSettings.type) return appState.animTheme === "light" ? "dark" : "light";
  const l = (appState.bgLuma ?? 0) * ((appState.bgSettings.opacity ?? 100) / 100);
  return l > 0.5 ? "dark" : "light";
}
previewBgImg.addEventListener("load", () => measureBgLuma(previewBgImg));
previewBgVideo.addEventListener("loadeddata", () => measureBgLuma(previewBgVideo));

function applyBackgroundFile(file) {
  const isVideo = (file.type || "").startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
  const isImage = (file.type || "").startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);
  if (!isVideo && !isImage) return;
  if (appState.bgSettings.url) URL.revokeObjectURL(appState.bgSettings.url);

  const url = URL.createObjectURL(file);
  appState.bgSettings.type = isVideo ? "video" : "image";
  appState.bgSettings.fileName = file.name;
  appState.bgSettings.url = url;
  appState.bgFile = file;

  if (isVideo) {
    bgStageImg.style.display = "none";
    previewBgImg.style.display = "none";
    bgStageVideo.src = url;
    previewBgVideo.src = url;
    bgStageVideo.style.display = "block";
    previewBgVideo.style.display = "block";
    bgStageVideo.play().catch(() => {});
    previewBgVideo.play().catch(() => {});
  } else {
    bgStageVideo.style.display = "none";
    previewBgVideo.style.display = "none";
    bgStageImg.src = url;
    previewBgImg.src = url;
    bgStageImg.style.display = "block";
    previewBgImg.style.display = "block";
  }

  viewportEl.classList.add("has-bg-media");
  applyBgTransforms();
  refreshBgState();
  refreshSummary();
}

function clearBackground() {
  appState.bgSettings.preset = null;
  viewportEl.classList.remove("has-bg-media");
  if (appState.bgSettings.url) URL.revokeObjectURL(appState.bgSettings.url);
  appState.bgSettings.type = null;
  appState.bgSettings.fileName = "";
  appState.bgSettings.url = null;
  appState.bgFile = null;

  [bgStageVideo, previewBgVideo].forEach((v) => {
    v.pause();
    v.removeAttribute("src");
    v.load();
    v.style.display = "none";
  });
  [bgStageImg, previewBgImg].forEach((img) => {
    img.removeAttribute("src");
    img.style.display = "none";
  });

  refreshBgState();
  refreshSummary();
}

function applyOwnBackground(file) {
  appState.bgSettings.preset = null;
  applyBackgroundFile(file);
}
bgMediaInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) applyOwnBackground(file);
  e.target.value = "";
});
setupDropZone(bgDropZoneWrap, applyOwnBackground);

// ---- ready-made backgrounds: patterns drawn in the video's shape and used like a chosen picture ----
const videoAspect = () => {
  const [aw, ah] = ASPECTS[appState.aspect] || ASPECTS["16-9"];
  return aw / ah;
};
let presetToken = 0;
async function applyPreset(id) {
  const token = ++presetToken;
  try {
    const file = await makePresetFile(id, videoAspect(), tr("preset" + id[0].toUpperCase() + id.slice(1)));
    if (token !== presetToken) return; // a newer choice won
    appState.bgSettings.preset = id;
    // a pattern is made to be seen as it is: full opacity (a photo is dimmed to 50 % by default)
    appState.bgSettings.opacity = 100;
    syncBgControls();
    refreshRangeFills();
    applyBackgroundFile(file);
    // the patterns are dark: white notes (dark score theme), black ones would vanish in them
    if (appState.animTheme !== "dark") setAnimTheme("dark");
  } catch (err) {
    console.error(err);
  }
}
function buildPresetGrid() {
  bgPresetGrid.innerHTML = "";
  for (const id of BG_PRESETS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "bg-preset";
    b.dataset.preset = id;
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 72;
    b.appendChild(c);
    drawPresetThumb(c, id);
    b.addEventListener("click", () => applyPreset(id));
    bgPresetGrid.appendChild(b);
  }
  refreshPresetTitles();
  setInfo(appState.info); // the overlay's words follow the language
}
function refreshPresetTitles() {
  for (const b of bgPresetGrid.children) {
    const id = b.dataset.preset;
    b.title = tr("preset" + id[0].toUpperCase() + id.slice(1));
  }
}

bgClearBtn.addEventListener("click", clearBackground);

bgLoopBtn.addEventListener("click", () => {
  appState.bgSettings.loop = !appState.bgSettings.loop;
  applyBgTransforms();
  refreshBgState();
});

bgGrayscaleBtn.addEventListener("click", () => {
  appState.bgSettings.grayscale = !appState.bgSettings.grayscale;
  applyBgTransforms();
  refreshBgState();
});

function bindBgRange(range, label, key) {
  range.addEventListener("input", (e) => {
    appState.bgSettings[key] = Number(e.target.value);
    label.textContent = e.target.value;
    applyBgTransforms();
  });
}
bindBgRange(bgScaleRange, bgScaleVal, "scale");
bindBgRange(bgOpacityRange, bgOpacityVal, "opacity");
bindBgRange(bgPosXRange, bgPosXVal, "posX");
bindBgRange(bgPosYRange, bgPosYVal, "posY");

backToPage1Btn.addEventListener("click", () => goToPage(1));

// =================================================================================================
// 7b) Page 2 — music track and preview sync
// =================================================================================================
const previewAudio = new Audio();
previewAudio.preload = "auto";
let previewAudioCtx = null; // GainNode: volume above 100 %, same scale as the render
let previewGain = null;
let audioStartTimer = null;
let audioPreviewPlaying = false; // page-2 "Listen" button
let audioLoadToken = 0;

function ensurePreviewGraph() {
  if (previewAudioCtx) return;
  try {
    previewAudioCtx = new AudioContext();
    const src = previewAudioCtx.createMediaElementSource(previewAudio);
    previewGain = previewAudioCtx.createGain();
    src.connect(previewGain).connect(previewAudioCtx.destination);
  } catch (err) {
    console.warn("Preview audio graph unavailable:", err);
    previewAudioCtx = null;
  }
}

function applyPreviewVolume() {
  const v = appState.audio.volume / 100;
  if (previewGain) previewGain.gain.value = v;
  else previewAudio.volume = clamp(v, 0, 1);
}

function startPreviewAudioAt(audioTime) {
  ensurePreviewGraph();
  if (previewAudioCtx && previewAudioCtx.state === "suspended") previewAudioCtx.resume().catch(() => {});
  applyPreviewVolume();
  const dur = previewAudio.duration;
  if (Number.isFinite(dur) && audioTime >= dur) return;
  previewAudio.currentTime = Math.max(0, audioTime);
  previewAudio.play().catch(() => {});
}

/** Playback started at t: bring the music to the same point. */
function audioSyncPlay(t) {
  if (!appState.audio.url || !appState.audio.buffer) return;
  stopAudioPreview();
  clearTimeout(audioStartTimer);
  const audioTime = t - appState.audio.offset;
  if (audioTime >= 0) {
    startPreviewAudioAt(audioTime);
  } else {
    previewAudio.pause();
    audioStartTimer = setTimeout(() => {
      if (engine.isPlaying) startPreviewAudioAt(0);
    }, -audioTime * 1000);
  }
}

// CRITICAL: while the music plays, the preview clock IS the music (no drift)
engine.getExternalTime = () => {
  const a = appState.audio;
  if (!a.buffer || audioPreviewPlaying || previewAudio.paused || previewAudio.seeking || previewAudio.readyState < 2) return null;
  return previewAudio.currentTime + a.offset;
};

function audioSyncStop() {
  clearTimeout(audioStartTimer);
  if (!audioPreviewPlaying) previewAudio.pause();
}

function stopAudioPreview() {
  if (!audioPreviewPlaying) return;
  audioPreviewPlaying = false;
  previewAudio.pause();
  refreshAudioState();
}

previewAudio.addEventListener("ended", () => {
  if (audioPreviewPlaying) {
    audioPreviewPlaying = false;
    refreshAudioState();
  }
});

async function applyAudioFile(file) {
  const looksAudio = (file.type || "").startsWith("audio/") || /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|webm)$/i.test(file.name);
  if (!looksAudio) return;
  clearAudio();
  const token = ++audioLoadToken;
  const a = appState.audio;
  a.file = file;
  a.name = file.name;
  a.url = URL.createObjectURL(file);
  a.loading = true;
  previewAudio.src = a.url;
  refreshAudioState();
  refreshSummary();
  try {
    const buffer = await decodeAudioFile(file);
    if (token !== audioLoadToken) return; // another file was chosen meanwhile
    a.buffer = buffer;
  } catch (err) {
    if (token !== audioLoadToken) return;
    console.error("Audio decode failed:", err);
    clearAudio();
    notify(tr("audioDecodeFailed") + describeError(err), "error");
  } finally {
    if (token === audioLoadToken) {
      a.loading = false;
      updateMusicEnd();
      refreshAudioState();
      refreshSummary();
    }
  }
}

function clearAudio() {
  audioLoadToken++;
  stopAudioPreview();
  audioSyncStop();
  previewAudio.pause();
  previewAudio.removeAttribute("src");
  previewAudio.load();
  const a = appState.audio;
  if (a.url) URL.revokeObjectURL(a.url);
  a.file = null;
  a.name = "";
  a.url = null;
  a.buffer = null;
  a.loading = false;
  updateMusicEnd();
  refreshAudioState();
  refreshSummary();
}

function setAudioOffset(value) {
  let v = Number(value);
  if (!Number.isFinite(v)) return;
  v = Math.round(clamp(v, -600, 600) * 1000) / 1000;
  appState.audio.offset = v;
  syncAudioControls();
  updateMusicEnd();
  if (engine.isPlaying) audioSyncPlay(engine.getTime());
}

/** The preview (and the video) never ends before the music: tell the engine where the music ends. */
function updateMusicEnd() {
  const a = appState.audio;
  engine.setMinEnd(a.buffer ? Math.max(0, a.offset + a.buffer.duration) : 0);
}

audioInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) applyAudioFile(file);
  e.target.value = "";
});
setupDropZone(audioDropZoneWrap, applyAudioFile);
audioClearBtn.addEventListener("click", clearAudio);

audioVolumeRange.addEventListener("input", (e) => {
  appState.audio.volume = Number(e.target.value);
  audioVolumeVal.textContent = e.target.value;
  applyPreviewVolume();
});
audioOffsetRange.addEventListener("input", (e) => setAudioOffset(e.target.value));
audioOffsetInput.addEventListener("change", (e) => setAudioOffset(e.target.value));
audioOffsetInput3.addEventListener("change", (e) => setAudioOffset(e.target.value));

audioPreviewBtn.addEventListener("click", () => {
  if (!appState.audio.buffer) return;
  if (audioPreviewPlaying) {
    stopAudioPreview();
    return;
  }
  audioPreviewPlaying = true;
  startPreviewAudioAt(0);
  refreshAudioState();
});

// =================================================================================================
// 7c) Page 2 — atmosphere (haze, embers)
// =================================================================================================
const fxOverlays = [new AmbientFxOverlay($("fx-canvas-stage")), new AmbientFxOverlay($("fx-canvas-preview"))];
const fxUi = {
  fog: { btn: $("fog-toggle-btn"), row: $("fog-row"), range: $("fog-range"), val: $("fog-val") },
  embers: { btn: $("embers-toggle-btn"), row: $("embers-row"), range: $("embers-range"), val: $("embers-val") }
};

/** Effective levels for drawing: { fog, embers } with 0 = off. */
const fxLevelsNow = () => ({
  fog: appState.fx.fogOn ? appState.fx.fog : 0,
  embers: appState.fx.embersOn ? appState.fx.embers : 0
});

function applyFx() {
  for (const [key, ui] of Object.entries(fxUi)) {
    const on = appState.fx[key + "On"];
    const pct = Math.round(appState.fx[key] * 100);
    ui.btn.classList.toggle("on", on);
    ui.row.classList.toggle("disabled", !on);
    ui.range.value = String(pct);
    ui.val.textContent = String(pct);
  }
  fxOverlays.forEach((o) => o.set(fxLevelsNow()));
}
for (const [key, ui] of Object.entries(fxUi)) {
  ui.btn.addEventListener("click", () => { appState.fx[key + "On"] = !appState.fx[key + "On"]; applyFx(); });
  ui.range.addEventListener("input", (e) => { appState.fx[key] = Number(e.target.value) / 100; applyFx(); });
}

// =================================================================================================
// 7d) Page 2 — intro / outro screens (video and/or text template)
// =================================================================================================
const MAX_CARDS = 8; // per list (same limit in electron/ipc-projects.js)
const cardTabs = $$("#card-tabs .pill-mini");
const cardListEl = $("card-list");
const cardListHint = $("card-list-hint");
const cardAddVideoInput = $("card-add-video-input");
const cardAddTextBtn = $("card-add-text-btn");
const cardEditor = $("card-editor");
const cardVideoInput = $("card-video-input");
const cardVideoWrap = $("card-video-wrap");
const cardVideoLabel = $("card-video-label");
const cardVideoLoaded = $("card-video-loaded");
const cardVideoText = $("card-video-text");
const cardVideoClear = $("card-video-clear");
const cardTextBtn = $("card-text-btn");
const cardTextEditor = $("card-text-editor");
const cardTemplateBtns = $$("#card-template-group .pill-mini");
const cardOrderRow = $("card-order-row");
const cardOrderBtns = $$("#card-order-group .pill-mini");
const cardFields = { title: $("card-f-title"), composer: $("card-f-composer"), subtitle: $("card-f-subtitle"), extra: $("card-f-extra") };
const cardDurationRange = $("card-duration-range");
const cardDurationVal = $("card-duration-val");
const cardDurationHint = $("card-duration-hint");
const cardPreviewBtn = $("card-preview-btn");
const cardPreviewCanvas = $("card-preview-canvas");
$("card-editor-close").addEventListener("click", () => {
  appState.cardEditing.index = -1; // nothing selected: back to the list
  refreshCardEditor();
});

const editingList = () => appState.cards[appState.cardEditing.list];
const currentCard = () => editingList()[appState.cardEditing.index] || null;

/** A new screen; text screens start with the score's title / composer (intro) or a thank-you line (outro). */
function newCard(kind, type) {
  const c = defaultCard(kind, type);
  if (type === "text") {
    c.autoMeta = true; // follows the score until the user edits title / composer
    fillCardMeta(kind, c);
  }
  return c;
}

function fillCardMeta(kind, c) {
  const { title, composer } = appState.scoreMeta;
  if (kind === "intro") {
    c.fields.title = title || baseNameOfMusic() || "";
    c.fields.composer = composer || "";
  } else {
    c.fields.title = tr("outroDefaultTitle");
    c.fields.composer = [title || baseNameOfMusic(), composer].filter(Boolean).join(" — ");
  }
}

function cardLabel(c) {
  const tpl = tr("tpl" + c.template[0].toUpperCase() + c.template.slice(1));
  if (c.videoFile) {
    if (!c.textEnabled) return `▶ ${c.videoName}`;
    if (c.textOrder === "textFirst") return `${tpl} → ▶ ${c.videoName}`;
    if (c.textOrder === "videoFirst") return `▶ ${c.videoName} → ${tpl}`;
    return `▶ ${c.videoName} + ${tpl}`;
  }
  return `T  ${tpl}${c.fields.title ? " · " + c.fields.title : ""}`;
}

function renderCardList() {
  const kind = appState.cardEditing.list;
  const list = editingList();
  cardListEl.replaceChildren();
  list.forEach((c, i) => {
    const li = document.createElement("li");
    li.classList.toggle("active", i === appState.cardEditing.index);
    const name = document.createElement("span");
    name.className = "card-item-name";
    name.textContent = `${i + 1}. ${cardLabel(c)}`;
    name.title = name.textContent;
    const dur = document.createElement("span");
    dur.className = "card-item-dur";
    dur.textContent = `${cardDuration(c).toFixed(1)} s`;
    li.append(name, dur);
    const btn = (text, title, cls, disabled, fn) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "icon-mini" + (cls ? " " + cls : "");
      b.textContent = text;
      b.title = title;
      b.disabled = disabled;
      b.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
      li.append(b);
    };
    btn("▲", tr("cardMoveUp"), "", i === 0, () => moveCard(i, -1));
    btn("▼", tr("cardMoveDown"), "", i === list.length - 1, () => moveCard(i, 1));
    btn("✕", tr("cardRemove"), "danger", false, () => removeCard(i));
    li.addEventListener("click", () => { appState.cardEditing.index = i; refreshCardEditor(); });
    cardListEl.append(li);
  });
  cardListHint.textContent = list.length
    ? tr(kind === "intro" ? "cardListHintIntro" : "cardListHintOutro")
    : tr(kind === "intro" ? "cardListEmptyIntro" : "cardListEmptyOutro");
  const full = list.length >= MAX_CARDS;
  $("card-add-video-btn").classList.toggle("disabled", full);
  cardAddVideoInput.disabled = full;
  cardAddTextBtn.disabled = full;
}

function refreshCardEditor() {
  if (cardPreview) stopCardPreview();
  cardTabs.forEach((b) => b.classList.toggle("active", b.dataset.card === appState.cardEditing.list));
  if (appState.cardEditing.index >= editingList().length) appState.cardEditing.index = editingList().length - 1;
  renderCardList();
  const c = currentCard();
  cardEditor.style.display = c ? "flex" : "none";
  // while a screen is being edited, the editor takes the place of the list (closed with "Back to list")
  cardEditor.closest(".tab-pane").classList.toggle("editing", !!c);
  if (c) $("card-editor-title").textContent = `${appState.cardEditing.index + 1}. ${cardLabel(c)}`;
  refreshSummary();
  if (!c) return;
  const hasVideo = !!c.videoFile;
  cardVideoLabel.style.display = hasVideo ? "none" : "flex";
  cardVideoLoaded.style.display = hasVideo ? "flex" : "none";
  cardVideoText.textContent = hasVideo ? `${tr("videoLabel")}: ${c.videoName} (${formatSeconds(c.videoDuration)})` : "";
  cardTextBtn.textContent = c.textEnabled ? tr("cardTextRemove") : tr("cardTextAdd");
  cardTextEditor.style.display = c.textEnabled ? "flex" : "none";
  cardOrderRow.style.display = hasVideo && c.textEnabled ? "flex" : "none";
  cardOrderBtns.forEach((b) => b.classList.toggle("active", b.dataset.order === c.textOrder));
  cardTemplateBtns.forEach((b) => b.classList.toggle("active", b.dataset.template === c.template));
  for (const [k, input] of Object.entries(cardFields)) if (document.activeElement !== input) input.value = c.fields[k] || "";
  cardDurationRange.value = String(c.duration);
  cardDurationVal.textContent = String(c.duration);
  const seq = isSequential(c);
  cardDurationRange.disabled = hasVideo && !seq; // sequential: the slider sets how long the text stays
  if (seq) cardDurationHint.textContent = tr(c.textOrder === "textFirst" ? "cardSeqTextFirst" : "cardSeqVideoFirst", { t: String(c.duration), v: c.videoDuration.toFixed(1) });
  else if (hasVideo) cardDurationHint.textContent = tr("cardDurationVideo", { s: c.videoDuration.toFixed(1) });
  else cardDurationHint.textContent = !c.textEnabled ? tr("cardNeedsContent") : "";
}

function addCard(card) {
  const list = editingList();
  if (list.length >= MAX_CARDS) { notify(tr("cardListFull", { n: MAX_CARDS })); return; }
  list.push(card);
  appState.cardEditing.index = list.length - 1;
  refreshCardEditor();
}

function moveCard(i, delta) {
  const list = editingList();
  const j = i + delta;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  appState.cardEditing.index = -1;
  refreshCardEditor();
}

function removeCard(i) {
  const list = editingList();
  const [c] = list.splice(i, 1);
  if (c && c.videoUrl) URL.revokeObjectURL(c.videoUrl);
  appState.cardEditing.index = -1;
  refreshCardEditor();
}

function clearCards() {
  for (const kind of ["intro", "outro"]) {
    for (const c of appState.cards[kind]) if (c.videoUrl) URL.revokeObjectURL(c.videoUrl);
    appState.cards[kind] = [];
  }
  appState.cardEditing.index = -1;
}

cardTabs.forEach((b) => b.addEventListener("click", () => {
  appState.cardEditing = { list: b.dataset.card, index: -1 }; // the list first
  refreshCardEditor();
}));
cardAddTextBtn.addEventListener("click", () => addCard(newCard(appState.cardEditing.list, "text")));
cardAddVideoInput.addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const c = newCard(appState.cardEditing.list, "video");
  if (await setCardVideo(c, file)) addCard(c);
});
cardTextBtn.addEventListener("click", () => {
  const c = currentCard();
  if (!c) return;
  c.textEnabled = !c.textEnabled;
  if (c.textEnabled && !c.fields.title) { c.autoMeta = true; fillCardMeta(appState.cardEditing.list, c); }
  refreshCardEditor();
});
cardTemplateBtns.forEach((b) => b.addEventListener("click", () => {
  const c = currentCard();
  if (c) { c.template = b.dataset.template; refreshCardEditor(); }
}));
cardOrderBtns.forEach((b) => b.addEventListener("click", () => {
  const c = currentCard();
  if (c) { c.textOrder = b.dataset.order; refreshCardEditor(); }
}));
for (const [k, input] of Object.entries(cardFields)) {
  input.addEventListener("input", () => {
    const c = currentCard();
    if (!c) return;
    c.fields[k] = input.value;
    if (k === "title" || k === "composer") c.autoMeta = false;
    renderCardList();
  });
}
cardDurationRange.addEventListener("input", (e) => {
  const c = currentCard();
  if (!c) return;
  c.duration = Number(e.target.value);
  cardDurationVal.textContent = e.target.value;
  if (isSequential(c)) cardDurationHint.textContent = tr(c.textOrder === "textFirst" ? "cardSeqTextFirst" : "cardSeqVideoFirst", { t: e.target.value, v: c.videoDuration.toFixed(1) });
  renderCardList();
  refreshSummary();
});

/** Sets (or clears, file = null) the video of a screen. Returns false if the file cannot be played. */
async function setCardVideo(card, file) {
  if (card.videoUrl) URL.revokeObjectURL(card.videoUrl);
  card.videoFile = null; card.videoName = ""; card.videoDuration = 0; card.videoUrl = null; card.audioBuffer = undefined;
  if (!file) return true;
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.preload = "metadata";
  v.src = url;
  try {
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error("video")); });
    if (!(v.duration > 0) || !Number.isFinite(v.duration)) throw new Error("video");
    Object.assign(card, { videoFile: file, videoName: file.name, videoDuration: v.duration, videoUrl: url });
    return true;
  } catch (_) {
    URL.revokeObjectURL(url);
    notify(tr("cardVideoFailed"), "error");
    return false;
  } finally {
    v.removeAttribute("src");
  }
}

const isVideoFile = (file) => /^video\//.test(file.type || "") || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
cardVideoInput.addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  const c = currentCard();
  if (file && c) { await setCardVideo(c, file); refreshCardEditor(); }
});
setupDropZone(cardVideoWrap, async (file) => {
  const c = currentCard();
  if (!c || !isVideoFile(file)) return;
  await setCardVideo(c, file);
  refreshCardEditor();
});
cardVideoClear.addEventListener("click", async () => {
  const c = currentCard();
  if (!c) return;
  await setCardVideo(c, null);
  if (!c.textEnabled) { c.textEnabled = true; if (!c.fields.title) { c.autoMeta = true; fillCardMeta(appState.cardEditing.list, c); } }
  refreshCardEditor();
});

// ---- Screen preview on the page-2 stage (same drawing code as the render) ----
// CRITICAL: drawn at the output resolution (e.g. 2560×1440), not the stage size, so it looks like the video.
let cardPreview = null; // { raf, video, t0 }
function stopCardPreview() {
  if (!cardPreview) return;
  cancelAnimationFrame(cardPreview.raf);
  if (cardPreview.video) { cardPreview.video.pause(); cardPreview.video.removeAttribute("src"); }
  cardPreview = null;
  cardPreviewCanvas.style.display = "none";
  cardPreviewBtn.textContent = tr("cardPreview");
}

cardPreviewBtn.addEventListener("click", async () => {
  if (cardPreview) { stopCardPreview(); return; }
  const card = currentCard();
  const dur = cardDuration(card);
  if (!(dur > 0)) { notify(tr("cardNeedsContent")); return; }
  stopAudioPreview();
  await ensureCardFonts();
  let video = null;
  if (card.videoUrl) {
    video = document.createElement("video");
    video.src = card.videoUrl;
    video.playsInline = true;
    await new Promise((r) => { video.onloadeddata = r; video.onerror = r; });
    video.currentTime = 0;
  }
  const c = cardPreviewCanvas;
  const { width, height } = getRenderDimensions(appState.aspect, appState.resolution);
  c.width = width;
  c.height = height;
  c.style.display = "block";
  cardPreviewBtn.textContent = tr("audioStop");
  const ctx = c.getContext("2d");
  const bgMedia = appState.bgSettings.type === "image" ? bgStageImg : null;
  cardPreview = { raf: 0, video, t0: performance.now() };
  // the clock runs the screen; the video plays (with sound) only during its part
  const tick = () => {
    if (!cardPreview) return;
    let t = (performance.now() - cardPreview.t0) / 1000;
    const ph = cardPhaseAt(card, Math.min(t, dur));
    if (video) {
      if (ph.videoTime === null) { if (!video.paused) video.pause(); }
      else if (video.paused && !video.ended) { video.currentTime = ph.videoTime; video.play().catch(() => {}); }
      else if (!video.paused) {
        // follow the video while it plays (it is the more precise clock)
        cardPreview.t0 = performance.now() - (t - ph.videoTime + video.currentTime) * 1000;
        t = (performance.now() - cardPreview.t0) / 1000;
      }
    }
    drawCard(ctx, width, height, card, Math.min(t, dur), dur, { video, bgMedia, accent: appState.activeColor });
    if (ph.videoTime === null) drawAmbientFx(ctx, width, height, t, fxLevelsNow());
    if (t >= dur) { setTimeout(stopCardPreview, 250); return; }
    cardPreview.raf = requestAnimationFrame(tick);
  };
  tick();
});

/** Title / composer from the MusicXML (work-title, movement-title, creator type="composer") for the text screens. */
async function prefillCardsFromScore(file) {
  try {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (head[0] === 0x50 && head[1] === 0x4b) return; // compressed .mxl: filled after loading (OSMD)
    const text = (await file.slice(0, 200000).text()) || "";
    const pick = (re) => { const m = re.exec(text); return m ? m[1].replace(/<[^>]+>/g, "").trim() : ""; };
    const title = pick(/<work-title>([\s\S]*?)<\/work-title>/) || pick(/<movement-title>([\s\S]*?)<\/movement-title>/);
    const composer = pick(/<creator[^>]*type="composer"[^>]*>([\s\S]*?)<\/creator>/);
    applyScoreMeta(title, composer);
  } catch (_) { /* metadata is optional */ }
}

function applyScoreMeta(title, composer) {
  if (title) appState.scoreMeta.title = title;
  if (composer) appState.scoreMeta.composer = composer;
  for (const kind of ["intro", "outro"]) {
    for (const c of appState.cards[kind]) if (c.autoMeta && c.textEnabled) fillCardMeta(kind, c);
  }
  refreshCardEditor();
}

/** What the renderer needs per screen: duration, video url and the video's own sound. */
async function prepareCardsForRender() {
  const out = { intro: [], outro: [] };
  for (const kind of ["intro", "outro"]) {
    for (const card of appState.cards[kind]) {
      const duration = cardDuration(card);
      if (!(duration > 0)) continue;
      if (card.videoFile && card.audioBuffer === undefined) {
        try { card.audioBuffer = await decodeAudioFile(card.videoFile); } catch (_) { card.audioBuffer = null; } // silent video
      }
      out[kind].push({ card: { ...card, fields: { ...card.fields } }, duration, url: card.videoUrl || null, audioBuffer: card.audioBuffer || null });
    }
  }
  return out;
}

// =================================================================================================
// 8) Page 3 — score, preview, tempo map
// =================================================================================================
function setScoreLoading(on) {
  scoreLoadingEl.classList.toggle("hidden", !on);
  zoomRange.disabled = on;
  playBtn.disabled = on;
  addDiamondBtn.disabled = on;
}

function syncDiamondPositions() {
  const svgW = appState.layout && appState.layout.svgW;
  if (!svgW) return;
  appState.tempoDiamonds.forEach((d) => {
    if (typeof d.ratio === "number") d.xPx = d.ratio * svgW;
  });
}

function rebuildTimeline() {
  if (!scoreManager) return; // no score yet
  measureLayout(); // while the page is visible
  const steps = buildTimeline(scoreManager.osmd, osmdContainer);
  drawWordLines(osmdContainer, steps, scoreManager.tempoWords); // "rall. - - - -" lines
  syncDiamondPositions();
  engine.setBpm(bpmInput.value);
  engine.setDiamonds(appState.tempoDiamonds);
  engine.setSteps(steps);
  renderAllDiamonds();
  playBtn.textContent = tr("play");
}

/** Score tempo (♩=…) → base BPM; tempo changes at measure starts → diamonds. */
function applyScoreTempo() {
  const info = scoreManager.getScoreTempo();
  if (!info || !info.hasInfo || !(info.startBpm > 0)) return;
  const svgW = appState.layout && appState.layout.svgW;
  const round2 = (v) => Math.round(v * 100) / 100; // keep e.g. 92.5 or 184 exact (no integer rounding drift)
  bpmInput.value = String(round2(info.startBpm));

  const steps = engine.steps;
  const diamonds = [];
  if (svgW) {
    info.changes.forEach((ch, i) => {
      if (ch.beat <= 0) return;
      const step = steps.find((s) => s.beat >= ch.beat - 1e-6);
      if (!step) return;
      const xPx = Math.max(0, step.x - 1); // this step and later use the new tempo
      diamonds.push({ id: Date.now() + i, xPx, ratio: xPx / svgW, bpm: round2(ch.bpm) });
    });
  }
  appState.tempoDiamonds = diamonds;
  engine.setBpm(bpmInput.value);
  engine.setDiamonds(appState.tempoDiamonds);
  renderAllDiamonds();
}

async function ensureScoreLoaded() {
  if (appState.isScoreLoaded) return;
  setScoreLoading(true);
  try {
    await (await getScoreManager()).loadFromFile(appState.musicFile, Number(zoomRange.value));
    await nextFrame();
    rebuildTimeline();
    engine.setTempoWords(scoreManager.tempoWords); // rit. / rall. / accel. / a tempo written in the score
    if (!engine.timedSteps.length) throw new Error(tr("renderNoNotes"));
    if (appState.applyScoreTempo) {
      appState.applyScoreTempo = false;
      applyScoreTempo();
      const sheet = scoreManager.osmd.Sheet; // title/composer also for compressed .mxl files
      try { applyScoreMeta(sheet && sheet.TitleString, sheet && sheet.ComposerString); } catch (_) { /* optional */ }
    }
    appState.isScoreLoaded = true;
    undoReset();
  } finally {
    setScoreLoading(false);
  }
}

nextToPage3Btn.addEventListener("click", async () => {
  if (!appState.musicFile) return;
  nextToPage3Btn.disabled = true;
  try {
    goToPage(3);
    await nextFrame();
    await nextFrame();
    await ensureScoreLoaded();
    refitViewports();
    measureLayout();
  } catch (err) {
    console.error("Nota yükleme hatası:", err);
    goToPage(2);
    notify(tr("scoreLoadFailed") + describeError(err), "error");
  } finally {
    nextToPage3Btn.disabled = false;
  }
});

backToPage2Btn.addEventListener("click", () => {
  engine.stop();
  playBtn.textContent = tr("play");
  goToPage(2);
});

// ---- Seeking: seek bar, click a note, drag the strip, arrow keys ----
function formatClock(s) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, "0")}`;
}

let seekDragging = false;
let lastTimeUiUpdate = 0;

/** Time display + seek bar (~15×/s while playing). */
function updateTimeUi(t) {
  const now = performance.now();
  if (engine.isPlaying && now - lastTimeUiUpdate < 66) return;
  lastTimeUiUpdate = now;
  const total = engine.playEnd || 0; // notes or music, whichever ends later
  timeCurrentEl.textContent = formatClock(Math.min(t, total));
  timeTotalEl.textContent = formatClock(total);
  if (!seekDragging) seekRange.value = total > 0 ? String(Math.round((Math.min(t, total) / total) * 1000)) : "0";
  seekRange.disabled = !(total > 0);
  setRangeFill(seekRange);
}

/** Jump to t; keeps playing, the music follows. */
function seekTo(t, opts) {
  if (!appState.isScoreLoaded) return;
  engine.seek(t, opts);
}

seekRange.addEventListener("input", () => {
  seekDragging = true;
  seekTo((Number(seekRange.value) / 1000) * engine.playEnd, { silent: true });
  timeCurrentEl.textContent = formatClock(engine.getTime());
});
seekRange.addEventListener("change", () => {
  seekDragging = false;
  seekTo((Number(seekRange.value) / 1000) * engine.playEnd); // resync the music
});

// drag: continue from where released; click: continue from the clicked note
let isDragging = false;
let dragStartClientX = 0;
let dragStartTranslate = 0;
let dragMoved = false;
let dragWasPlaying = false;

viewportEl.addEventListener("mousedown", (e) => {
  if (e.button !== 0 || e.target.closest(".score-diamond-pin")) return;
  if (!appState.isScoreLoaded) return;
  isDragging = true;
  dragMoved = false;
  dragStartClientX = e.clientX;
  dragStartTranslate = Number(trackEl.dataset.currentX || 0);
  dragWasPlaying = engine.isPlaying;
  if (dragWasPlaying) engine.stop(); // the player must not pull the strip back while dragging
  viewportEl.style.cursor = "grabbing";
});

window.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  const dx = e.clientX - dragStartClientX;
  if (Math.abs(dx) > 3) dragMoved = true;
  if (!dragMoved) return;
  const newX = dragStartTranslate + dx;
  trackEl.style.transform = `translate(${newX}px, -50%)`;
  trackEl.dataset.currentX = String(newX);
  const centerX = viewportEl.clientWidth / 2 - newX;
  timeCurrentEl.textContent = formatClock(engine.getTimeAtX(centerX));
});

window.addEventListener("mouseup", (e) => {
  if (!isDragging) return;
  isDragging = false;
  viewportEl.style.cursor = "grab";
  let scoreX;
  if (dragMoved) {
    scoreX = viewportEl.clientWidth / 2 - Number(trackEl.dataset.currentX || 0); // note under the playhead
  } else {
    const r = viewportEl.getBoundingClientRect();
    scoreX = e.clientX - r.left - dragStartTranslate; // clicked note
  }
  seekTo(engine.getTimeAtX(scoreX));
  if (dragWasPlaying) {
    engine.start();
    playBtn.textContent = tr("pause");
  }
});

playBtn.addEventListener("click", () => {
  if (engine.isPlaying) {
    engine.stop();
    playBtn.textContent = tr("play");
  } else {
    engine.start();
    playBtn.textContent = engine.isPlaying ? tr("pause") : tr("play");
  updateFinalUi();
  }
});

resetBtn.addEventListener("click", () => {
  engine.reset();
  playBtn.textContent = tr("play");
});

bpmInput.addEventListener("input", (e) => engine.setBpm(e.target.value));

// ---- Fermata stretch (default ×2.0, as MuseScore 4) ----
function setFermataStretch(value) {
  const v = clamp(Number(value) || DEFAULT_FERMATA_STRETCH, 1, 6);
  appState.fermataStretch = v;
  fermataRange.value = String(v);
  fermataVal.textContent = v.toFixed(2);
  engine.setFermataStretch(v);
}
fermataRange.addEventListener("input", (e) => setFermataStretch(e.target.value));

function setPlayhead(on) {
  appState.showPlayhead = on;
  playheadToggle.checked = on;
  viewportEl.classList.toggle("hide-playhead", !on);
}
playheadToggle.addEventListener("change", (e) => setPlayhead(e.target.checked));

// ---- Keyboard view: a piano along the bottom, the keys of the sounding notes pressed in the glow colour ----
const keyboardToggle = $("keyboard-toggle");
function setKeyboard(on) {
  appState.keyboard = !!on;
  keyboardToggle.checked = appState.keyboard;
  viewportEl.classList.toggle("has-keyboard", appState.keyboard);
  syncKeyboardShift();
  drawInfoPreview(engine.getTime());
}
function syncKeyboardShift() {
  const h = appState.keyboard ? keyboardHeight(viewportEl.clientWidth, viewportEl.clientHeight) : 0;
  viewportEl.style.setProperty("--kb-shift", `${Math.round(h / 2)}px`);
}
keyboardToggle.addEventListener("change", (e) => setKeyboard(e.target.checked));

function setAnimTheme(theme) {
  appState.animTheme = theme;
  if (appState.isScoreLoaded) requestAnimationFrame(() => drawInfoPreview(engine.getTime()));
  animThemeButtons.forEach((b) => b.classList.toggle("active", b.dataset.animtheme === theme));
  viewportEl.classList.toggle("dark-anim-theme", theme === "dark");
  viewportEl.classList.toggle("light-anim-theme", theme === "light");
}
animThemeButtons.forEach((btn) => btn.addEventListener("click", () => setAnimTheme(btn.dataset.animtheme)));

// ---- Zoom: CSS scale while dragging, one OSMD re-layout on release (position and play state kept) ----
let zoomTimer = null;
let zoomBusy = false;
let zoomSession = null; // { wasPlaying, t, fromZoom }

function beginZoomSession() {
  if (zoomSession) return zoomSession;
  zoomSession = { wasPlaying: engine.isPlaying, t: engine.getTime(), fromZoom: scoreManager ? scoreManager.currentZoom : Number(zoomRange.value) / 100 };
  if (zoomSession.wasPlaying) {
    engine.stop();
    playBtn.textContent = tr("play");
  }
  return zoomSession;
}

function previewZoom(percent) {
  const s = beginZoomSession();
  const ratio = percent / 100 / s.fromZoom;
  // scale around the note under the playhead so it stays in place
  const centerX = viewportEl.clientWidth / 2 - Number(trackEl.dataset.currentX || 0);
  osmdContainer.style.transformOrigin = `${centerX}px 50%`;
  osmdContainer.style.transform = `scale(${ratio})`;
  scoreDiamondsLayer.style.visibility = "hidden";
}

async function applyZoom() {
  if (zoomBusy) {
    zoomTimer = setTimeout(applyZoom, 120);
    return;
  }
  const session = beginZoomSession();
  const target = Number(zoomRange.value);
  if (!scoreManager || !appState.isScoreLoaded || Math.abs(target / 100 - scoreManager.currentZoom) < 1e-6) {
    endZoomSession();
    return;
  }
  zoomBusy = true;
  setScoreLoading(true);
  try {
    await scoreManager.setZoom(target);
    osmdContainer.style.transform = "";
    await nextFrame();
    rebuildTimeline(); // same musical timing, new x positions
  } catch (err) {
    console.error("Zoom hatası:", err);
    notify(tr("scoreLoadFailed") + describeError(err), "error");
  } finally {
    zoomBusy = false;
    setScoreLoading(false);
    endZoomSession(session);
  }
}

function endZoomSession(session = zoomSession) {
  osmdContainer.style.transform = "";
  scoreDiamondsLayer.style.visibility = "";
  zoomSession = null;
  if (!session) return;
  engine.seek(session.t);
  if (session.wasPlaying) {
    engine.start();
    playBtn.textContent = tr("pause");
  }
}

zoomRange.addEventListener("input", (e) => {
  zoomVal.textContent = e.target.value;
  if (!appState.isScoreLoaded || zoomBusy) return;
  previewZoom(Number(e.target.value));
});
zoomRange.addEventListener("change", () => {
  zoomVal.textContent = zoomRange.value;
  if (!appState.isScoreLoaded) return;
  clearTimeout(zoomTimer);
  zoomTimer = setTimeout(applyZoom, 60); // released (or keyboard step): real re-layout once
});

// ---- Tempo map (diamonds) ----
let pendingDiamondData = null;

function openDiamondModal({ isEdit, existingDiamond, xPx, ratio }) {
  pendingDiamondData = { isEdit, existingDiamond, xPx, ratio };
  modalBpmInput.value = isEdit ? existingDiamond.bpm : bpmInput.value || 120;
  modalDeleteBtn.style.display = isEdit ? "inline-block" : "none";
  diamondModal.style.display = "flex";
  modalBpmInput.focus();
}

function closeDiamondModal() {
  diamondModal.style.display = "none";
  pendingDiamondData = null;
}

function saveDiamondModal() {
  if (!pendingDiamondData) return;
  const val = Number(modalBpmInput.value);
  if (!Number.isFinite(val) || val < 20 || val > 400) return;

  if (pendingDiamondData.isEdit) {
    pendingDiamondData.existingDiamond.bpm = val;
  } else {
    appState.tempoDiamonds.push({
      id: Date.now(),
      xPx: pendingDiamondData.xPx,
      ratio: pendingDiamondData.ratio,
      bpm: val
    });
  }
  engine.setDiamonds(appState.tempoDiamonds);
  renderAllDiamonds();
  closeDiamondModal();
}

modalCancelBtn.addEventListener("click", closeDiamondModal);
modalSaveBtn.addEventListener("click", saveDiamondModal);
modalBpmInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveDiamondModal();
  if (e.key === "Escape") closeDiamondModal();
});

modalDeleteBtn.addEventListener("click", () => {
  if (pendingDiamondData && pendingDiamondData.isEdit) {
    const id = pendingDiamondData.existingDiamond.id;
    appState.tempoDiamonds = appState.tempoDiamonds.filter((d) => d.id !== id);
    engine.setDiamonds(appState.tempoDiamonds);
    renderAllDiamonds();
  }
  closeDiamondModal();
});

function renderAllDiamonds() {
  diamondTrack.innerHTML = "";
  scoreDiamondsLayer.innerHTML = "";
  lblDiamondCount.textContent = tr("diamondCount", { n: appState.tempoDiamonds.length });

  appState.tempoDiamonds.sort((a, b) => a.xPx - b.xPx).forEach((d) => {
    const stripMarker = document.createElement("div");
    stripMarker.className = "diamond-marker";
    stripMarker.style.left = `${clamp((d.ratio || 0) * 100, 0, 100)}%`;
    stripMarker.addEventListener("click", (evt) => {
      evt.stopPropagation();
      openDiamondModal({ isEdit: true, existingDiamond: d });
    });
    diamondTrack.appendChild(stripMarker);

    const scorePin = document.createElement("div");
    scorePin.className = "score-diamond-pin";
    scorePin.style.left = `${d.xPx}px`;
    const shape = document.createElement("div");
    shape.className = "score-diamond-shape";
    const label = document.createElement("div");
    label.className = "score-diamond-label";
    label.textContent = `♩=${Number(d.bpm)}`;
    scorePin.append(shape, label);
    scorePin.addEventListener("click", (evt) => {
      evt.stopPropagation();
      openDiamondModal({ isEdit: true, existingDiamond: d });
    });
    scoreDiamondsLayer.appendChild(scorePin);
  });
}


// ---- Tap tempo: the median of the last taps; a pause of 2.5 s starts a new count ----
const tapBtn = $("tap-btn");
const tapBpmEl = $("tap-bpm");
const tapApplyBtn = $("tap-apply");
const tapTimes = [];
let tapBpm = 0;
function tapTempo() {
  const now = performance.now();
  if (tapTimes.length && now - tapTimes[tapTimes.length - 1] > 2500) tapTimes.length = 0;
  tapTimes.push(now);
  if (tapTimes.length > 9) tapTimes.shift();
  tapBtn.classList.add("tapped");
  setTimeout(() => tapBtn.classList.remove("tapped"), 90);
  if (tapTimes.length < 3) {
    tapBpmEl.textContent = "♩ …";
    return;
  }
  const gaps = tapTimes.slice(1).map((t, i) => t - tapTimes[i]).sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  tapBpm = clamp(Math.round((60000 / median) * 10) / 10, 20, 400);
  tapBpmEl.textContent = `♩ ${tapBpm}`;
  tapApplyBtn.disabled = !appState.isScoreLoaded;
}
tapBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); tapTempo(); });
tapBtn.addEventListener("click", (e) => { if (e.detail === 0) tapTempo(); }); // keyboard activation
tapApplyBtn.addEventListener("click", () => {
  if (!tapBpm || !appState.isScoreLoaded) return;
  const layout = measureLayout();
  const translateX = Number(trackEl.dataset.currentX || 0);
  const x = layout && layout.svgW ? clamp(viewportEl.clientWidth / 2 - translateX, 0, layout.svgW) : 0;
  const first = engine.steps && engine.steps.length ? engine.steps[0].x : 0;
  if (!layout || !layout.svgW || x <= first + 2) {
    // at the beginning: the start tempo
    bpmInput.value = String(tapBpm);
    engine.setBpm(bpmInput.value);
    toast(tr("tapSetStart", { bpm: tapBpm }));
  } else {
    // later in the score: a tempo diamond at the playhead (one already there is updated)
    const near = appState.tempoDiamonds.find((d) => Math.abs(d.xPx - x) < 3);
    if (near) near.bpm = tapBpm;
    else appState.tempoDiamonds.push({ id: Date.now(), xPx: x, ratio: x / layout.svgW, bpm: tapBpm });
    engine.setDiamonds(appState.tempoDiamonds);
    renderAllDiamonds();
    toast(tr("tapSetDiamond", { bpm: tapBpm }));
  }
});

addDiamondBtn.addEventListener("click", () => {
  if (!appState.isScoreLoaded) return;
  if (engine.isPlaying) {
    engine.stop();
    playBtn.textContent = tr("play");
  }
  const layout = measureLayout();
  if (!layout || !layout.svgW) return;
  const translateX = Number(trackEl.dataset.currentX || 0);
  const exactNoteX = clamp(viewportEl.clientWidth / 2 - translateX, 0, layout.svgW);
  openDiamondModal({ isEdit: false, xPx: exactNoteX, ratio: exactNoteX / layout.svgW });
});

// ---- Score strip export ----
function refreshStripBgOption() {
  const hasMedia = !!appState.bgSettings.type;
  stripBgBlur.disabled = !hasMedia;
  if (!hasMedia) stripBgBlur.checked = false;
  stripBgRow.classList.toggle("disabled-row", !hasMedia);
  stripBgHint.textContent = hasMedia ? tr("stripBgHint") : tr("stripBgNeedsMedia");
}

exportStripBtn.addEventListener("click", () => {
  if (!appState.isScoreLoaded) return;
  refreshStripBgOption();
  stripExportModal.style.display = "flex";
});

stripModalCancel.addEventListener("click", () => {
  stripExportModal.style.display = "none";
});

stripFmtBtns.forEach((btn) => {
  btn.addEventListener("click", async () => {
    const fmt = btn.dataset.fmt;
    stripExportModal.style.display = "none";
    exportStripBtn.disabled = true;
    exportStripBtn.textContent = tr("preparingImage");
    try {
      measureLayout();
      const files = await renderEngine.exportStrip({
        format: fmt,
        baseName: baseNameOfMusic(),
        bgBlur: stripBgBlur.checked && fmt !== "svg"
      });
      const ext = files[0].fileName.split(".").pop();
      const saved = await saveImages(ext, files.map((f) => ({ name: f.fileName.replace(/\.[^.]+$/, ""), blob: f.blob })));
      if (saved && saved.length) {
        const f0 = files[0];
        let msg = `${tr("stripSaved", { n: saved.length })} ${f0.width}×${f0.height}`;
        if (f0.downscaled) msg += `\n${tr("stripDownscaled")}`;
        notify(msg);
      }
    } catch (err) {
      console.error(err);
      notify(tr("stripFailed") + describeError(err), "error");
    } finally {
      exportStripBtn.disabled = false;
      exportStripBtn.textContent = tr("exportStrip");
    }
  });
});

toPage4Btn.addEventListener("click", () => {
  if (!appState.isScoreLoaded) return;
  engine.stop();
  playBtn.textContent = tr("play");
  measureLayout(); // CRITICAL: page 3 is still visible — measure now
  refreshSummary();
  setStatusKey("readyToRender");
  renderProgressBar.style.width = "0%";
  setRenderVisual(false, 0);
  renderOpenBtn.style.display = "none";
  goToPage(4);
});

// =================================================================================================
// 9) Page 4 — render
// =================================================================================================
function setStatusKey(key) {
  appState.statusKey = key;
  successDesc.textContent = tr(key);
  successDesc.className = "render-status-text";
}

function setStatusText(text, kind = "") {
  appState.statusKey = null;
  successDesc.textContent = text;
  successDesc.className = "render-status-text" + (kind ? ` ${kind}` : "");
}

/** The Echo spiral (ui/renderSpinner.js) turns only while a render runs (class "rendering"); otherwise it rests. */
// taskbar progress and a system notification (desktop only; no-ops in the browser)
const desktopApp = () => (window.echo && window.echo.app) || null;
function taskbarProgress(value, mode) {
  const a = desktopApp();
  if (a && a.progress) a.progress(value, mode).catch(() => {});
}
function systemNotify(title, body) {
  const a = desktopApp();
  if (a && a.notify) a.notify(title, body).catch(() => {});
}

function setRenderVisual(running, pct = null) {
  renderActionArea.classList.toggle("rendering", running);
  if (pct !== null) renderPct.textContent = `${Math.round(pct)}%`;
  if (!running) renderEta.textContent = "";
}

function setRenderUi(running) {
  appState.rendering = running;
  setRenderVisual(running);
  renderBtn.disabled = running;
  renderCancelBtn.disabled = !running;
  renderPauseBtn.disabled = !running;
  renderPauseBtn.textContent = tr("pauseRender");
  if (running) renderOpenBtn.style.display = "none";
  backToPage4Btn.disabled = running;
  restartBtn.disabled = running;
  saveProjectBtn3.disabled = running;
}

function setFormat(format) {
  appState.format = format;
  formatPills.forEach((p) => {
    const radio = p.querySelector("input");
    const active = radio.value === format;
    radio.checked = active;
    p.classList.toggle("active", active);
  });
  updateConfigSummary();
}

formatPills.forEach((pill) => {
  pill.addEventListener("click", () => setFormat(pill.querySelector("input").value));
});

backToPage3Btn.addEventListener("click", () => goToPage(3));
backToPage4Btn.addEventListener("click", () => goToPage(4));
toPage5Btn.addEventListener("click", () => {
  refreshSummary();
  goToPage(5);
});

renderCancelBtn.addEventListener("click", () => renderEngine.cancel());

// pause: the render loop just waits (no CPU load)
let pausedAt = 0;
let lastRenderPct = 0;
renderPauseBtn.addEventListener("click", () => {
  if (!appState.rendering) return;
  if (renderEngine.paused) {
    renderEngine.resume();
    renderPausedTotal += performance.now() - pausedAt;
    renderPauseBtn.textContent = tr("pauseRender");
    renderActionArea.classList.add("rendering");
    taskbarProgress(lastRenderPct / 100, "normal");
  } else {
    renderEngine.pause();
    pausedAt = performance.now();
    renderPauseBtn.textContent = tr("resumeRender");
    renderActionArea.classList.remove("rendering"); // the seal stops while paused
    renderEta.textContent = tr("renderPaused");
    taskbarProgress(lastRenderPct / 100, "paused");
  }
});
renderOpenBtn.addEventListener("click", () => showInFolder(appState.lastOutputPath).catch(console.error));

renderBtn.addEventListener("click", async () => {
  if (appState.rendering) return;
  const { width, height } = getRenderDimensions(appState.aspect, appState.resolution);
  const fps = appState.fps || 60;

  stopAudioPreview();
  disposeFinalPreview(); // frees its memory for the render
  setRenderUi(true);
  renderProgressBar.style.width = "0%";
  setRenderVisual(true, 0);

  let encodeStart = 0;
  renderPausedTotal = 0;
  const onProgress = (info) => {
    const pct = info.pct ?? 0;
    lastRenderPct = pct;
    if (!renderEngine.paused) taskbarProgress(pct / 100, "normal");
    renderProgressBar.style.width = `${pct}%`;
    renderPct.textContent = `${pct}%`;
    let status;
    if (info.phase === "prepare") status = tr("renderPrepare");
    else if (info.phase === "finalize") {
      status = tr("renderFinalize");
      renderEta.textContent = "";
    } else {
      status = tr("renderFrame", {
        frame: info.frame,
        total: info.total,
        time: info.time.toFixed(1),
        duration: info.duration.toFixed(1)
      });
      // remaining time from the average speed (after a few seconds)
      const now = performance.now();
      if (!encodeStart) encodeStart = now;
      const elapsed = (now - encodeStart - renderPausedTotal) / 1000;
      if (elapsed > 3 && info.frame > 0 && !renderEngine.paused) {
        const remaining = ((info.total - info.frame) * elapsed) / info.frame;
        renderEta.textContent = tr("renderEta", { eta: formatSeconds(Math.max(1, remaining)) });
      }
    }
    setStatusText(tr("renderProgress", { w: width, h: height, fps, pct, status }));
  };

  const a = appState.audio;
  try {
    const result = await renderEngine.startRender(
      {
        width,
        height,
        fps,
        format: appState.format,
        baseName: baseNameOfMusic(),
        openSink: openVideoSink,
        audio: a.buffer ? { buffer: a.buffer, offset: a.offset, volume: a.volume / 100, extendToAudio: true } : null,
        cards: await prepareCardsForRender(),
        fx: fxLevelsNow(),
        leadIn: appState.leadIn,
        bitrateMbps: appState.bitrate
      },
      onProgress
    );
    renderProgressBar.style.width = "100%";
    console.info("[render]", result.codec, result.width + "x" + result.height + "@" + result.fps, JSON.stringify(result.stats));
    appState.lastOutputPath = result.path || null;
    let msg = tr("renderDone", { w: result.width, h: result.height, fps: result.fps, name: result.fileName });
    if (result.fellBack) msg += " " + tr("renderFallback");
    if (result.audioDropped) msg += " " + tr("renderAudioDropped");
    setStatusText(msg, "ok");
    Sfx.chime();
    renderSpinner.done();
    systemNotify(tr("notifyDoneTitle"), result.fileName || "");
    renderOpenBtn.style.display = result.path ? "" : "none";
  } catch (err) {
    if (err && err.code === "CANCELLED") {
      renderProgressBar.style.width = "0%";
      renderPct.textContent = "0%";
      setStatusText(tr("renderCancelled"));
    } else {
      console.error("Render hatası:", err);
      setStatusText(tr("renderFailed") + describeError(err), "error");
      systemNotify(tr("notifyFailTitle"), describeError(err));
    }
  } finally {
    setRenderUi(false);
    lastRenderPct = 0;
    taskbarProgress(-1);
  }
});

// ---- Final video preview (page 4): the render's own frame code, smaller and in real time, with sound ----
const leadInToggle = $("lead-in-toggle");
const finalCanvas = $("final-preview-canvas");
const finalOverlay = $("final-preview-overlay");
const finalStartBtn = $("final-preview-start");
const finalPlayBtn = $("final-preview-play");
const finalSeek = $("final-preview-seek");
const finalTime = $("final-preview-time");
const finalSections = $("final-preview-sections");
let finalPlayer = null;
let finalBuilding = null;
let finalSeeking = false;

function setLeadIn(on) {
  appState.leadIn = !!on;
  leadInToggle.checked = appState.leadIn;
}
leadInToggle.addEventListener("change", () => {
  setLeadIn(leadInToggle.checked);
  disposeFinalPreview(); // rebuilt on the next play
});

/** Preview size: the output frame scaled down to at most 960×540 (or 540 high for portrait). */
function finalPreviewSize() {
  const { width, height } = getRenderDimensions(appState.aspect, appState.resolution);
  const s = Math.min(1, 960 / width, 540 / height);
  return { width: Math.round(width * s), height: Math.round(height * s) };
}

function updateFinalUi() {
  const p = finalPlayer;
  finalPlayBtn.disabled = !p;
  finalSeek.disabled = !p;
  finalPlayBtn.textContent = p && p.playing ? tr("pause") : tr("play");
  const t = p ? p.time : 0;
  const d = p ? p.duration : 0;
  finalTime.textContent = `${formatSeconds(t)} / ${formatSeconds(d)}`;
  if (p && !finalSeeking) finalSeek.value = String(d > 0 ? Math.round((t / d) * 1000) : 0);
  setRangeFill(finalSeek);
}

function renderSectionBar(parts) {
  finalSections.replaceChildren();
  const total = parts.reduce((s, x) => s + x.d, 0);
  for (const x of parts) {
    if (!(x.d > 0)) continue;
    const el = document.createElement("span");
    el.className = x.cls;
    el.style.flex = String(x.d / total);
    el.textContent = x.label;
    el.title = `${x.label} — ${x.d.toFixed(1)} s`;
    finalSections.append(el);
  }
}

function disposeFinalPreview() {
  if (finalPlayer) { finalPlayer.dispose(); finalPlayer = null; }
  finalOverlay.classList.remove("hidden", "busy");
  finalSections.replaceChildren();
  const ctx = finalCanvas.getContext("2d");
  ctx.clearRect(0, 0, finalCanvas.width, finalCanvas.height);
  updateFinalUi();
}

async function buildFinalPreview() {
  if (finalPlayer) return finalPlayer;
  if (finalBuilding) return finalBuilding;
  if (appState.rendering) return null;
  finalOverlay.classList.add("busy");
  finalStartBtn.textContent = tr("finalPreviewPreparing");
  const { width, height } = finalPreviewSize();
  const a = appState.audio;
  finalBuilding = (async () => {
    try {
      const cards = await prepareCardsForRender();
      const player = await renderEngine.createPreview({
        width, height, fps: Math.min(30, appState.fps || 30),
        audio: a.buffer ? { buffer: a.buffer, offset: a.offset, volume: a.volume / 100, extendToAudio: true } : null,
        cards,
        fx: fxLevelsNow(),
        leadIn: appState.leadIn
      }, finalCanvas);
      if (currentPage !== 4 || appState.rendering) { player.dispose(); return null; } // left meanwhile
      finalPlayer = player;
      player.onTime(updateFinalUi);
      player.onEnd(updateFinalUi);
      const introD = listDuration(cards.intro.map((c) => c.card));
      const outroD = listDuration(cards.outro.map((c) => c.card));
      const lead = appState.leadIn ? LEAD_IN_SECONDS : 0;
      renderSectionBar([
        { d: introD, cls: "sec-card", label: tr("cardIntro") },
        { d: lead, cls: "sec-lead", label: "" },
        { d: player.duration - introD - 2 * lead - outroD, cls: "sec-notes", label: tr("finalPreviewNotes") },
        { d: lead, cls: "sec-lead", label: "" },
        { d: outroD, cls: "sec-card", label: tr("cardOutro") }
      ]);
      finalOverlay.classList.add("hidden");
      updateFinalUi();
      return player;
    } catch (err) {
      console.error("Önizleme hatası:", err);
      notify(tr("finalPreviewFailed") + describeError(err), "error");
      return null;
    } finally {
      finalBuilding = null;
      finalOverlay.classList.remove("busy");
      finalStartBtn.textContent = tr("finalPreviewStart");
    }
  })();
  return finalBuilding;
}

finalStartBtn.addEventListener("click", async () => {
  const p = await buildFinalPreview();
  if (p) { await p.play(); updateFinalUi(); }
});
finalPlayBtn.addEventListener("click", async () => {
  const p = finalPlayer;
  if (!p) return;
  if (p.playing) p.pause();
  else await p.play();
  updateFinalUi();
});
finalSeek.addEventListener("input", () => {
  if (!finalPlayer) return;
  finalSeeking = true;
  const t = (Number(finalSeek.value) / 1000) * finalPlayer.duration;
  finalTime.textContent = `${formatSeconds(t)} / ${formatSeconds(finalPlayer.duration)}`;
});
finalSeek.addEventListener("change", async () => {
  if (!finalPlayer) return;
  await finalPlayer.seek((Number(finalSeek.value) / 1000) * finalPlayer.duration);
  finalSeeking = false;
  updateFinalUi();
});

restartBtn.addEventListener("click", () => {
  // new project: reset everything
  engine.stop();
  appState.musicFile = null;
  appState.musicFileName = "";
  appState.isScoreLoaded = false;
  appState.layout = null;
  appState.projectId = null;
  appState.tempoDiamonds = [];
  appState.lastOutputPath = null;
  engine.setSteps([]);
  engine.setTempoWords(null);
  engine.setDiamonds([]);
  renderAllDiamonds();
  clearBackground();
  clearAudio();
  clearCards();
  appState.scoreMeta = { title: "", composer: "" };
  refreshCardEditor();
  setStatusKey("readyToRender");
  renderProgressBar.style.width = "0%";
  renderOpenBtn.style.display = "none";
  refreshMusicFileState();
  refreshSummary();
  savedSignature = null;
  goToPage(1);
});

// =================================================================================================
// 9b) Live info in a corner of the video (page 3 settings; drawn over the preview and into the video)
// =================================================================================================
function setInfo(info) {
  appState.info = normalizeInfo(info);
  infoBpmToggle.checked = appState.info.bpm;
  infoNotesToggle.checked = appState.info.notes;
  infoSpeedToggle.checked = appState.info.speed;
  activatePill(infoCornerButtons, "corner", appState.info.corner);
  appState.infoLabels = infoLabels();
  if (infoActive(appState.info)) ensureInfoFont().then(() => drawInfoPreview(engine.getTime()));
  drawInfoPreview(engine.getTime());
}
/** The words of the overlay in the interface language (the render reads them from appState too). */
function infoLabels() {
  return { notes: tr("ovLabelNotes"), speed: tr("ovLabelSpeed"), perSecond: tr("ovPerSecond"), tempo: tr("ovLabelTempo") };
}
function drawInfoPreview(t) {
  const W = viewportEl.clientWidth;
  const H = viewportEl.clientHeight;
  if (!W || !H) return;
  const dpr = window.devicePixelRatio || 1;
  const cw = Math.round(W * dpr);
  const ch = Math.round(H * dpr);
  if (infoCanvas.width !== cw || infoCanvas.height !== ch) { infoCanvas.width = cw; infoCanvas.height = ch; }
  const ctx = infoCanvas.getContext("2d");
  ctx.clearRect(0, 0, cw, ch);
  if (!appState.isScoreLoaded) return;
  let kbH = 0;
  if (appState.keyboard) {
    const r = engine.keyRange;
    const colors = [appState.activeColor, appState.dualColor ? appState.activeColor2 || appState.activeColor : appState.activeColor];
    drawKeyboard(ctx, cw, ch, t >= 0 ? engine.keysAt(t) : null, keyboardRange(r && r.lo, r && r.hi, cw / ch), colors);
    kbH = keyboardHeight(cw, ch);
  }
  if (!infoActive(appState.info)) return;
  appState.infoLabels = infoLabels();
  drawInfoOverlay(ctx, cw, ch - kbH, appState.info, infoValues(engine, t), appState.infoLabels, previewInfoTone());
}
infoBpmToggle.addEventListener("change", () => setInfo({ ...appState.info, bpm: infoBpmToggle.checked }));
infoSpeedToggle.addEventListener("change", () => setInfo({ ...appState.info, speed: infoSpeedToggle.checked }));
infoNotesToggle.addEventListener("change", () => setInfo({ ...appState.info, notes: infoNotesToggle.checked }));
infoCornerButtons.forEach((b) => b.addEventListener("click", () => setInfo({ ...appState.info, corner: b.dataset.corner })));

// =================================================================================================
// 10) Projects: save / load
// =================================================================================================
function collectSettings() {
  return {
    fps: appState.fps,
    aspect: appState.aspect,
    resolution: appState.resolution,
    bitrate: appState.bitrate,
    activeColor: appState.activeColor,
    activeColor2: appState.activeColor2,
    dualColor: appState.dualColor,
    format: appState.format,
    animTheme: appState.animTheme,
    zoom: Number(zoomRange.value),
    bpm: Number(bpmInput.value),
    fermataStretch: appState.fermataStretch,
    showPlayhead: appState.showPlayhead,
    info: { ...appState.info },
    keyboard: appState.keyboard,
    diamonds: appState.tempoDiamonds.map((d) => ({ id: d.id, ratio: d.ratio, bpm: d.bpm })),
    bg: {
      scale: appState.bgSettings.scale,
      opacity: appState.bgSettings.opacity,
      posX: appState.bgSettings.posX,
      posY: appState.bgSettings.posY,
      grayscale: appState.bgSettings.grayscale,
      loop: appState.bgSettings.loop,
      preset: appState.bgSettings.preset
    },
    audio: {
      offset: appState.audio.offset,
      volume: appState.audio.volume,
      extendToAudio: appState.audio.extendToAudio
    },
    fx: { ...appState.fx },
    leadIn: appState.leadIn,
    cards: { intro: appState.cards.intro.map(cardSettings), outro: appState.cards.outro.map(cardSettings) }
  };
}

/** Saved screen list -> cards (videos are attached afterwards). Older projects stored one card with "enabled". */
function cardsFromSettings(kind, saved) {
  const list = Array.isArray(saved) ? saved : (saved && saved.enabled ? [saved] : []);
  return list.slice(0, MAX_CARDS).map((s) => {
    const card = defaultCard(kind, s.textEnabled ? "text" : "video");
    card.template = CARD_TEMPLATES.includes(s.template) ? s.template : "classic";
    card.textOrder = TEXT_ORDERS.includes(s.textOrder) ? s.textOrder : "together"; // older projects: text over the video
    card.duration = clamp(Number(s.duration) || 5, 1, 60);
    card.fields = { ...card.fields, ...(s.fields || {}) };
    card.hasVideo = Array.isArray(saved) ? !!s.hasVideo : true; // old format: the single video slot
    return card;
  });
}

function applySettings(s, { keepCards = false } = {}) {
  if (s.fps) { appState.fps = Number(s.fps); activatePill(fpsButtons, "fps", s.fps); }
  if (s.aspect && ASPECTS[s.aspect]) { appState.aspect = s.aspect; activatePill(aspectButtons, "aspect", s.aspect); }
  if (s.resolution) { appState.resolution = s.resolution; activatePill(resButtons, "res", s.resolution); }
  appState.bitrate = 0; // 1.0.1: always automatic (from size and frame rate); the choice was removed
  appState.colorTarget = "a";
  if (s.activeColor) appState.activeColor = normalizeHex(s.activeColor) || appState.activeColor;
  if (s.activeColor2) appState.activeColor2 = normalizeHex(s.activeColor2) || appState.activeColor2;
  setDualColor(!!s.dualColor);
  colorPicker.setColor(appState.activeColor, { silent: true });
  updateColorVars();
  if (s.format === "mp4" || s.format === "webm") setFormat(s.format);
  if (s.animTheme === "dark" || s.animTheme === "light") setAnimTheme(s.animTheme);
  if (s.zoom) { zoomRange.value = s.zoom; zoomVal.textContent = String(s.zoom); }
  if (s.bpm) bpmInput.value = s.bpm;
  setFermataStretch(s.fermataStretch ?? DEFAULT_FERMATA_STRETCH);
  setPlayhead(s.showPlayhead !== false);
  setInfo(normalizeInfo(s.info));
  setKeyboard(!!s.keyboard);
  if (s.bg) {
    Object.assign(appState.bgSettings, {
      scale: s.bg.scale ?? 100,
      opacity: s.bg.opacity ?? 50,
      posX: s.bg.posX ?? 0,
      posY: s.bg.posY ?? 0,
      grayscale: !!s.bg.grayscale,
      loop: s.bg.loop !== false,
      preset: keepCards ? appState.bgSettings.preset : (BG_PRESETS.includes(s.bg.preset) ? s.bg.preset : null)
    });
    syncBgControls();
    applyBgTransforms();
  }
  const au = s.audio || {};
  appState.audio.offset = Number(au.offset) || 0;
  appState.audio.volume = Number.isFinite(Number(au.volume)) ? Number(au.volume) : 100;
  appState.audio.extendToAudio = !!au.extendToAudio;
  syncAudioControls();
  if (s.fx) {
    const lvl = (v) => clamp(Number(v) || DEFAULT_FX_INTENSITY, 0.05, 1);
    // older projects had one switch for both effects
    appState.fx = {
      fogOn: !!(s.fx.fogOn ?? s.fx.enabled), fog: lvl(s.fx.fog ?? s.fx.intensity),
      embersOn: !!(s.fx.embersOn ?? s.fx.enabled), embers: lvl(s.fx.embers ?? s.fx.intensity)
    };
  }
  applyFx();
  setLeadIn(s.leadIn !== false);
  if (keepCards) { // undo / redo: the screens and their videos stay as they are
    updateConfigSummary();
    refitViewports();
    return;
  }
  clearCards();
  if (s.cards) {
    appState.cards.intro = cardsFromSettings("intro", s.cards.intro);
    appState.cards.outro = cardsFromSettings("outro", s.cards.outro);
  }
  appState.cardEditing = { list: "intro", index: -1 };
  refreshCardEditor();
  updateConfigSummary();
  refitViewports();
}

/** Everything a saved project holds, as one string: differs from savedSignature = unsaved changes. */
let savedSignature = null;
function projectSignature() {
  if (!appState.musicFile) return null; // nothing to save
  const f = (x) => (x ? `${x.name}|${x.size}|${x.lastModified}` : "");
  return JSON.stringify([
    collectSettings(), f(appState.musicFile), appState.bgSettings.type ? f(appState.bgFile) : "", f(appState.audio.file),
    appState.cards.intro.map((c) => f(c.videoFile)), appState.cards.outro.map((c) => f(c.videoFile))
  ]);
}
function isProjectDirty() {
  const s = projectSignature();
  return s !== null && s !== savedSignature;
}

// ---- Undo / redo (Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z): snapshots of the settings, taken when they settle ----
// Screens (intro / outro) and the files themselves are not part of it; a ready-made background keeps its picture.
const UNDO_LIMIT = 100;
const undoStack = [];
const redoStack = [];
let undoLast = null; // the settled state the next change is compared with
let undoRestoring = false;
const undoSnapshot = () => {
  const s = collectSettings();
  delete s.cards;
  return JSON.stringify(s);
};
function undoWatch() {
  if (!appState.isScoreLoaded || appState.rendering || undoRestoring || zoomBusy) return;
  if (document.querySelector(":active")) return; // a slider is still being dragged
  const now = undoSnapshot();
  if (undoLast === null) { undoLast = now; return; }
  if (now === undoLast) return;
  undoStack.push(undoLast);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0;
  undoLast = now;
}
function undoReset() {
  undoStack.length = 0;
  redoStack.length = 0;
  undoLast = null;
}
function restoreSnapshot(json) {
  const s = JSON.parse(json);
  const zoomBefore = Number(zoomRange.value);
  undoRestoring = true;
  try {
    applySettings(s, { keepCards: true });
    engine.setBpm(bpmInput.value);
    appState.tempoDiamonds = (s.diamonds || []).map((d, i) => ({ id: d.id || Date.now() + i, ratio: d.ratio, bpm: d.bpm, xPx: 0 }));
    syncDiamondPositions();
    engine.setDiamonds(appState.tempoDiamonds);
    renderAllDiamonds();
    updateMusicEnd();
    refreshSummary();
  } finally {
    undoRestoring = false;
  }
  undoLast = undoSnapshot(); // as it now stands (applying may normalise a value)
  if (Number(zoomRange.value) !== zoomBefore) applyZoom();
}
function undoStep(dir) {
  if (!appState.isScoreLoaded || appState.rendering) return;
  undoWatch(); // a change not yet recorded becomes a step first
  const from = dir < 0 ? undoStack : redoStack;
  const to = dir < 0 ? redoStack : undoStack;
  if (!from.length) {
    toast(tr(dir < 0 ? "undoNone" : "redoNone"));
    return;
  }
  to.push(undoLast);
  restoreSnapshot(from.pop());
  toast(tr(dir < 0 ? "undoDone" : "redoDone"));
}
setInterval(undoWatch, 400);

// ---- Autosave: a project saved once is saved again quietly every two minutes while it has changes ----
const AUTOSAVE_MS = 120000;
setInterval(() => {
  if (!appState.projectId || appState.rendering || !isProjectDirty() || isDialogOpen()) return;
  saveCurrentProject({ quiet: true });
}, AUTOSAVE_MS);

/** @returns true when the project was saved */
async function saveCurrentProject({ quiet = false } = {}) {
  if (!projectStore.isAvailable()) {
    notify(tr("projUnavailable"));
    return false;
  }
  if (!appState.musicFile) {
    notify(tr("projNeedFile"));
    return false;
  }
  try {
    const name = baseNameOfMusic();
    const id = await projectStore.saveProject({
      id: appState.projectId,
      name,
      settings: collectSettings(),
      musicFile: appState.musicFile,
      bgFile: appState.bgSettings.type ? appState.bgFile : null,
      audioFile: appState.audio.file,
      introFiles: appState.cards.intro.map((c) => c.videoFile || null),
      outroFiles: appState.cards.outro.map((c) => c.videoFile || null)
    });
    appState.projectId = id;
    savedSignature = projectSignature();
    refreshProjectsList();
    if (quiet) toast(tr("projAutoSaved", { name }));
    else notify(tr("projSaved", { name }));
    return true;
  } catch (err) {
    console.error(err);
    notify(tr("projSaveFailed") + describeError(err), "error");
    return false;
  }
}

async function loadProjectById(id) {
  try {
    const p = await projectStore.loadProject(id);
    engine.stop();
    applySettings(p.settings);
    handleMusicFileSelect(p.musicFile, { fromProject: true });
    appState.projectId = p.id;
    // attach the saved videos; a screen whose video is missing keeps its text or is dropped
    for (const kind of ["intro", "outro"]) {
      const files = kind === "intro" ? p.introFiles : p.outroFiles;
      const list = appState.cards[kind];
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (c.hasVideo && files[i]) await setCardVideo(c, files[i]);
        delete c.hasVideo;
      }
      appState.cards[kind] = list.filter((c) => cardDuration(c) > 0);
    }
    appState.cardEditing = { list: "intro", index: -1 };
    refreshCardEditor();
    if (p.bgFile) applyBackgroundFile(p.bgFile);
    else clearBackground();
    if (p.audioFile) {
      const { offset, volume, extendToAudio } = appState.audio;
      await applyAudioFile(p.audioFile);
      Object.assign(appState.audio, { offset, volume, extendToAudio }); // clearAudio keeps these settings
      syncAudioControls();
      updateMusicEnd();
    } else {
      clearAudio();
    }

    // diamonds get their x when the score is laid out (syncDiamondPositions)
    appState.tempoDiamonds = (p.settings.diamonds || []).map((d, i) => ({
      id: d.id || Date.now() + i,
      ratio: d.ratio,
      bpm: d.bpm,
      xPx: 0
    }));
    renderAllDiamonds();
    refreshSummary();
    savedSignature = projectSignature(); // as saved: no changes yet
  } catch (err) {
    console.error(err);
    notify(tr("projLoadFailed") + describeError(err), "error");
  }
}

let projectsListToken = 0;
async function refreshProjectsList() {
  const token = ++projectsListToken;
  const list = await projectStore.listProjects();
  if (token !== projectsListToken) return; // daha yeni bir istek var
  projectsListContainer.innerHTML = "";
  if (list.length === 0) {
    const span = document.createElement("span");
    span.className = "no-projects-text";
    span.textContent = tr("noProjects");
    projectsListContainer.appendChild(span);
    return;
  }
  list.forEach((p) => {
    const pill = document.createElement("div");
    pill.className = "project-pill-item";

    const label = document.createElement("span");
    label.textContent = p.name;
    pill.appendChild(label);

    const del = document.createElement("button");
    del.className = "project-pill-del";
    del.textContent = "×";
    del.title = tr("projDelete");
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      const ok = await confirmDialog({
        title: tr("dialogConfirm"),
        message: `${tr("projDeleteConfirm")}\n${p.name}`,
        okLabel: tr("projDelete"),
        cancelLabel: tr("cancel"),
        danger: true
      });
      if (!ok) return;
      try {
        await projectStore.deleteProject(p.id);
        if (appState.projectId === p.id) appState.projectId = null;
      } catch (err) {
        console.error(err);
      }
      refreshProjectsList();
    });
    pill.appendChild(del);

    pill.addEventListener("click", () => loadProjectById(p.id));
    projectsListContainer.appendChild(pill);
  });
}

saveProjectBtn2.addEventListener("click", saveCurrentProject);
saveProjectBtn3.addEventListener("click", saveCurrentProject);

// The window's close button: an unsaved project is not lost by accident. The main process keeps the window open
// and asks the page (electron/main.js "close"); the page asks the user; Cancel keeps the app open.
let closeAsking = false;
const closeApp = () => {
  if (window.echo && window.echo.app && window.echo.app.closeNow) window.echo.app.closeNow().catch(() => window.close());
  else window.close();
};
if (window.echo && window.echo.app && window.echo.app.onCloseRequest) {
  window.echo.app.onCloseRequest(() => {
    if (isDialogOpen() && !closeAsking) return; // another dialog is open: answer that first
    if (!isProjectDirty()) closeApp();
    else askBeforeClose();
  });
}
async function askBeforeClose() {
  if (closeAsking) return;
  closeAsking = true;
  try {
    const choice = await showDialog({
      title: tr("unsavedTitle"),
      message: tr("unsavedMsg", { name: baseNameOfMusic() }),
      buttons: [
        { label: tr("cancel"), value: "cancel", kind: "secondary" },
        { label: tr("unsavedDiscard"), value: "discard", kind: "danger" },
        { label: tr("unsavedSave"), value: "save", kind: "positive" }
      ],
      cancelValue: "cancel"
    });
    if (choice === "cancel") return;
    if (choice === "save" && !(await saveCurrentProject())) return; // not saved: stay open
    closeApp();
  } finally {
    closeAsking = false;
  }
}

// =================================================================================================
// 11) Keyboard shortcuts
// =================================================================================================
function isTypingTarget(el) {
  if (!el) return false;
  const tag = (el.tagName || "").toLowerCase();
  if (tag === "textarea" || tag === "select" || el.isContentEditable) return true;
  return tag === "input" && !["checkbox", "radio", "range", "button", "color", "file"].includes(el.type);
}

document.addEventListener("keydown", (e) => {
  if (isDialogOpen()) return;
  const modalOpen = diamondModal.style.display === "flex" || stripExportModal.style.display === "flex" ||
    templateModal.style.display === "flex";

  if ((e.ctrlKey || e.metaKey) && !e.altKey && ["z", "y"].includes(e.key.toLowerCase()) && !modalOpen && !isTypingTarget(e.target)) {
    e.preventDefault();
    undoStep(e.key.toLowerCase() === "y" || e.shiftKey ? 1 : -1);
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "s") {
    e.preventDefault();
    if (!appState.rendering && !modalOpen) saveCurrentProject();
    return;
  }
  if (e.key === "Escape" && modalOpen) {
    closeDiamondModal();
    stripExportModal.style.display = "none";
    templateModal.style.display = "none";
    return;
  }
  if (modalOpen || isTypingTarget(e.target)) return;
  // A focused slider (zoom, fermata, seek bar, …) keeps its own arrow keys
  if (e.target && e.target.type === "range" && e.key.startsWith("Arrow")) return;

  if (currentPage === 3 && appState.isScoreLoaded && !playBtn.disabled) {
    if (e.code === "Space") {
      e.preventDefault(); // also stops the focused button's own click (no double toggle)
      playBtn.click();
    } else if (e.key === "Home") {
      e.preventDefault();
      resetBtn.click();
    } else if (e.key === "End") {
      e.preventDefault();
      seekTo(engine.playEnd);
    } else if (e.key.toLowerCase() === "t" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (!e.repeat) tapTempo();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      const t = engine.getTime();
      // Shift: ±5 s, otherwise previous / next note
      seekTo(e.shiftKey ? t + dir * 5 : engine.getNeighbourStepTime(t, dir));
    }
  }
});

// =================================================================================================
// 12) Start-up — CRITICAL: keep at the END of the file (after every const/let)
// =================================================================================================
languageSelect.addEventListener("change", (e) => changeLanguage(e.target.value));

window.addEventListener("resize", () => requestAnimationFrame(refitViewports));
if (typeof ResizeObserver !== "undefined") {
  const ro = new ResizeObserver(() => refitViewports());
  ro.observe(bgStageWrapper);
  ro.observe(viewportWrapper);
}

stripExportModal.addEventListener("click", (e) => {
  if (e.target === stripExportModal) stripExportModal.style.display = "none";
});

function init() {
  setAppTheme("dark");
  loadSavedColors();
  setActiveColor(appState.activeColor);
  setFermataStretch(DEFAULT_FERMATA_STRETCH);
  updateTimeUi(0);
  setRenderVisual(false, 0);
  setAnimTheme(appState.animTheme);
  setPlayhead(true);
  syncBgControls();
  syncAudioControls();
  applyBgTransforms();
  buildPresetGrid();
  setInfo(DEFAULT_INFO);
  updateConfigSummary();
  renderAllDiamonds();
  changeLanguage(savedLanguage() || "en");
  setStatusKey("readyToRender");
  requestAnimationFrame(refitViewports);
  appInfo().then((info) => {
    if (!info || !info.version) return;
    // "1.0.0" -> "v1.0.0"; a pre-release "1.1.0-beta.2" -> "v1.1.0 Beta 2"
    const m = /^(\d+\.\d+\.\d+)-beta\.?(\d+)?$/i.exec(info.version);
    appVersionEl.textContent = m ? `v${m[1]} Beta${m[2] ? " " + m[2] : ""}` : `v${info.version}`;
    appVersionEl.classList.toggle("is-beta", !!m);
    appVersionEl.title = `Eqo Partitura · Echo Studio ${info.version}`;
  });
}

try {
  init();
} catch (err) {
  console.error("Eqo Partitura başlatılamadı:", err);
}

// Tell the main process the first complete frame is drawn (fonts in, layout done) — it then fades the window in.
// Afterwards, while idle, fetch OSMD so the first score opens without waiting.
(async () => {
  try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]); } catch (_) { /* fonts optional */ }
  // CRITICAL: no requestAnimationFrame here — a never-shown window produces no frames, so it would never fire.
  // The main process also waits for "ready-to-show" (first paint) before revealing.
  await new Promise((r) => setTimeout(r, 0));
  if (window.echo && window.echo.app && window.echo.app.ready) window.echo.app.ready().catch(() => {});
  // only once the window is on screen (not while the splash animates), and when idle
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
  const prefetch = () => setTimeout(() => idle(() => getScoreManager().catch(() => {}), { timeout: 4000 }), 1200);
  if (document.visibilityState === "visible") prefetch();
  else document.addEventListener("visibilitychange", function onVis() {
    if (document.visibilityState !== "visible") return;
    document.removeEventListener("visibilitychange", onVis);
    prefetch();
  });
})();
