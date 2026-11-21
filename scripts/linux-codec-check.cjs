// CI only (release workflow, Linux): which WebCodecs encoders this Electron offers on Linux.
// Partitura picks MP4 (H.264 + AAC), falls back to Opus audio in MP4 and to WebM (VP9 + Opus) by itself;
// this prints what will be used, so a release log shows it. Exits 1 only if NO video encoder works.
// Run: xvfb-run -a npx electron scripts/linux-codec-check.cjs
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PROBE = `(async () => {
  const v = async (codec) => { try { return (await VideoEncoder.isConfigSupported({ codec, width: 1920, height: 1080, bitrate: 8e6, framerate: 60 })).supported; } catch (e) { return false; } };
  const a = async (codec) => { try { return (await AudioEncoder.isConfigSupported({ codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 })).supported; } catch (e) { return false; } };
  return {
    webcodecs: typeof VideoEncoder !== "undefined",
    h264: await v("avc1.640028"), vp9: await v("vp09.00.40.08"),
    aac: await a("mp4a.40.2"), opus: await a("opus")
  };
})()`;

app.whenReady().then(async () => {
  const file = path.join(os.tmpdir(), "partitura-codec-check.html");
  fs.writeFileSync(file, "<!doctype html><title>codec check</title>");
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
  await win.loadFile(file);
  const r = await win.webContents.executeJavaScript(PROBE, true);
  const mp4 = r.h264 ? `MP4 = H.264 + ${r.aac ? "AAC" : r.opus ? "Opus" : "no audio"}` : "MP4 unavailable -> WebM is used";
  const webm = r.vp9 ? `WebM = VP9 + ${r.opus ? "Opus" : "no audio"}` : "WebM unavailable";
  console.log(`[codec-check] electron ${process.versions.electron} on ${os.platform()} ${os.arch()}`);
  console.log(`[codec-check] ${JSON.stringify(r)}`);
  console.log(`[codec-check] ${mp4} | ${webm}`);
  app.exit(r.h264 || r.vp9 ? 0 : 1);
});
