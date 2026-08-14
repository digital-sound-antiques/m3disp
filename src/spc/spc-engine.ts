// SPC playback engine for the decoder worker.
//
// Mirrors the KSS path's two-engine arrangement: an audible player kept just
// ahead of the play head, and a scanner that runs further ahead to produce the
// per-frame voice snapshots the piano roll and keyboard read, plus periodic
// state keyframes that make seeking near-instant.
//
// SPC seeking is exact in a way the KSS path can't be: an .spc snapshot is the
// whole machine (RAM, DSP, timers), so a restored keyframe reproduces the
// original samples bit for bit.

import { SPCPlayer, isSPCFile, parseSPC, type SPCTags } from "spc700-js";

export { isSPCFile };

/** int16 values per output sample in the per-channel wave buffer. Matches the
 *  KSS path (libkss PerChLayout.stride) so the main-thread ring is shared; the
 *  eight S-DSP voices occupy offsets 0-7. */
export const WAVE_STRIDE = 44;

/** Int16 fields stored per voice in a snapshot. */
export const SPC_VOICE_FIELDS = 6;
const F_KCODE = 0;
const F_VOL = 1;
const F_KEYKEEP = 2;
const F_SRCN = 3;
const F_FLAGS = 4;
const F_ENV = 5;

export const SPC_FLAG_NOISE = 1;
export const SPC_FLAG_ECHO = 2;
export const SPC_FLAG_PMOD = 4;

/** m3disp's key codes put A4 at 57; MIDI puts it at 69. */
const KCODE_FROM_MIDI = -12;

/** State keyframe spacing. Rendering runs tens of times faster than realtime,
 *  so 5 s spacing keeps a seek under ~0.1 s while holding the snapshot count
 *  (each is a full 64 KB machine image) low. */
const KEYFRAME_SECONDS = 5;

export type SPCKeyframe = {
  frame: number;
  state: ReturnType<SPCPlayer["saveState"]>;
};

export type SPCSnapshot = { frame: number; spc: Int16Array };

export type SPCEngineOptions = {
  /** Track length in seconds when the tags say nothing. */
  defaultPlaySeconds?: number;
  /** Loop repeats when the xid6 loop length is known. */
  loopCount?: number;
};

function encodeVoices(player: SPCPlayer, framesPerNtsc: number): Int16Array {
  const out = new Int16Array(8 * SPC_VOICE_FIELDS);
  const now = player.dspSampleCount;
  for (let i = 0; i < 8; i++) {
    const s = player.getVoiceStatus(i);
    const o = i * SPC_VOICE_FIELDS;

    const level = Math.max(Math.abs(s.volumeLeft), Math.abs(s.volumeRight));
    const vol = s.active ? Math.round(15 * (s.envelope / 0x7ff) * (level / 127)) : 0;

    // The note comes from spc700-js's tuning table, which recovers each sample's
    // base pitch from its own waveform (loop length for short loops, spectrum
    // for sampled acoustic material) and then refines it against the notes the
    // driver actually plays. Samples with no recoverable pitch report null.
    if (s.active && vol > 0 && s.note != null) {
      const k = Math.round(s.note) + KCODE_FROM_MIDI;
      out[o + F_KCODE] = k >= 0 && k < 96 ? k : -1;
    } else {
      out[o + F_KCODE] = -1;
    }
    out[o + F_VOL] = vol;
    out[o + F_KEYKEEP] = Math.min(
      0x7fff,
      Math.max(0, Math.floor((now - s.keyOnAt) / framesPerNtsc))
    );
    out[o + F_SRCN] = s.source;
    out[o + F_FLAGS] =
      (s.noise ? SPC_FLAG_NOISE : 0) |
      (s.echo ? SPC_FLAG_ECHO : 0) |
      (s.pitchModulated ? SPC_FLAG_PMOD : 0);
    out[o + F_ENV] = s.envelope;
  }
  return out;
}

export class SPCEngine {
  readonly sampleRate: number;
  private audible: SPCPlayer;
  private scanner: SPCPlayer;

  /** Absolute output frame each engine has reached. */
  audibleFrames = 0;
  scannerFrames = 0;

  /** Total track length in output frames (intro + loops + fade). */
  totalFrames = 0;
  tags: SPCTags = {};

  private keyframes: SPCKeyframe[] = [];
  private pending: SPCSnapshot[] = [];
  private data: Uint8Array | null = null;
  private options: SPCEngineOptions = {};

