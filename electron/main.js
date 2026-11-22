// electron/main.js — main process: windows, app:// protocol, security, IPC registration.
// CRITICAL (security): sandboxed renderer without Node.js; the only bridge is preload.cjs (window.echo), whose
// IPC handlers check the sender and every argument. Strict CSP on app://; new windows, external navigation,
// <webview> and permission requests are blocked. Do not loosen any of this.

import { app, BrowserWindow, Menu, net, protocol, session, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerProjectIpc } from "./ipc-projects.js";
import { registerFileIpc } from "./ipc-files.js";
import { handle } from "./ipc-common.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const APP_ORIGIN = "app://echo";

// dev mode = not packaged AND VITE_DEV_SERVER_URL set (scripts/dev.js); `electron .` runs the built app
const DEV_URL = !app.isPackaged && process.env.VITE_DEV_SERVER_URL ? process.env.VITE_DEV_SERVER_URL : null;
const DEV_ORIGIN = DEV_URL ? new URL(DEV_URL).origin : null;

const CSP_COMMON = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'"
];
const CSP_PROD = [...CSP_COMMON, "script-src 'self'", "connect-src 'self' blob: data:"].join("; ");
const CSP_DEV = [
  ...CSP_COMMON,
  "script-src 'self'",
  `connect-src 'self' blob: data: ${DEV_ORIGIN ? DEV_ORIGIN.replace(/^http/, "ws") : ""}`
].join("; ");

/** Is this URL part of the app (and therefore allowed to load / talk to IPC)? */
export function isAppUrl(url) {
  try {
    const u = new URL(url);
    // CRITICAL: Node's URL gives app:// an opaque origin ("null") — compare scheme + host.
    if (u.protocol === "app:" && u.host === "echo") return true;
    return !!DEV_ORIGIN && u.origin === DEV_ORIGIN;
  } catch (_) {
    return false;
  }
}

// Automated tests only (ignored when packaged): isolated profile and projects.
if (!app.isPackaged && process.env.ECHO_E2E_USER_DATA) {
  app.setPath("userData", process.env.ECHO_E2E_USER_DATA);
} else {
  migrateOldProfile();
}

/** Echo Notes -> Partitura -> Eqo Partitura: copy the newest old profile (saved colours, settings) once,
 *  before anything uses it. */
function migrateOldProfile() {
  const now = app.getPath("userData");
  if (fs.existsSync(now)) return;
  for (const name of ["Partitura", "Echo Notes"]) {
    try {
      const old = path.join(app.getPath("appData"), name);
      if (fs.existsSync(old)) { fs.cpSync(old, now, { recursive: true, errorOnExist: false }); return; }
    } catch (err) {
      console.warn(`[profile] could not copy the ${name} profile:`, err.code);
    }
  }
}

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } }
]);

function registerAppProtocol() {
  protocol.handle("app", async (request) => {
    const { pathname } = new URL(request.url);
    let rel = decodeURIComponent(pathname);
    if (rel === "/" || rel === "") rel = "/index.html";
    const file = path.normalize(path.join(DIST, rel));
    if (!file.startsWith(DIST + path.sep)) return new Response("Forbidden", { status: 403 });
    try {
      const res = await net.fetch(pathToFileURL(file).toString());
      const headers = new Headers(res.headers);
      headers.set("Content-Security-Policy", CSP_PROD);
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(res.body, { status: res.status, headers });
    } catch (_) {
      return new Response("Not found", { status: 404 });
    }
  });
}

function hardenSession() {
  const ses = session.defaultSession;
  // no camera, microphone, notifications, geolocation …
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);

  if (DEV_ORIGIN) {
    ses.webRequest.onHeadersReceived({ urls: [`${DEV_ORIGIN}/*`] }, (details, callback) => {
      callback({ responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [CSP_DEV] } });
    });
  }
}

