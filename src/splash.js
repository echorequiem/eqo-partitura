// Splash window: the shared Echo Masterworks intro (brand/echo-masterworks-intro) with the coloured seal,
// introducing "Eqo Partitura · Echo Studio".
// CRITICAL: electron/main.js shows this window on title "echo:start" and opens the main window on "echo:done".
import "./styles/diapason.css"; // Diapason font for the title (loaded locally)
import "./styles/splash.css";
import { playEchoIntro } from "../brand/echo-masterworks-intro/echoIntro.js";
import sealUrl from "../brand/echo-masterworks-intro/assets/echo-masterworks-seal.png";
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
  logoUrl: sealUrl,
  emblemRadius: 0.366, // seal: outer ring r = 326 of 2048 × 2.3 scale
  aspect: "1/1",
  soundUrl,
  title: "Eqo Partitura",
  subtitle: "Echo Studio",
  accent: "#9A15EE", // Echo Studio
  ready: go,
  onStart: () => { document.title = "echo:start"; }
}).then(done, done);
