// File output (main process): save dialogs and streamed video writing.
// The renderer never sees or chooses arbitrary paths: it gets an opaque stream id for a file
// the USER picked in a native save dialog, and may only write into that file.
import { app, dialog, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { handle, assertBytes, assertString, IpcError, safeFileName } from "./ipc-common.js";

const VIDEO_EXT = { mp4: "MP4 video", webm: "WebM video" };
const IMAGE_EXT = { png: "PNG", jpg: "JPEG", webp: "WebP", svg: "SVG" };
const MAX_WRITE = 64 * 1024 * 1024;
const MAX_IMAGE = 512 * 1024 * 1024;

const streams = new Map(); // id -> { fd, path }
const writtenPaths = new Set(); // files the app created; only these may be revealed in Explorer
let nextId = 1;

function getStream(id) {
  const s = streams.get(id);
  if (!s) throw new IpcError("Unknown output stream");
  return s;
}

// Automated end-to-end tests only: skip the native dialog and save into this folder.
// Ignored in packaged builds.
const E2E_DIR = !app.isPackaged && process.env.ECHO_E2E_OUTPUT_DIR ? process.env.ECHO_E2E_OUTPUT_DIR : null;

async function askSavePath(win, options) {
  if (E2E_DIR) return { canceled: false, filePath: path.join(E2E_DIR, path.basename(options.defaultPath)) };
  return dialog.showSaveDialog(win, options);
}

function defaultDir(kind) {
  try {
    return app.getPath(kind === "video" ? "videos" : "pictures");
  } catch (_) {
    return app.getPath("documents");
  }
}

export function registerFileIpc({ isAppUrl, getWindow }) {
  handle("app:info", isAppUrl, () => ({ name: app.getName(), version: app.getVersion() }));

  handle("video:open", isAppUrl, async (_e, opts) => {
    const ext = String(opts && opts.ext);
    if (!VIDEO_EXT[ext]) throw new IpcError("Unsupported video format");
    const name = safeFileName(opts.defaultName, "Partitura").replace(/\.(mp4|webm)$/i, "") + "." + ext;
    const win = getWindow();
    const res = await askSavePath(win, {
      defaultPath: path.join(defaultDir("video"), name),
      filters: [{ name: VIDEO_EXT[ext], extensions: [ext] }]
    });
    if (res.canceled || !res.filePath) return null;
    let filePath = res.filePath;
    if (path.extname(filePath).toLowerCase() !== "." + ext) filePath += "." + ext;
    const fd = await fs.promises.open(filePath, "w");
    const id = nextId++;
    streams.set(id, { fd, path: filePath });
    return { id, path: filePath };
  });

  handle("video:write", isAppUrl, async (_e, id, data, position) => {
    const s = getStream(id);
    assertBytes(data, "chunk", MAX_WRITE);
    if (!Number.isSafeInteger(position) || position < 0) throw new IpcError("Invalid position");
    await s.fd.write(data, 0, data.byteLength, position);
    return true;
  });

  handle("video:truncate", isAppUrl, async (_e, id) => {
    await getStream(id).fd.truncate(0);
    return true;
  });

  handle("video:close", isAppUrl, async (_e, id) => {
    const s = getStream(id);
    streams.delete(id);
    await s.fd.sync().catch(() => {});
    await s.fd.close();
    writtenPaths.add(s.path);
    return s.path;
  });

  handle("video:abort", isAppUrl, async (_e, id) => {
    const s = streams.get(id);
    if (!s) return true;
    streams.delete(id);
    await s.fd.close().catch(() => {});
    await fs.promises.unlink(s.path).catch(() => {});
    return true;
  });

  handle("images:save", isAppUrl, async (_e, opts) => {
    const ext = String(opts && opts.ext);
    if (!IMAGE_EXT[ext]) throw new IpcError("Unsupported image format");
    const files = Array.isArray(opts.files) ? opts.files : [];
    if (files.length === 0 || files.length > 64) throw new IpcError("Invalid image list");
    const clean = files.map((f) => {
      const base = safeFileName(assertString(f.name, "file name", 260), "Partitura").replace(/\.[a-z0-9]{1,5}$/i, "");
      return { name: `${base}.${ext}`, data: assertBytes(f.data, "image", MAX_IMAGE) };
    });

    const res = await askSavePath(getWindow(), {
      defaultPath: path.join(defaultDir("image"), clean[0].name),
      filters: [{ name: IMAGE_EXT[ext], extensions: [ext] }]
    });
    if (res.canceled || !res.filePath) return null;

    let first = res.filePath;
    if (path.extname(first).toLowerCase() !== "." + ext) first += "." + ext;
    const dir = path.dirname(first);
    const out = [];
    for (let i = 0; i < clean.length; i++) {
      const p = i === 0 ? first : path.join(dir, clean[i].name);
      await fs.promises.writeFile(p, clean[i].data);
      writtenPaths.add(p);
      out.push(p);
    }
    return out;
  });

  handle("shell:showItem", isAppUrl, (_e, filePath) => {
    if (typeof filePath !== "string" || !writtenPaths.has(filePath)) throw new IpcError("Unknown file");
    shell.showItemInFolder(filePath);
    return true;
  });

  app.on("before-quit", () => {
    for (const s of streams.values()) s.fd.close().catch(() => {});
    streams.clear();
  });
}
