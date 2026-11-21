// After `electron-builder`: put the single portable "Partitura.exe" at the top of the project folder and
// remove the build leftovers (release/, dist/), so the app is the only thing to look for.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const built = path.join(ROOT, "release", "Partitura.exe");
const target = path.join(ROOT, "Partitura.exe");

if (!fs.existsSync(built)) {
  console.error("[collect-exe] release/Partitura.exe not found — did electron-builder fail?");
  process.exit(1);
}
try {
  fs.copyFileSync(built, target);
} catch (err) {
  console.error(`[collect-exe] cannot replace "${target}" — close Partitura and run the build again. (${err.code})`);
  process.exit(1);
}
for (const dir of ["release", "dist"]) {
  try {
    fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true });
  } catch (err) {
    console.warn(`[collect-exe] could not remove ${dir}/ (a file in it is in use: ${err.code}); delete it later.`);
  }
}
console.log(`[collect-exe] ${target} (${(fs.statSync(target).size / 1048576).toFixed(1)} MB)`);