  /** Bit per voice: 1 = muted. Applied to both engines so a restored keyframe
   *  never resurrects the previous mask. */
  private voiceMask = 0;
  /** Re-applied on load, which replaces the player instances. */
  private waveEnabled = false;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.audible = new SPCPlayer({ sampleRate });
    this.scanner = new SPCPlayer({ sampleRate });
  }

  /** Output frames per NTSC frame — the snapshot grid the views index by. */
  get framesPerNtsc(): number {
    return this.sampleRate / 60;
  }

  private makePlayer(): SPCPlayer {
    return new SPCPlayer({
      sampleRate: this.sampleRate,
      defaultPlaySeconds: this.options.defaultPlaySeconds,
      loopCount: this.options.loopCount,
    });
  }

  load(data: Uint8Array, options: SPCEngineOptions = {}): void {
    this.options = options;
    this.data = data;
    const file = parseSPC(data);
    this.tags = file.tags;

    this.audible = this.makePlayer();
    this.scanner = this.makePlayer();
    this.audible.load(file);
    this.scanner.load(file);
    this.applyVoiceMask();
    this.audible.voiceCaptureEnabled = this.waveEnabled;

    this.audibleFrames = 0;
    this.scannerFrames = 0;
    this.keyframes = [];
    this.pending = [];
    this.totalFrames = Math.round(this.audible.totalSeconds * this.sampleRate);
  }

  setVoiceMask(mask: number): void {
    this.voiceMask = mask & 0xff;
    this.applyVoiceMask();
  }

  private applyVoiceMask(): void {
    this.audible.setVoiceMask(this.voiceMask);
    this.scanner.setVoiceMask(this.voiceMask);
  }

  /** Turn per-voice waveform capture on or off. */
  setWaveEnabled(enabled: boolean): void {
    this.waveEnabled = enabled;
    this.audible.voiceCaptureEnabled = enabled;
  }

  /**
   * Render the next `step` output frames of audible audio.
   *
   * When wave capture is on, `perCh` carries the eight voices in the same
   * stride-per-sample layout the KSS path uses, so the main thread's ring and
   * its readers need no changes. The DSP produces those samples at its own
   * 32 kHz, so they are held to the output grid rather than resampled — this
   * feeds a scope, where a bandlimited kernel would buy nothing.
   */
  render(step: number): { left: Int16Array; right: Int16Array; perCh: Int16Array | null } {
    const left = new Int16Array(step);
    const right = new Int16Array(step);
    this.audible.renderInto(left, right, 0, step);
    // The S-DSP runs about twice as hot as the KSS devices at the same master
    // volume, so halve it here rather than making the listener ride the volume
    // control when a track changes format.
    for (let i = 0; i < step; i++) {
      left[i] >>= 1;
      right[i] >>= 1;
    }
    this.audibleFrames += step;

    let perCh: Int16Array | null = null;
    if (this.audible.voiceCaptureEnabled) {
      const src = this.audible.voiceCapture;
      const captured = this.audible.voiceCaptureLength;
      perCh = new Int16Array(step * WAVE_STRIDE);
      if (captured > 0) {
        for (let i = 0; i < step; i++) {
          const s = Math.min(captured - 1, ((i * captured) / step) | 0) * 8;
          const d = i * WAVE_STRIDE;
          // Scaled down for display: a voice output before its volume is
          // applied spans the full 16-bit range, whereas the scope is drawn
          // against a full scale of ~3000 (see WaveGrid) — the level libkss's
          // per-channel outputs sit at.
          for (let v = 0; v < 8; v++) perCh[d + v] = src[s + v] >> 5;
        }
      }
    }
    return { left, right, perCh };
  }

  /**
   * Advance the scanner to `targetFrame`, capturing one voice snapshot per NTSC
   * frame and a state keyframe every KEYFRAME_SECONDS. `maxFrames` caps the work
   * done in one call so the first audio chunks after a track change aren't held
   * up by a full look-ahead scan.
   */
  advanceScanner(targetFrame: number, maxFrames = Infinity): void {
    const grid = this.framesPerNtsc;
    const limit = Math.min(targetFrame, this.scannerFrames + maxFrames);
    const keyframeStep = KEYFRAME_SECONDS * this.sampleRate;

    while (this.scannerFrames < limit) {
      if (this.totalFrames > 0 && this.scannerFrames >= this.totalFrames) break;

      // Keyframe before advancing so the stored state matches the frame label.
      const nextKeyframeAt = this.keyframes.length * keyframeStep;
      if (this.scannerFrames >= nextKeyframeAt) {
        this.keyframes.push({
          frame: this.scannerFrames,
          state: this.scanner.saveState(),
        });
      }

      this.pending.push({
        frame: this.scannerFrames,
        spc: encodeVoices(this.scanner, grid),
      });

      const step = Math.max(1, Math.round(grid));
      this.scanner.skip(step);
      this.scannerFrames += step;
    }
  }

  /** Hand over (and clear) the snapshots captured since the last call. */
  takeSnapshots(): SPCSnapshot[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  /**
   * Move the audible engine to `frame`, restoring the nearest earlier keyframe
   * and fast-forwarding the remainder. Exact: a restored SPC state reproduces
   * the same output as continuous playback.
   */
  seekAudibleTo(frame: number): void {
    let best: SPCKeyframe | null = null;
    for (const k of this.keyframes) {
      if (k.frame <= frame) best = k;
      else break;
    }

    if (best != null) {
      this.audible.restoreState(best.state);
      this.audibleFrames = best.frame;
    } else if (this.data != null) {
      this.audible.load(this.data);
      this.audibleFrames = 0;
    }
    this.applyVoiceMask();

    const remaining = frame - this.audibleFrames;
    if (remaining > 0) {
      this.audible.skip(remaining);
      this.audibleFrames = frame;
    }
  }

  /** Move the scanner to `frame`, dropping snapshots that no longer apply. */
  seekScannerTo(frame: number): void {
    let best: SPCKeyframe | null = null;
    for (const k of this.keyframes) {
      if (k.frame <= frame) best = k;
      else break;
    }
    if (best != null) {
      this.scanner.restoreState(best.state);
      this.scannerFrames = best.frame;
    } else if (this.data != null) {
      this.scanner.load(this.data);
      this.scannerFrames = 0;
    }
    this.applyVoiceMask();
    if (frame > this.scannerFrames) {
      this.scanner.skip(frame - this.scannerFrames);
      this.scannerFrames = frame;
    }
    this.pending = [];
  }

  /** Furthest frame the scanner has reached — drives the seek buffer bar. */
  get bufferedFrame(): number {
    return this.scannerFrames;
  }

  dispose(): void {
    this.keyframes = [];
    this.pending = [];
    this.data = null;
  }
}
