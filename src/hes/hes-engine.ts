// HES playback engine for the decoder worker.
//
// Same two-engine arrangement as the KSS, SPC and NSF paths: an audible player
// kept just ahead of the play head, and a scanner that runs further ahead to
// produce the per-frame channel snapshots the piano roll and keyboard read,
// plus state keyframes that make seeking near-instant.
//
// The PC Engine's PSG pans every channel in hardware, so this path is stereo
// throughout - like the SPC one, and unlike the mono KSS and NSF paths.

import {
  HESPlayer,
  isHESFile,
  parseHES,
  PSG_CHANNELS,
  type HESFile,
  type HESPlayerState,
} from "hes-js";

export { isHESFile };

/** int16 values per output sample in the per-channel wave buffer. Matches the
 *  KSS path (libkss PerChLayout.stride) so the main-thread ring is shared; the
 *  six PSG channels occupy offsets 0-5. */
export const WAVE_STRIDE = 44;

/** Int16 fields stored per channel in a snapshot. */
export const HES_CH_FIELDS = 6;
const F_KCODE = 0;
const F_VOL = 1;
const F_KEYKEEP = 2;
const F_VNUM = 3;
const F_FLAGS = 4;
const F_PERIOD = 5;

export const HES_FLAG_ACTIVE = 1;
/** Channel is playing written samples rather than its waveform. */
export const HES_FLAG_DDA = 2;
/** Channel is generating noise. */
export const HES_FLAG_NOISE = 4;
/** Channel is being spent on modulating another. */
export const HES_FLAG_LFO = 8;

/** m3disp's key codes put A4 at 57; MIDI puts it at 69. */
const KCODE_FROM_MIDI = -12;

/** State keyframe spacing, as on the NSF path: snapshots are small here. */
const KEYFRAME_SECONDS = 2;

/** Silence before a track is taken to be over. A HES file states no length. */
const SILENCE_SECONDS = 4;
/** Silence to allow a track that has never sounded at all. */
const EMPTY_TRACK_SECONDS = 10;
/** Fade applied when the end was found by listening rather than by metadata. */
const DETECTED_FADE_SECONDS = 1;
/** Frames of run-up a seek leaves for the player's filters to settle. */
const FILTER_SETTLE_FRAMES = 1024;

/**
 * Level correction from hes-js's own full scale to the one the app's master
 * gain is set for.
 *
 * Half of what a loudness measurement against the KSS path suggested. That
 * measurement put the two within a fifth of a decibel of each other, but the
 * PC Engine's six channels are wavetables at full width where the MSX's are
 * mostly narrow pulses, and the meter reads that as parity while the ear does
 * not. The ear won.
 */
const OUTPUT_SCALE = 0.25;

/** Display scale for the per-channel traces, derived from the mix correction
 *  so the picture cannot drift from what is heard. */
const WAVE_SCALE = OUTPUT_SCALE / 4;

export type HESKeyframe = { frame: number; state: HESPlayerState };

export type HESSnapshot = {
  frame: number;
  hes: Int16Array;
  /** The 32-step waveform of whichever channel is selected for display. */
  hesWave: Uint8Array | null;
  /** Channels keyed on during this frame, as the beat estimator's onset weight. */
  keyOns: number;
};

export type HESEngineOptions = {
  /** Track to play, as the file's own numbering has it. */
  track?: number;
  /** Track length in seconds when nothing else says. */
  defaultPlaySeconds?: number;
  /** Fade length in seconds when nothing else says. */
  defaultFadeSeconds?: number;
};

export class HESEngine {
  readonly sampleRate: number;
  private audible: HESPlayer;
  private scanner: HESPlayer;

  /** Absolute output frame each engine has reached. */
  audibleFrames = 0;
  scannerFrames = 0;

  /** Total track length in output frames, including the fade. */
  totalFrames = 0;
  file: HESFile | null = null;

