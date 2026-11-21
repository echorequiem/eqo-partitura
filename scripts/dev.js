// scripts/dev.js — one-command dev launcher (npm run dev / npm run electron:dev)
//  - Starts Vite through its Node API, then opens Electron once the server is listening.
//  - When Electron closes, Vite is shut down too (no orphaned server keeping port 5173 busy).
//  - The port is fixed (5173); if it is taken we stop with a clear message instead of
//    silently connecting Electron to some other server.
import { createServer } from "vite";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const PORT = 5173;

let server;
try {
  server = await createServer({
    root: ROOT,
    configFile: path.join(ROOT, "vite.config.js"),
    server: { port: PORT, strictPort: true, host: "localhost" }
  });
  await server.listen();
} catch (err) {
  if (String(err && err.message).includes("already in use")) {
    console.error(`\n[eqo-partitura] Port ${PORT} is already in use.`);
    console.error("[eqo-partitura] An older dev server is probably still running. Close it (Task Manager > node.exe) and try again.\n");
    process.exit(1);
  }
  throw err;
}
server.printUrls();

const url = (server.resolvedUrls && server.resolvedUrls.local && server.resolvedUrls.local[0]) || `http://localhost:${PORT}/`;

// In Node, require("electron") returns the path of the Electron executable.
const electronBin = require("electron");
const electron = spawn(electronBin, [ROOT], {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, VITE_DEV_SERVER_URL: url }
});

let closing = false;
async function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  try { electron.kill(); } catch (_) { /* already closed */ }
  try { await server.close(); } catch (_) { /* ignore */ }
  process.exit(code);
}

electron.on("close", (code) => shutdown(code ?? 0));
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
