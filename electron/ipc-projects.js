// Project storage (main process): ~/.echo-notes/projects/<id>/
//   project.json  settings + metadata
//   score.<ext>   copy of the MusicXML / MXL file
//   bg.<ext>      optional background image / video
//   audio.<ext>   optional music track
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { handle, assertBytes, assertString, IpcError, safeFileName } from "./ipc-common.js";

const MAX_SCORE = 64 * 1024 * 1024;
const MAX_MEDIA = 2 * 1024 * 1024 * 1024;
const MAX_SETTINGS = 256 * 1024;
const MAX_CARDS = 8; // screens per intro / outro list

const ALLOWED_EXT = {
  score: [".musicxml", ".xml", ".mxl"],
  bg: [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".mp4", ".webm", ".mov", ".m4v"],
  audio: [".mp3", ".wav", ".ogg", ".oga", ".m4a", ".aac", ".flac", ".opus", ".webm"],
  intro: [".mp4", ".webm", ".mov", ".m4v"],
  outro: [".mp4", ".webm", ".mov", ".m4v"]
};

function baseDir() {
  // ECHO_E2E_USER_DATA: automated tests keep their projects in their own profile (ignored in packaged builds)
  if (!app.isPackaged && process.env.ECHO_E2E_USER_DATA) return path.join(process.env.ECHO_E2E_USER_DATA, "projects");
  const dir = path.join(app.getPath("home"), ".eqo-partitura", "projects");
  migrateOldProjects(dir);
  return dir;
}

// Echo Notes -> Partitura -> Eqo Partitura: move the newest old project folder once (same drive, so a rename).
let migrated = false;
function migrateOldProjects(dir) {
  if (migrated) return;
  migrated = true;
  const target = path.dirname(dir);
  if (fs.existsSync(target)) return;
  for (const name of [".partitura", ".echo-notes"]) {
    const old = path.join(app.getPath("home"), name);
    try {
      if (fs.existsSync(old)) { fs.renameSync(old, target); return; }
    } catch (err) {
      console.warn(`[projects] could not move ~/${name}:`, err.code);
    }
  }
}

function assertId(id) {
  if (!/^\d{6,20}$/.test(String(id))) throw new IpcError("Invalid project id");
  return String(id);
}

function extOf(name, kind) {
  const m = /\.[A-Za-z0-9]{1,8}$/.exec(name || "");
  const ext = m ? m[0].toLowerCase() : "";
  if (!ALLOWED_EXT[kind].includes(ext)) throw new IpcError(`Unsupported ${kind} file type`);
  return ext;
}

function validateFile(f, kind, max) {
  if (!f || typeof f !== "object") throw new IpcError(`Invalid ${kind} file`);
  const name = safeFileName(assertString(f.name, `${kind} name`, 260), kind);
  const data = assertBytes(f.data, `${kind} data`, max);
  const type = typeof f.type === "string" ? f.type.slice(0, 100) : "";
  return { name, data, type, ext: extOf(name, kind) };
}

function readFileEntry(dir, entry) {
  if (!entry || !entry.file) return null;
  const p = path.join(dir, path.basename(entry.file));
  if (!fs.existsSync(p)) return null;
  return { name: entry.name || entry.file, type: entry.type || "", data: new Uint8Array(fs.readFileSync(p)) };
}

// Older projects stored one intro / outro video as a single entry.
function readCardList(dir, list) {
  if (!list) return [];
  return (Array.isArray(list) ? list : [list]).slice(0, MAX_CARDS).map((e) => readFileEntry(dir, e));
}

export function registerProjectIpc({ isAppUrl }) {
  handle("projects:list", isAppUrl, () => {
    const dir = baseDir();
    if (!fs.existsSync(dir)) return [];
    const out = [];
    for (const id of fs.readdirSync(dir)) {
      if (!/^\d{6,20}$/.test(id)) continue;
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(dir, id, "project.json"), "utf-8"));
        out.push({ id, name: String(meta.name || id), savedAt: Number(meta.savedAt) || 0 });
      } catch (_) { /* skip broken folders */ }
    }
    return out.sort((a, b) => b.savedAt - a.savedAt);
  });

  handle("projects:save", isAppUrl, (_e, payload) => {
    if (!payload || typeof payload !== "object") throw new IpcError("Invalid project");
    const pid = payload.id ? assertId(payload.id) : String(Date.now());
    const name = safeFileName(payload.name, "Project").slice(0, 100);
    const settingsJson = JSON.stringify(payload.settings ?? {});
    if (settingsJson.length > MAX_SETTINGS) throw new IpcError("Settings are too large");

    const music = validateFile(payload.music, "score", MAX_SCORE);
    const bg = payload.bg ? validateFile(payload.bg, "bg", MAX_MEDIA) : null;
    const audio = payload.audio ? validateFile(payload.audio, "audio", MAX_MEDIA) : null;
    // intro / outro: ordered lists of screens; null = text-only screen (no video)
    const cardList = (list, kind) => {
      if (list == null) return [];
      if (!Array.isArray(list) || list.length > MAX_CARDS) throw new IpcError(`Invalid ${kind} list`);
      return list.map((f) => (f ? validateFile(f, kind, MAX_MEDIA) : null));
    };
    const intro = cardList(payload.intro, "intro");
    const outro = cardList(payload.outro, "outro");

    const dir = path.join(baseDir(), pid);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(dir)) {
      if (/^(score|bg|audio|intro|outro)[.-]/.test(f)) fs.unlinkSync(path.join(dir, f)); // extension may have changed
    }

    const entry = (prefix, f) => {
      const file = prefix + f.ext;
      fs.writeFileSync(path.join(dir, file), f.data);
      return { file, name: f.name, type: f.type };
    };

    const meta = {
      version: 2,
      name,
      savedAt: Date.now(),
      musicName: music.name,
      scoreFile: entry("score", music).file,
      bg: bg ? entry("bg", bg) : null,
      audio: audio ? entry("audio", audio) : null,
      intro: intro.map((f, i) => (f ? entry(`intro-${i}`, f) : null)),
      outro: outro.map((f, i) => (f ? entry(`outro-${i}`, f) : null)),
      settings: JSON.parse(settingsJson)
    };
    fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify(meta, null, 2), "utf-8");
    return pid;
  });

  handle("projects:load", isAppUrl, (_e, id) => {
    const dir = path.join(baseDir(), assertId(id));
    const meta = JSON.parse(fs.readFileSync(path.join(dir, "project.json"), "utf-8"));
    const music = readFileEntry(dir, { file: meta.scoreFile, name: meta.musicName, type: "application/xml" });
    if (!music) throw new IpcError("The score file of this project is missing");
    return {
      id: String(id),
      name: meta.name,
      settings: meta.settings || {},
      music,
      bg: readFileEntry(dir, meta.bg),
      audio: readFileEntry(dir, meta.audio),
      intro: readCardList(dir, meta.intro),
      outro: readCardList(dir, meta.outro)
    };
  });

  handle("projects:delete", isAppUrl, (_e, id) => {
    const dir = path.join(baseDir(), assertId(id));
    fs.rmSync(dir, { recursive: true, force: true });
    return true;
  });
}
