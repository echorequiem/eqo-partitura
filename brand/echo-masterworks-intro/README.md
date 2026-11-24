# Echo Masterworks intro

A reusable 3.5 s intro (16:9) for every Echo Masterworks app and video: the logo appears in the centre of the
screen, slides to the left, and the wordmark "ECHO / MASTERWORKS" builds up beside it — the last frame is the
Echo Masterworks artwork. Flat drawing, no glow (Echo Masterworks rule: no neon).

Everything is drawn on one canvas that fills the window, backdrop included, so no part of the motion is cut off
at the edge of a picture. Copy this whole folder into another project; it has no dependencies (canvas 2D +
Web Audio).

## Usage

```js
import { playEchoIntro } from "./echo-masterworks-intro/echoIntro.js";
import emblem from "./echo-masterworks-intro/assets/echo-emblem.png";
import top from "./echo-masterworks-intro/assets/echo-top.png";
import bottom from "./echo-masterworks-intro/assets/echo-bottom.png";
import soundUrl from "./echo-masterworks-intro/assets/echo-masterworks-sound.flac";

await playEchoIntro({ mount: document.body, images: { emblem, top, bottom }, soundUrl });
// -> open the main window here
```

Options: `ready` (a Promise: everything is prepared first, the animation starts when it resolves — use it to
wait until the host app has finished loading), `onStart` (called right before the first frame).
`drawIntroFrame(ctx, W, H, t, images)` draws a single frame — used to write the intro to a video file.

The animation is time-based: a dropped frame never slows it down or shifts it against the sound.

## Electron

The sound must be allowed to play without a click:
`webPreferences: { autoplayPolicy: "no-user-gesture-required" }` on the splash window (16:9, e.g. 640×360).
Eqo Partitura signals via `document.title` ("echo:start", "echo:done"); the main process listens to
`page-title-updated`, and calls `window.__echoGo()` in the splash once the main window has loaded
(see `electron/main.js` and `src/splash.js`).

## Assets

- `assets/echo-emblem.png`, `assets/echo-top.png` ("ECHO"), `assets/echo-bottom.png` ("MASTERWORKS") — the
  parts of the Echo Masterworks artwork on a transparent background; `LAYOUT` in `echoIntro.js` says where
  each sits in the finished 16:9 frame.
- `assets/echo-masterworks-sound.flac` — intro sound
