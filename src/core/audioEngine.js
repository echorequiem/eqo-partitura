// audioEngine.js — music track: decoding, offline mixing and WebCodecs encoding.
// CRITICAL: offset means audioTime = videoTime - offset (same in preview and render);
//           > 0 the music starts later, < 0 its beginning is skipped.

export const AUDIO_SAMPLE_RATE = 48000;
export const AUDIO_CHANNELS = 2;
const FRAMES_PER_CHUNK = 1024;

export async function decodeAudioFile(file) {
  const ctx = new AudioContext();
  try {
    return await ctx.decodeAudioData(await file.arrayBuffer());
  } finally {
    ctx.close().catch(() => {});
  }
}

/** Video length needed so the whole (shifted) music fits. */
export function audioEndTime(buffer, offset) {
  return buffer ? Math.max(0, offset + buffer.duration) : 0;
}

/**
 * Mixes several tracks into one 48 kHz stereo buffer exactly `duration` seconds long.
 * @param tracks [{ buffer: AudioBuffer, at: seconds in the video (may be negative = skip its start),
 *                  volume }]
 */
export async function renderAudioTracks(tracks, duration) {
  const length = Math.max(1, Math.ceil(duration * AUDIO_SAMPLE_RATE));
  const oc = new OfflineAudioContext(AUDIO_CHANNELS, length, AUDIO_SAMPLE_RATE);
  for (const tr of tracks) {
    if (!tr || !tr.buffer) continue;
    const src = oc.createBufferSource();
    src.buffer = tr.buffer;
    const gain = oc.createGain();
    const vol = tr.volume ?? 1;
    gain.gain.value = vol;
    const end = tr.at + tr.buffer.duration;
    if (end > duration + 0.01 && duration > 0.5) { // cut by the end of the video: fade instead of a click
      gain.gain.setValueAtTime(vol, duration - 0.4);
      gain.gain.linearRampToValueAtTime(0, duration);
    }
    src.connect(gain).connect(oc.destination);
    const when = Math.max(0, tr.at);
    const skip = Math.max(0, -tr.at);
    if (skip < tr.buffer.duration && when < duration) src.start(when, skip);
  }
  return oc.startRendering();
}

/** Picks a supported audio encoder for the container. -> { config, muxCodec } or null */
export async function pickAudioEncoder(container) {
  if (typeof AudioEncoder === "undefined") return null;
  const base = { sampleRate: AUDIO_SAMPLE_RATE, numberOfChannels: AUDIO_CHANNELS, bitrate: 192000 };
  const list = container === "mp4"
    ? [{ config: { ...base, codec: "mp4a.40.2" }, muxCodec: "aac" }, { config: { ...base, codec: "opus" }, muxCodec: "opus" }]
    : [{ config: { ...base, codec: "opus" }, muxCodec: "A_OPUS" }];
  for (const cand of list) {
    try {
      const res = await AudioEncoder.isConfigSupported(cand.config);
      if (res && res.supported) return cand;
    } catch (_) { /* not supported */ }
  }
  return null;
}

/** Feeds a mixed AudioBuffer to an AudioEncoder progressively, in step with the video frames. */
export class AudioTrackEncoder {
  constructor(mix, cand, onChunk) {
    this.mix = mix;
    this.error = null;
    this.pos = 0; // next sample frame to encode
    this.channels = [];
    for (let c = 0; c < AUDIO_CHANNELS; c++) this.channels.push(mix.getChannelData(Math.min(c, mix.numberOfChannels - 1)));
    this.encoder = new AudioEncoder({
      output: (chunk, meta) => {
        try { onChunk(chunk, meta); } catch (e) { this.error = this.error || e; }
      },
      error: (e) => { this.error = this.error || e; }
    });
    this.encoder.configure(cand.config);
  }

  /** Encodes all samples up to `timeSec`. */
  encodeUntil(timeSec) {
    const target = Math.min(this.mix.length, Math.ceil(timeSec * AUDIO_SAMPLE_RATE));
    while (this.pos < target) {
      const n = Math.min(FRAMES_PER_CHUNK, this.mix.length - this.pos);
      const planar = new Float32Array(n * AUDIO_CHANNELS);
      for (let c = 0; c < AUDIO_CHANNELS; c++) planar.set(this.channels[c].subarray(this.pos, this.pos + n), c * n);
      const data = new AudioData({
        format: "f32-planar",
        sampleRate: AUDIO_SAMPLE_RATE,
        numberOfFrames: n,
        numberOfChannels: AUDIO_CHANNELS,
        timestamp: Math.round((this.pos / AUDIO_SAMPLE_RATE) * 1e6),
        data: planar
      });
      try {
        this.encoder.encode(data);
      } finally {
        data.close();
      }
      this.pos += n;
    }
  }

  async finish() {
    this.encodeUntil(this.mix.length / AUDIO_SAMPLE_RATE);
    await this.encoder.flush();
    if (this.error) throw this.error;
  }

  close() {
    try { if (this.encoder.state !== "closed") this.encoder.close(); } catch (_) { /* ignore */ }
  }
}
