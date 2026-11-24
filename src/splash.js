// Splash window (16:9): the shared Echo Masterworks intro (brand/echo-masterworks-intro) — the logo appears in
// the centre, slides left, and "ECHO MASTERWORKS" builds up beside it; then the app opens (3.5 s).
// CRITICAL: electron/main.js shows this window on title "echo:start" and opens the main window on "echo:done".
import "./styles/splash.css";
import { playEchoIntro } from "../brand/echo-masterworks-intro/echoIntro.js";
import emblemUrl from "../brand/echo-masterworks-intro/assets/echo-emblem.png";
import topUrl from "../brand/echo-masterworks-intro/assets/echo-top.png";
import bottomUrl from "../brand/echo-masterworks-intro/assets/echo-bottom.png";
import soundUrl from "../brand/echo-masterworks-intro/assets/echo-masterworks-sound.flac";

const done = () => { document.title = "echo:done"; };
// CRITICAL (smooth animation): electron/main.js calls window.__echoGo() once the main window has loaded, so the
// intro never animates while the app page is loading. Fallback: start anyway after 2.5 s.
const go = new Promise((resolve) => {
  window.__echoGo = resolve;
  if (window.__echoGoNow) resolve(); // the signal came before this script ran
  setTimeout(resolve, 2500);
});
setTimeout(done, 10000); // safety net: never keep the app from opening
playEchoIntro({
  mount: document.body,
  images: { emblem: emblemUrl, top: topUrl, bottom: bottomUrl },
  soundUrl,
  ready: go,
  onStart: () => { document.title = "echo:start"; }
}).then(done, done);