// Window icon. Windows: the packaged .exe carries its own icon (only dev runs need one).
// Linux: always — X11 / Wayland show it in the task bar even when no .desktop file is installed.
function resolveWindowIcon() {
  if (process.platform === "linux") return path.join(ROOT, "build", "icon.png"); // inside app.asar when packaged
  if (app.isPackaged) return undefined;
  const p = path.join(ROOT, "build", "icon.ico");
  return fs.existsSync(p) ? p : undefined;
}

let mainWindow = null;
let splashWindow = null;
// CRITICAL: the splash reports via its title: "echo:start" (show it) and "echo:done" (open the main window).
let splashFinished = false;
const splashListeners = new Set();
const SPLASH_MAX_MS = 12000; // safety net
// CRITICAL (smooth splash): the main window loads while the splash is still PREPARING (sound decode, logo),
// so its page load is over before the animation starts — not in the middle of it (that was the stutter).
// Its heavy part (OSMD) is fetched only after it is visible (src/main.js).
const MAIN_START_DELAY_MS = 60; // let the splash process start first
const FADE_IN_MS = 260;

const secureWebPreferences = () => ({
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  spellcheck: false,
  devTools: !app.isPackaged
});

function pageUrl(page) {
  return DEV_URL ? new URL(page, DEV_URL).toString() : `${APP_ORIGIN}/${page}`;
}

/** Splash window (brand/echo-masterworks-intro). No preload: it needs no API. */
function createSplash() {
  const icon = resolveWindowIcon();
  splashWindow = new BrowserWindow({
    width: 640, // 16:9 — the Echo Masterworks intro
    height: 360,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    center: true,
    show: false,
    skipTaskbar: true,
    backgroundColor: "#0b090f",
    ...(icon ? { icon } : {}),
    title: "Eqo Partitura",
    webPreferences: { ...secureWebPreferences(), autoplayPolicy: "no-user-gesture-required" }
  });
  const markDone = () => {
    if (splashFinished) return;
    splashFinished = true;
    for (const fn of splashListeners) fn();
  };
  const showSplash = () => splashWindow && !splashWindow.isDestroyed() && !splashWindow.isVisible() && splashWindow.show();

  let mainStarted = false;
  const startMain = (delay = 0) => {
    if (mainStarted) return;
    mainStarted = true;
    // synchronously when the splash is closing, so there is always a window (no window-all-closed quit)
    if (delay > 0) setTimeout(() => createWindow({ withSplash: true }), delay);
    else createWindow({ withSplash: true });
  };

  splashWindow.webContents.on("page-title-updated", (_e, title) => {
    if (title === "echo:start") showSplash();
    if (title === "echo:done") { markDone(); startMain(); }
  });
  splashWindow.webContents.on("did-fail-load", () => { markDone(); startMain(); });
  splashWindow.webContents.on("did-finish-load", () => { if (mainLoaded) signalSplashGo(); });
  // show the (dark) splash at once; the animation starts when the main window has loaded
  splashWindow.once("ready-to-show", showSplash);
  splashWindow.on("closed", () => { splashWindow = null; markDone(); startMain(); });
  setTimeout(() => { markDone(); startMain(); }, SPLASH_MAX_MS);
  splashWindow.loadURL(pageUrl("splash.html")).catch(markDone);
  startMain(MAIN_START_DELAY_MS);
}

// The splash animates only once the main window has loaded (src/splash.js waits for this, max 2.5 s).
let mainLoaded = false;
function signalSplashGo() {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  splashWindow.webContents.executeJavaScript("window.__echoGoNow = true; window.__echoGo && window.__echoGo();", true).catch(() => {});
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  splashWindow = null;
}

