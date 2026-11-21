// electron/preload.cjs — the ONLY bridge between the sandboxed renderer and the system.
// Exposes a small, explicit API as window.echo; no Node.js or ipcRenderer access leaks out.
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld("echo", {
  isDesktop: true,
  app: {
    info: () => invoke("app:info"),
    /** The UI has drawn its first complete frame: the main process may show the window. */
    ready: () => invoke("app:ready")
  },
  projects: {
    list: () => invoke("projects:list"),
    save: (payload) => invoke("projects:save", payload),
    load: (id) => invoke("projects:load", id),
    remove: (id) => invoke("projects:delete", id)
  },
  video: {
    /** Shows a save dialog and opens the chosen file. -> { id, path } or null if cancelled */
    open: (opts) => invoke("video:open", opts),
    write: (id, data, position) => invoke("video:write", id, data, position),
    truncate: (id) => invoke("video:truncate", id),
    close: (id) => invoke("video:close", id),
    abort: (id) => invoke("video:abort", id)
  },
  images: {
    /** Shows a save dialog for the first file; extra parts go next to it. -> string[] or null */
    save: (opts) => invoke("images:save", opts)
  },
  shell: {
    showItem: (filePath) => invoke("shell:showItem", filePath)
  }
});
