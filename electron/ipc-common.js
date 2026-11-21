// Shared IPC helpers: sender verification and argument validation.
import { ipcMain } from "electron";

export class IpcError extends Error {}

/** Registers an ipcMain.handle() that rejects calls from anything other than the app's own pages. */
export function handle(channel, isAppUrl, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    const url = event.senderFrame ? event.senderFrame.url : "";
    if (!isAppUrl(url)) throw new IpcError(`Blocked IPC "${channel}" from untrusted origin`);
    return fn(event, ...args);
  });
}

export function assertString(v, name, max = 512) {
  if (typeof v !== "string" || v.length === 0 || v.length > max) throw new IpcError(`Invalid ${name}`);
  return v;
}

export function assertBytes(v, name, maxBytes) {
  if (!(v instanceof Uint8Array)) throw new IpcError(`Invalid ${name}`);
  if (maxBytes && v.byteLength > maxBytes) throw new IpcError(`${name} is too large`);
  return v;
}

/** Windows-safe file name (no folders, no reserved characters). */
export function safeFileName(name, fallback = "Partitura") {
  let s = String(name || "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").replace(/^[.\s]+|[.\s]+$/g, "");
  if (!s) s = fallback;
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(s)) s = "_" + s;
  return s.slice(0, 120);
}