  private keyframes: HESKeyframe[] = [];
  private pending: HESSnapshot[] = [];
  private data: Uint8Array | null = null;
  private options: HESEngineOptions = {};
  private track = 0;

  /** Bit per channel: 1 = muted. Applied to both engines so a restored keyframe
   *  never resurrects the previous mask. */
  private channelMask = 0;
  /** Re-applied on load, which replaces the player instances. */
  private waveEnabled = false;

  /** Frames of continuous silence the scanner has seen, and whether it has
   *  heard anything at all yet. */
  private silentRun = 0;
  private heardAudio = false;
  /** Frame the music stopped at, once that has been established. */
  endFrame = 0;
  endDetected = false;

  /** Key-on counters seen at the previous snapshot, and the frames since each
   *  channel last started a note. */
  private lastKeyOn = new Int32Array(PSG_CHANNELS);
  private keyKeepFrames = new Int32Array(PSG_CHANNELS);

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.audible = new HESPlayer({ sampleRate });
    this.scanner = new HESPlayer({ sampleRate });
  }

  /** Output frames per NTSC frame — the snapshot grid the views index by. */
  get framesPerNtsc(): number {
    return this.sampleRate / 60;
  }

  private makePlayer(): HESPlayer {
    return new HESPlayer({
      sampleRate: this.sampleRate,
      defaultPlaySeconds: this.options.defaultPlaySeconds,
      defaultFadeSeconds: this.options.defaultFadeSeconds,
    });
  }

  load(data: Uint8Array, options: HESEngineOptions = {}): void {
    this.options = options;
    this.data = data;
    const file = parseHES(data);
    this.file = file;
    this.track = options.track ?? file.startSong;

    this.audible = this.makePlayer();
    this.scanner = this.makePlayer();
    this.audible.load(file, this.track);
    this.scanner.load(file, this.track);
    // The scanner never renders, so settling the analogue filters at the end of
    // every skip would cost it most of its speed for nothing.
    this.scanner.filterPrimeOnSkip = false;
    this.applyChannelMask();
    this.audible.channelCaptureEnabled = this.waveEnabled;

    this.audibleFrames = 0;
    this.scannerFrames = 0;
    this.keyframes = [];
    this.pending = [];
    this.lastKeyOn.fill(0);
    this.keyKeepFrames.fill(0);
    this.silentRun = 0;
    this.heardAudio = false;
    this.endFrame = 0;
    this.endDetected = false;
    this.totalFrames = Math.round(this.audible.totalSeconds * this.sampleRate);
  }

  setChannelMask(mask: number): void {
    this.channelMask = mask & 0x3f;
    this.applyChannelMask();
  }

  private applyChannelMask(): void {
    this.audible.setChannelMask(this.channelMask);
    this.scanner.setChannelMask(this.channelMask);
  }

  /** Turn per-channel waveform capture on or off. */
  setWaveEnabled(enabled: boolean): void {
    this.waveEnabled = enabled;
    this.audible.channelCaptureEnabled = enabled;
  }

  /**
   * Render the next `step` output frames of audible audio.
   *
   * Genuinely stereo: the PSG gives every channel its own left and right
   * attenuation, so the two sides are different signals rather than one signal
   * with a balance applied.
   */
  render(step: number): { left: Int16Array; right: Int16Array; perCh: Int16Array | null } {
    const left = new Int16Array(step);
    const right = new Int16Array(step);
    this.audible.renderInto(left, right, 0, step);
    // Brought down to the KSS path's level, so a change of format is not a
    // change of volume.
    for (let i = 0; i < step; i++) {
      left[i] = (left[i] * OUTPUT_SCALE) | 0;
      right[i] = (right[i] * OUTPUT_SCALE) | 0;
    }
    this.audibleFrames += step;

    let perCh: Int16Array | null = null;
    if (this.audible.channelCaptureEnabled) {
      const src = this.audible.channelCapture;
      const captured = this.audible.channelCaptureLength;
      perCh = new Int16Array(step * WAVE_STRIDE);
      if (captured > 0) {
        for (let i = 0; i < step; i++) {
          const s = Math.min(captured - 1, i) * PSG_CHANNELS;
          const d = i * WAVE_STRIDE;
          for (let c = 0; c < PSG_CHANNELS; c++) perCh[d + c] = (src[s + c] * WAVE_SCALE) | 0;
        }
      }
    }
    return { left, right, perCh };
  }

  /** Pack the scanner's channel state into the int16 layout the views read. */
  private encodeChannels(): { hes: Int16Array; keyOns: number } {
    const out = new Int16Array(PSG_CHANNELS * HES_CH_FIELDS);
    const grid = Math.max(1, Math.round(this.framesPerNtsc));
    let keyOns = 0;

    for (let c = 0; c < PSG_CHANNELS; c++) {
      const s = this.scanner.getChannelStatus(c);
      const o = c * HES_CH_FIELDS;

      if (s.keyOnCount !== this.lastKeyOn[c]) {
        this.lastKeyOn[c] = s.keyOnCount;
        this.keyKeepFrames[c] = 0;
        if (s.active) keyOns++;
      } else {
        this.keyKeepFrames[c] = Math.min(0x7fff, this.keyKeepFrames[c] + grid);
      }

      const vol = s.active ? Math.max(1, Math.round(s.level * 15)) : 0;

      let kcode = -1;
      if (s.active && vol > 0 && s.note != null) {
        const k = Math.round(s.note) + KCODE_FROM_MIDI;
        if (k >= 0 && k < 96) kcode = k;
      }

      let flags = s.active ? HES_FLAG_ACTIVE : 0;
      if (s.mode === "dda") flags |= HES_FLAG_DDA;
      if (s.mode === "noise") flags |= HES_FLAG_NOISE;
      if (s.mode === "lfo") flags |= HES_FLAG_LFO;

      // Coloured by a digest of the waveform, the way the SCC channels are, so
      // a change of timbre shows as a change of colour.
      let vnum = 0;
      if (s.wave != null) vnum = (s.wave[4] + s.wave[20]) & 0x0f;

      out[o + F_KCODE] = kcode;
      out[o + F_VOL] = vol;
      out[o + F_KEYKEEP] = this.keyKeepFrames[c];
      out[o + F_VNUM] = vnum;
      out[o + F_FLAGS] = flags;
      out[o + F_PERIOD] = Math.min(0x7fff, s.period);
    }

    return { hes: out, keyOns };
  }

  /**
   * The waveform of the first channel that has one, as signed bytes.
   *
   * One waveform per frame rather than six: the display shows the channel the
   * view has selected, and carrying all of them would multiply the snapshot
   * size by six for something only one of which is ever drawn.
   */
  private encodeWave(): Uint8Array | null {
    for (let c = 0; c < PSG_CHANNELS; c++) {
      const s = this.scanner.getChannelStatus(c);
      if (s.wave == null || !s.active) continue;
      const out = new Uint8Array(s.wave.length);
      // Five bits unsigned around a centre of 16, drawn as signed bytes.
      for (let i = 0; i < s.wave.length; i++) out[i] = ((s.wave[i] - 16) * 8) & 0xff;
      return out;
    }
    return null;
  }

  /**
   * Advance the scanner to `targetFrame`, capturing one channel snapshot per
   * NTSC frame and a state keyframe every KEYFRAME_SECONDS.
   */
  advanceScanner(targetFrame: number, maxFrames = Infinity): void {
    const grid = this.framesPerNtsc;
    const limit = Math.min(targetFrame, this.scannerFrames + maxFrames);
    const keyframeStep = KEYFRAME_SECONDS * this.sampleRate;

    while (this.scannerFrames < limit) {
      if (this.totalFrames > 0 && this.scannerFrames >= this.totalFrames) break;

      const nextKeyframeAt = this.keyframes.length * keyframeStep;
      if (this.scannerFrames >= nextKeyframeAt) {
        this.keyframes.push({ frame: this.scannerFrames, state: this.scanner.saveState() });
      }

      const { hes, keyOns } = this.encodeChannels();
      this.pending.push({
        frame: this.scannerFrames,
        hes,
        hesWave: this.encodeWave(),
        keyOns,
      });
      this.trackSilence(hes, grid);

      const step = Math.max(1, Math.round(grid));
      this.scanner.skip(step);
      this.scannerFrames += step;
    }
  }

  /**
   * Watch for the point where the music stops.
   *
   * A HES file states no length at all, and its driver keeps being called for
   * as long as the interrupts keep coming, so a track that has finished plays
   * silence forever unless someone notices.
   */
  private trackSilence(hes: Int16Array, grid: number): void {
    if (this.endDetected) return;

    let sounding = false;
    for (let c = 0; c < PSG_CHANNELS; c++) {
      if (hes[c * HES_CH_FIELDS + 1] > 0) {
        sounding = true;
        break;
      }
    }

    if (sounding) {
      this.silentRun = 0;
      this.heardAudio = true;
      return;
    }

    this.silentRun += grid;
    const window = this.heardAudio ? SILENCE_SECONDS : EMPTY_TRACK_SECONDS;
    if (this.silentRun < window * this.sampleRate) return;

    const stopped = Math.max(0, this.scannerFrames - this.silentRun);
    this.endDetected = true;
    if (this.totalFrames > 0 && stopped >= this.totalFrames) {
      this.endFrame = this.totalFrames;
      return;
    }
    this.endFrame = stopped;
    this.audible.setPlayLength(stopped / this.sampleRate, DETECTED_FADE_SECONDS);
    this.scanner.setPlayLength(stopped / this.sampleRate, DETECTED_FADE_SECONDS);
    this.totalFrames = stopped + Math.round(DETECTED_FADE_SECONDS * this.sampleRate);
  }

  /** Hand over (and clear) the snapshots captured since the last call. */
  takeSnapshots(): HESSnapshot[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  private nearestKeyframe(frame: number, slack = 0): HESKeyframe | null {
    let best: HESKeyframe | null = null;
    let previous: HESKeyframe | null = null;
    for (const k of this.keyframes) {
      if (k.frame > frame) break;
      previous = best;
      best = k;
    }
    if (best != null && frame - best.frame < slack && previous != null) return previous;
    return best;
  }

  /** Move the audible engine to `frame`, restoring the nearest earlier keyframe
   *  and fast-forwarding the remainder. */
  seekAudibleTo(frame: number): void {
    const best = this.nearestKeyframe(frame, FILTER_SETTLE_FRAMES);
    if (best != null) {
      this.audible.restoreState(best.state);
      this.audibleFrames = best.frame;
    } else if (this.data != null) {
      this.audible.setTrack(this.track);
      this.audibleFrames = 0;
    }
    this.applyChannelMask();

    const remaining = frame - this.audibleFrames;
    if (remaining > 0) {
      this.audible.skip(remaining);
      this.audibleFrames = frame;
    }
  }

  /** Move the scanner to `frame`, dropping snapshots that no longer apply. */
  seekScannerTo(frame: number): void {
    const best = this.nearestKeyframe(frame);
    if (best != null) {
      this.scanner.restoreState(best.state);
      this.scannerFrames = best.frame;
    } else if (this.data != null) {
      this.scanner.setTrack(this.track);
      this.scannerFrames = 0;
    }
    this.applyChannelMask();
    if (frame > this.scannerFrames) {
      this.scanner.skip(frame - this.scannerFrames);
      this.scannerFrames = frame;
    }
    this.pending = [];
    this.lastKeyOn.fill(-1);
    this.keyKeepFrames.fill(0);
  }

  /** Furthest frame the scanner has reached — drives the seek buffer bar. */
  get bufferedFrame(): number {
    return this.scannerFrames;
  }

  dispose(): void {
    this.keyframes = [];
    this.pending = [];
    this.data = null;
    this.file = null;
  }
}
