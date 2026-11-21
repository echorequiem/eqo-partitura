// pngEncoder.js — streaming PNG encoder (RGB, 8 bit) for images wider than any canvas.
// Rows arrive band by band, are "Up"-filtered and compressed by the native zlib (CompressionStream "deflate").

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes, crc = 0xffffffff) {
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return crc;
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crc = crc32(data, crc32(out.subarray(4, 8))) ^ 0xffffffff;
  view.setUint32(8 + data.length, crc >>> 0);
  return out;
}

export class PngStreamEncoder {
  constructor(width, height) {
    if (!(width > 0 && height > 0) || width > 0x7fffffff || height > 0x7fffffff) throw new Error("Invalid PNG size");
    this.width = width;
    this.height = height;
    this.rowsWritten = 0;
    this.prevRow = new Uint8Array(width * 3); // for the "Up" filter (first row: all zero = no change)
    this.compressed = [];
    const cs = new CompressionStream("deflate"); // zlib format, exactly what PNG's IDAT expects
    this.writer = cs.writable.getWriter();
    const reader = cs.readable.getReader();
    this.reading = (async () => {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        this.compressed.push(value);
      }
    })();
  }

  /**
   * Adds rows from RGBA pixel data (e.g. ImageData.data) of `rows` rows of the full image width.
   * Alpha is dropped (the strip is opaque).
   */
  async addRowsRGBA(rgba, rows) {
    const w = this.width;
    const rowLen = 1 + w * 3;
    const out = new Uint8Array(rowLen * rows);
    const prev = this.prevRow;
    for (let y = 0; y < rows; y++) {
      const o = y * rowLen;
      out[o] = 2; // filter type 2 = Up
      let s = y * w * 4;
      let d = o + 1;
      for (let x = 0; x < w; x++, s += 4) {
        const p = x * 3;
        const r = rgba[s], g = rgba[s + 1], b = rgba[s + 2];
        out[d++] = (r - prev[p]) & 255;
        out[d++] = (g - prev[p + 1]) & 255;
        out[d++] = (b - prev[p + 2]) & 255;
        prev[p] = r; prev[p + 1] = g; prev[p + 2] = b;
      }
    }
    this.rowsWritten += rows;
    await this.writer.write(out);
  }

  async finish() {
    if (this.rowsWritten !== this.height) throw new Error(`PNG rows ${this.rowsWritten}/${this.height}`);
    await this.writer.close();
    await this.reading;

    const ihdr = new Uint8Array(13);
    const v = new DataView(ihdr.buffer);
    v.setUint32(0, this.width);
    v.setUint32(4, this.height);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // colour type: RGB
    ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // deflate, adaptive filtering, no interlace

    const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr)];
    // IDAT chunks of up to 8 MB each
    const all = this.compressed;
    let buf = [];
    let size = 0;
    const flush = () => {
      if (!size) return;
      const data = new Uint8Array(size);
      let off = 0;
      for (const b of buf) { data.set(b, off); off += b.length; }
      parts.push(chunk("IDAT", data));
      buf = []; size = 0;
    };
    for (const c of all) {
      buf.push(c);
      size += c.length;
      if (size >= 8 * 1024 * 1024) flush();
    }
    flush();
    parts.push(chunk("IEND", new Uint8Array(0)));
    this.compressed = [];
    return new Blob(parts, { type: "image/png" });
  }
}
