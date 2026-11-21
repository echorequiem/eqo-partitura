// projectStore.js — renderer-side client for project storage.
// The actual file system work happens in the main process (electron/ipc-projects.js);
// this module only converts between File objects and the IPC payloads exposed by the preload bridge.

const api = () => (typeof window !== "undefined" && window.echo ? window.echo : null);

export function isAvailable() {
  return !!api();
}

export async function listProjects() {
  const a = api();
  if (!a) return [];
  try {
    return await a.projects.list();
  } catch (err) {
    console.error("Project list failed:", err);
    return [];
  }
}

async function toPayload(file) {
  if (!file) return null;
  return { name: file.name, type: file.type || "", data: new Uint8Array(await file.arrayBuffer()) };
}

function toFile(entry) {
  return entry ? new File([entry.data], entry.name, { type: entry.type || "" }) : null;
}

/** introFiles / outroFiles: one entry per screen, null for a screen without video. */
export async function saveProject({ id, name, settings, musicFile, bgFile, audioFile, introFiles = [], outroFiles = [] }) {
  const a = api();
  if (!a) throw new Error("UNAVAILABLE");
  return a.projects.save({
    id: id || null,
    name,
    settings,
    music: await toPayload(musicFile),
    bg: await toPayload(bgFile),
    audio: await toPayload(audioFile),
    intro: await Promise.all(introFiles.map(toPayload)),
    outro: await Promise.all(outroFiles.map(toPayload))
  });
}

export async function loadProject(id) {
  const a = api();
  if (!a) throw new Error("UNAVAILABLE");
  const p = await a.projects.load(id);
  return {
    id: String(p.id),
    name: p.name,
    settings: p.settings || {},
    musicFile: toFile(p.music),
    bgFile: toFile(p.bg),
    audioFile: toFile(p.audio),
    introFiles: (p.intro || []).map(toFile),
    outroFiles: (p.outro || []).map(toFile)
  };
}

export async function deleteProject(id) {
  const a = api();
  if (!a) throw new Error("UNAVAILABLE");
  return a.projects.remove(id);
}