function createWindow({ withSplash = false } = {}) {
  const icon = resolveWindowIcon();
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 800,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    ...(icon ? { icon } : {}),
    backgroundColor: "#0b090f",
    autoHideMenuBar: true,
    title: "Eqo Partitura",
    webPreferences: {
      ...secureWebPreferences(),
      preload: path.join(__dirname, "preload.cjs"),
      // CRITICAL: full-speed timers during long renders, also in the background
      backgroundThrottling: false
    }
  });

  // Show the main window when the UI is fully drawn (app:ready) AND the splash has finished, with a short fade-in
  const win = mainWindow;
  let rendered = false;
  let revealed = false;
  let splashDone = !withSplash || splashFinished;
  const reveal = () => {
    if (revealed || !rendered || !splashDone || win.isDestroyed()) return;
    revealed = true;
    win.setOpacity(0);
    win.show();
    win.focus();
    closeSplash();
    const t0 = Date.now();
    const step = () => {
      if (win.isDestroyed()) return;
      const p = Math.min(1, (Date.now() - t0) / FADE_IN_MS);
      win.setOpacity(1 - Math.pow(1 - p, 3));
      if (p < 1) setTimeout(step, 16);
    };
    step();
  };
  // rendered = first paint done ("ready-to-show") AND the UI reported it is complete (app:ready)
  let painted = false;
  let uiReady = false;
  const markRendered = () => {
    if (!painted || !uiReady) return;
    rendered = true;
    if (!mainLoaded) { mainLoaded = true; signalSplashGo(); }
    reveal();
  };
  win.on("echo-ready", () => { uiReady = true; markRendered(); });
  win.once("ready-to-show", () => {
    painted = true;
    markRendered();
    setTimeout(() => { uiReady = true; markRendered(); }, 3000); // fallback if the UI never reports
  });
  if (withSplash && !splashDone) splashListeners.add(() => { splashDone = true; reveal(); });
  win.on("closed", () => {
    mainWindow = null;
    closeSplash();
  });
  // F11: full screen on / off (the release build has no menu that would provide it)
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "F11" && !input.alt && !input.control && !input.meta && !input.shift) {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });
  // The close button: the window stays open and the page is asked first (an unsaved project → Save / Don't
  // save / Cancel). The page answers with "app:close-now" (closeApproved). A page that has crashed or never
  // loaded cannot answer — then the window simply closes.
  win.on("close", (event) => {
    if (win._closeApproved) return;
    const wc = win.webContents;
    if (!rendered || wc.isDestroyed() || wc.isCrashed()) return;
    event.preventDefault();
    wc.send("app:close-request");
  });

  if (DEV_URL) loadDevUrl(win, pageUrl("index.html"));
  else win.loadURL(pageUrl("index.html"));
}

// the dev server may come up late: retry instead of a blank window
async function loadDevUrl(win, url) {
  for (let i = 0; i < 60; i++) {
    if (win.isDestroyed()) return;
    try {
      await win.loadURL(url);
      return;
    } catch (_) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  // every web contents the app creates
  app.on("web-contents-created", (_e, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//i.test(url)) shell.openExternal(url); // external links -> system browser
      return { action: "deny" };
    });
    contents.on("will-navigate", (event, url) => {
      if (!isAppUrl(url)) event.preventDefault(); // e.g. a file dropped outside a drop zone
    });
    contents.on("will-redirect", (event, url) => {
      if (!isAppUrl(url)) event.preventDefault();
    });
    contents.on("will-attach-webview", (event) => event.preventDefault());
  });

  app.whenReady().then(() => {
    if (process.platform === "win32") app.setAppUserModelId("com.echomasterworks.eqopartitura");
    if (app.isPackaged) Menu.setApplicationMenu(null); // no reload / devtools shortcuts in release builds

    registerAppProtocol();
    hardenSession();
    registerProjectIpc({ isAppUrl });
    registerFileIpc({ isAppUrl, getWindow: () => mainWindow });
    handle("app:ready", isAppUrl, (event) => {
      const w = BrowserWindow.fromWebContents(event.sender);
      if (w) w.emit("echo-ready");
      return true;
    });
    // the page has asked (or had nothing to ask): close its window now
    handle("app:close-now", isAppUrl, (event) => {
      const w = BrowserWindow.fromWebContents(event.sender);
      if (w && !w.isDestroyed()) {
        w._closeApproved = true;
        setImmediate(() => !w.isDestroyed() && w.close());
      }
      return true;
    });
    createSplash(); // the splash starts the main window (startMain)

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
