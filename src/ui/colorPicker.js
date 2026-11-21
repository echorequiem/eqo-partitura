// colorPicker.js — always-visible inline color picker (saturation/value area + hue bar + hex field).
// Replaces the native <input type="color">, which only opened a popup when clicked.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function normalizeHex(value) {
  let s = String(value || "").trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.split("").map((c) => c + c).join("");
  return /^[0-9a-f]{6}$/i.test(s) ? "#" + s.toUpperCase() : null;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export class InlineColorPicker {
  constructor({ svBox, svCursor, hueBar, hueCursor, hexInput, onChange }) {
    Object.assign(this, { svBox, svCursor, hueBar, hueCursor, hexInput, onChange });
    this.hsv = { h: 0, s: 1, v: 1 };
    this.hex = "#FF0000";

    this._drag(svBox, (px, py) => {
      this.hsv.s = px;
      this.hsv.v = 1 - py;
      this._commit();
    });
    this._drag(hueBar, (_px, py) => {
      this.hsv.h = Math.min(359.999, py * 360);
      this._commit();
    });

    hexInput.addEventListener("input", () => {
      const hex = normalizeHex(hexInput.value);
      hexInput.classList.toggle("invalid", !hex);
      if (hex) this.setColor(hex, { fromInput: true });
    });
    hexInput.addEventListener("blur", () => {
      hexInput.value = this.hex;
      hexInput.classList.remove("invalid");
    });
    hexInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") hexInput.blur();
    });
  }

  /** Pointer drag inside an element; cb receives the position as 0..1 fractions. */
  _drag(el, cb) {
    const handle = (e) => {
      const r = el.getBoundingClientRect();
      cb(clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1));
    };
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* e.g. synthetic or already released pointer */ }
      handle(e);
      const move = (ev) => handle(ev);
      const up = () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    });
  }

  _commit() {
    this.hex = rgbToHex(...hsvToRgb(this.hsv.h, this.hsv.s, this.hsv.v));
    this._render(true);
    if (this.onChange) this.onChange(this.hex);
  }

  /** Sets the color from outside (preset, saved color, project) without losing the hue of greys. */
  setColor(hex, { fromInput = false, silent = false } = {}) {
    const h = normalizeHex(hex);
    if (!h) return;
    const hsv = rgbToHsv(...hexToRgb(h));
    if (hsv.s === 0 || hsv.v === 0) hsv.h = this.hsv.h; // keep the hue for black/white/grey
    this.hsv = hsv;
    this.hex = h;
    this._render(!fromInput);
    if (!silent && this.onChange) this.onChange(h);
  }

  _render(updateInput) {
    const { h, s, v } = this.hsv;
    this.svBox.style.setProperty("--picker-hue", String(Math.round(h)));
    this.svCursor.style.left = `${s * 100}%`;
    this.svCursor.style.top = `${(1 - v) * 100}%`;
    this.hueCursor.style.top = `${(h / 360) * 100}%`;
    if (updateInput) {
      this.hexInput.value = this.hex;
      this.hexInput.classList.remove("invalid");
    }
  }
}
