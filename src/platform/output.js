// output.js — where rendered files go.
//  Desktop (Electron): native save dialog + streamed writes straight to disk (no RAM limit).
//  Browser (npm run web): in-memory fallback that triggers a normal download.

const api = () => (typeof window !== "undefined" && window.echo ? window.echo : null);

export const isDesktop = () => !!(api() && api().isDesktop);

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

/**
 * Opens a video output. Returns null when the user cancels the save dialog.
 * sink.write(data, position) is synchronous (queued); flush()/close() wait for the disk.
 */
export async function openVideoSink(defaultName, ext) {
  const a = api();
  if (a) {
    const handle = await a.video.open({ defaultName, ext });
    if (!handle) return null;
    let queue = Promise.resolve();
    let error = null;
    const sink = {
      ext,
      path: handle.path,
      pendingBytes: 0,
      write(data, position) {
        const copy = data.slice(); // the muxer may reuse its buffer
        sink.pendingBytes += copy.byteLength;
        queue = queue
          .then(() => (error ? null : a.video.write(handle.id, copy, position)))
          .catch((e) => { error = error || e; })
          .finally(() => { sink.pendingBytes -= copy.byteLength; });
      },
      async flush() {
        await queue;
        if (error) throw error;
      },
      async reset() {
        await queue.catch(() => {});
        error = null;
        await a.video.truncate(handle.id);
      },
      async close() {
        await sink.flush();
        return a.video.close(handle.id);
      },
      async abort() {
        await queue.catch(() => {});
        await a.video.abort(handle.id);
      }
    };
    return sink;
  }

  // Browser fallback: collect positioned chunks in memory
  let parts = [];
  const sink = {
    ext,
    path: null,
    pendingBytes: 0,
    write(data, position) { parts.push({ data: data.slice(), position }); },
    async flush() {},
    async reset() { parts = []; },
    async close() {
      const size = parts.reduce((m, p) => Math.max(m, p.position + p.data.byteLength), 0);
      const buf = new Uint8Array(size);
      for (const p of parts) buf.set(p.data, p.position);
      parts = [];
      downloadBlob(new Blob([buf], { type: ext === "mp4" ? "video/mp4" : "video/webm" }), `${defaultName}.${ext}`);
      return null;
    },
    async abort() { parts = []; }
  };
  return sink;
}

/** Saves one or more image blobs. Returns the written paths ([] in the browser), or null if cancelled. */
export async function saveImages(ext, files) {
  const a = api();
  if (a) {
    const payload = [];
    for (const f of files) payload.push({ name: f.name, data: new Uint8Array(await f.blob.arrayBuffer()) });
    return a.images.save({ ext, files: payload });
  }
  for (const f of files) {
    downloadBlob(f.blob, `${f.name}.${ext}`);
    await new Promise((r) => setTimeout(r, 400));
  }
  return [];
}

export async function showInFolder(filePath) {
  const a = api();
  if (a && filePath) await a.shell.showItem(filePath);
}

export async function appInfo() {
  const a = api();
  if (!a) return null;
  try { return await a.app.info(); } catch (_) { return null; }
}
