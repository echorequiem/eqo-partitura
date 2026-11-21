# Echo Masterworks intro

A reusable 3.5 s splash animation for every Echo Masterworks app. The logo itself moves: it is cut into
concentric bands (spiral core, rings, lettering, outer ring) that spin in from alternating directions and lock
into place from the centre outwards. Then a bloom flash and an echo ring mark the lock-in, a golden light
sweeps across, sparks orbit the emblem, the app name rises in, and everything lifts and fades out.
Extra echo rings fire on every hit of the intro sound (its leading silence is skipped automatically).

Copy this whole folder into another project. It has no dependencies (canvas 2D + Web Audio).

## Usage

```js
import { playEchoIntro } from "./echo-masterworks-intro/echoIntro.js";
import logoUrl from "./echo-masterworks-intro/assets/echo-masterworks-seal.png";
import soundUrl from "./echo-masterworks-intro/assets/echo-masterworks-sound.flac";

await playEchoIntro({ mount: document.body, logoUrl, emblemRadius: 0.366, aspect: "1/1", soundUrl, title: "Eqo Partitura", subtitle: "Echo Studio" });
// -> open the main window here
```

Options: `title`, `duration` (default 3.5), `accent` (progress line colour), `onStart` (called right before
the first frame), `ready` (a Promise: everything is prepared first, the animation starts when it resolves —
use it to wait until the host app has finished loading, so nothing heavy runs during the animation).
CSS variables on the mount element: `--emi-size` (logo width), `--emi-title-size`, `--emi-font`.

The animation is time-based: a dropped frame never slows it down or shifts it against the sound.

## Electron

The sound must be allowed to play without a click:
`webPreferences: { autoplayPolicy: "no-user-gesture-required" }` on the splash window.
Eqo Partitura signals via `document.title` ("echo:start", "echo:done"); the main process listens to
`page-title-updated`, and calls `window.__echoGo()` in the splash once the main window has loaded
(see `electron/main.js` and `src/splash.js`).

## Assets

- `assets/echo-masterworks-seal.png` — the coloured Echo Masterworks seal (transparent; used as it is, colours
  kept). Artwork on a dark backdrop is turned into white line art instead.
- `assets/echo-masterworks-sound.flac` — intro sound
