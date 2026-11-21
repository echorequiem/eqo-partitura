// sound.js — Echo interface sounds: soft water-drop clicks made in the browser (Web Audio), no sound files.
// Same family as the Echo Masterworks website (js/sound.js); kept short and quiet for a working app, and without
// the website's ambient water so it never sits under the music. Switchable; the choice is remembered.
const KEY = "echo-sound";

export const Sfx = (() => {
  let ctx = null;
  let master = null;
  let noise = null;
  let enabled = true;
  try { enabled = localStorage.getItem(KEY) !== "off"; } catch (_) { /* storage blocked: default on */ }

  function init() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC({ latencyHint: "interactive" }); } catch (_) { ctx = new AC(); }
    master = ctx.createGain();
    master.gain.value = enabled ? 0.7 : 0;
    const comp = ctx.createDynamicsCompressor(); // never harsh
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    master.connect(comp).connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; } // soft brown noise
    return ctx;
  }

  const unlock = () => { if (init() && ctx.state === "suspended") ctx.resume(); };
  ["pointerdown", "keydown"].forEach((ev) => addEventListener(ev, unlock, { passive: true, capture: true }));
  document.addEventListener("visibilitychange", () => { if (ctx) (document.hidden ? ctx.suspend() : ctx.resume()); });

  const ready = () => enabled && ctx && ctx.state === "running";
  const r = (a, b) => a + Math.random() * (b - a);

  function tone({ f0, f1 = f0, dur = 0.2, type = "sine", gain = 0.1, attack = 0.005, delay = 0 }) {
    if (!ready()) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur * 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function whoosh({ from = 400, to = 2000, dur = 0.4, gain = 0.05 }) {
    if (!ready()) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(from, t);
    bp.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp).connect(g).connect(master);
    s.start(t, Math.random() * 0.4);
    s.stop(t + dur + 0.05);
  }

  return {
    get enabled() { return enabled; },
    setEnabled(on) {
      enabled = !!on;
      try { localStorage.setItem(KEY, enabled ? "on" : "off"); } catch (_) { /* not remembered */ }
      if (!init()) return;
      if (ctx.state === "suspended") ctx.resume();
      master.gain.setTargetAtTime(enabled ? 0.7 : 0, ctx.currentTime, 0.1);
      if (enabled) setTimeout(() => this.chime(), 60);
    },
    /** click: a water drop "bloop" (soft = quieter, for everyday buttons) */
    drop(_pan = 0, soft = false) {
      const k = soft ? 0.45 : 0.9;
      const base = r(330, 420);
      tone({ f0: base, f1: base * 2.9, dur: 0.15, gain: 0.12 * k });
      tone({ f0: base * 1.5, f1: base * 3.6, dur: 0.09, gain: 0.04 * k, delay: 0.035 });
    },
    /** moving between steps */
    slide(back = false) {
      whoosh(back ? { from: 2200, to: 420, dur: 0.45, gain: 0.04 } : { from: 420, to: 2200, dur: 0.45, gain: 0.04 });
    },
    /** something finished well (a render) */
    chime() {
      tone({ f0: 659.3, dur: 0.6, gain: 0.03, attack: 0.01 });
      tone({ f0: 987.8, dur: 0.8, gain: 0.022, delay: 0.09, attack: 0.01 });
    }
  };
})();
