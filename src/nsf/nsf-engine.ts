// NSF playback engine for the decoder worker.
//
// Same two-engine arrangement as the KSS and SPC paths: an audible player kept
// just ahead of the play head, and a scanner that runs further ahead to produce
// the per-frame channel snapshots the piano roll and keyboard read, plus state
// keyframes that make seeking near-instant.
//
// NSF seeking is exact, and cheaper than the SPC path's: a keyframe is 2 KB of
// RAM plus whatever pages the driver can write, not a 64 KB machine image, so
// they can be placed closely without the memory adding up.

import {
  NSFPlayer,
  isNSFFile,
  parseNSF,
  CHANNEL_COUNT,
  CH_DMC,
  CH_FDS,
  CH_NOISE,
  CH_TRIANGLE,
  CH_VRC6_PULSE1,
  CH_VRC6_PULSE2,
  CH_VRC6_SAW,
  type NSFFile,
  type NSFPlayerState,
} from "nsf-js";

export { isNSFFile };

/** int16 values per output sample in the per-channel wave buffer. Matches the
 *  KSS path (libkss PerChLayout.stride) so the main-thread ring is shared; the
 *  six NES channels occupy offsets 0-5. */
export const WAVE_STRIDE = 44;

/** Int16 fields stored per channel in a snapshot. */
export const NSF_CH_FIELDS = 6;
const F_KCODE = 0;
const F_VOL = 1;
const F_KEYKEEP = 2;
const F_VNUM = 3;
const F_FLAGS = 4;
const F_PERIOD = 5;

export const NSF_FLAG_ACTIVE = 1;
/** Noise channel is in its short, pitched mode. */
export const NSF_FLAG_SHORT = 2;
/** FDS channel is being pitch-modulated. */
export const NSF_FLAG_MOD = 4;

/** m3disp's key codes put A4 at 57; MIDI puts it at 69. */
const KCODE_FROM_MIDI = -12;

/**
 * How long every channel must stay silent before the track is taken to be over.
 *
 * A plain NSF carries no length: it is a program, and it will keep being called
 * for as long as anyone calls it. Most drivers do eventually fall silent - at
 * the end of a jingle, or on a sound effect that has finished - and playing five
 * minutes of nothing after that is worse than cutting it short. Music that
 * merely rests for a bar is well inside this window.
 */
const SILENCE_SECONDS = 4;

/**
 * Silence to allow before giving up on a track that never made a sound at all.
 *
 * Longer than the normal window, because a driver that has not started yet
 * looks exactly like one that has finished, and the cost of waiting is a few
 * seconds against the cost of cutting off a slow intro.
 */
const EMPTY_TRACK_SECONDS = 10;

/** Fade applied when the end was found by listening rather than by metadata. */
const DETECTED_FADE_SECONDS = 1;

/** Frames of run-up a seek leaves for the player's filters to settle. */
const FILTER_SETTLE_FRAMES = 1024;

/**
 * Level correction from nsf-js's own full scale to the one the app's master gain
 * is set for.
 *
 * Measured, not guessed, and measured as loudness rather than as amplitude: the
 * ear is not an RMS meter, and NES music is bright where MSX FM is not, so the
 * two can meet on RMS and still not sound the same. Weighted the way ITU-R
 * BS.1770 weights it, across a dozen KSS files, two dozen NSF tracks and eight
 * SPC dumps, the three paths sit at -31.7, -30.0 and -31.3 LUFS - the NES path
 * a decibel and a half hot. This brings it in line, and lands on the same half
 * the SPC path already applies for the same reason.
 *
 * Some NSF tracks will still be louder than a typical MSX one: that corpus
 * spans 12 LU against the MSX corpus's 7, which is the music rather than the
 * emulation.
 */
const OUTPUT_SCALE = 0.5;

/**
 * State keyframe spacing. Keyframes are small here, and rendering runs well
 * above realtime, so 2 s matches the KSS path rather than the SPC path's 5.
 */
const KEYFRAME_SECONDS = 2;

export type NSFKeyframe = { frame: number; state: NSFPlayerState };

export type NSFSnapshot = {
  frame: number;
  nsf: Int16Array;
  /** FDS wavetable as signed bytes, for the waveform display; null otherwise. */
  nsfWave: Uint8Array | null;
  /** Channels keyed on during this frame, as the beat estimator's onset weight. */
  keyOns: number;
};

export type NSFEngineOptions = {
  /** Track to play, zero-based. */
  track?: number;
  /** Track length in seconds when the file's own metadata says nothing. */
  defaultPlaySeconds?: number;
  /** Fade length in seconds when the file's own metadata says nothing. */
  defaultFadeSeconds?: number;
};

export class NSFEngine {
  readonly sampleRate: number;
  private audible: NSFPlayer;
  private scanner: NSFPlayer;

  /** Absolute output frame each engine has reached. */
  audibleFrames = 0;
  scannerFrames = 0;

  /** Total track length in output frames, including the fade. */
  totalFrames = 0;
  file: NSFFile | null = null;

  private keyframes: NSFKeyframe[] = [];
  private pending: NSFSnapshot[] = [];
  private data: Uint8Array | null = null;
  private options: NSFEngineOptions = {};
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
  /** Frame the music stopped at, once that has been established. Zero is a
   *  legitimate answer - a track that never sounds at all - so the flag beside
   *  it, not the value, says whether the question has been settled. */
  endFrame = 0;
  endDetected = false;
  /** False when the file uses a chip this player does not have, in which case
   *  silence proves nothing: the missing channels may be carrying the tune. */
  private silenceDetection = true;

  /** Key-on counters seen at the previous snapshot, and the frames since each
   *  channel last started a note. The player counts retriggers; turning that
   *  into "how long has this note been held" is the view's need, not the
   *  emulator's. */
  private lastKeyOn = new Int32Array(CHANNEL_COUNT);
  private keyKeepFrames = new Int32Array(CHANNEL_COUNT);

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.audible = new NSFPlayer({ sampleRate });
    this.scanner = new NSFPlayer({ sampleRate });
  }

  /** Output frames per NTSC frame — the snapshot grid the views index by. */
  get framesPerNtsc(): number {
    return this.sampleRate / 60;
  }

  private makePlayer(): NSFPlayer {
    return new NSFPlayer({
      sampleRate: this.sampleRate,
      defaultPlaySeconds: this.options.defaultPlaySeconds,
      // A track that runs to the length cap has to fade rather than stop dead:
      // NSF music loops forever, so the cap almost always lands mid-phrase.
      defaultFadeSeconds: this.options.defaultFadeSeconds,
    });
  }

  load(data: Uint8Array, options: NSFEngineOptions = {}): void {
    this.options = options;
    this.data = data;
    const file = parseNSF(data);
    this.file = file;
    this.track = Math.max(0, Math.min(file.trackCount - 1, options.track ?? file.startTrack));

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
    const { vrc7, mmc5, n163, s5b } = file.chips;
    this.silenceDetection = !(vrc7 || mmc5 || n163 || s5b);
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
   * The NES mixes to one output, so both stereo channels carry the same signal.
   * When wave capture is on, `perCh` carries the six channels in the same
   * stride-per-sample layout the KSS path uses, so the main thread's ring and
   * its readers need no changes.
   */
  render(step: number): { left: Int16Array; right: Int16Array; perCh: Int16Array | null } {
    const left = new Int16Array(step);
    const right = new Int16Array(step);
    this.audible.renderInto(left, right, 0, step);
    // Brought down to the KSS path's level, so a change of format is not a
    // change of volume. The same correction the SPC path applies, for the same
    // reason.
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
          const s = Math.min(captured - 1, i) * CHANNEL_COUNT;
          const d = i * WAVE_STRIDE;
          // Scaled down for display: the capture spans ±24000, the scope is
          // drawn against a full scale of ~3000 (see WaveGrid) — the level
          // libkss's per-channel outputs sit at.
          for (let c = 0; c < CHANNEL_COUNT; c++) perCh[d + c] = src[s + c] >> 3;
        }
      }
    }
    return { left, right, perCh };
  }

  /** Pack the scanner's channel state into the int16 layout the views read. */
  private encodeChannels(): { nsf: Int16Array; keyOns: number } {
    const out = new Int16Array(CHANNEL_COUNT * NSF_CH_FIELDS);
    const grid = Math.max(1, Math.round(this.framesPerNtsc));
    let keyOns = 0;

    for (let c = 0; c < CHANNEL_COUNT; c++) {
      const s = this.scanner.getChannelStatus(c);
      const o = c * NSF_CH_FIELDS;

      if (s.keyOnCount !== this.lastKeyOn[c]) {
        this.lastKeyOn[c] = s.keyOnCount;
        this.keyKeepFrames[c] = 0;
        if (s.active) keyOns++;
      } else {
        this.keyKeepFrames[c] = Math.min(0x7fff, this.keyKeepFrames[c] + grid);
      }

      const vol = s.active ? Math.max(1, Math.round(s.level * 15)) : 0;

      let kcode = -1;
      if (s.active && vol > 0) {
        if (s.note != null) {
          const k = Math.round(s.note) + KCODE_FROM_MIDI;
          if (k >= 0 && k < 96) kcode = k;
        } else if (c === CH_NOISE) {
          // The noise generator has no pitch, only one of sixteen periods. It is
          // laid out on the roll one semitone per period step, which is how the
          // PSG noise channel is already shown (see createPSGStatus) — the
          // register value, not a frequency.
          kcode = 95 - s.period * 2;
        }
        // The DMC gets no position: it plays whatever sample the driver points
        // it at, and inventing a pitch for that would be a fiction.
      }

      let vnum: number;
      let flags = s.active ? NSF_FLAG_ACTIVE : 0;
      switch (c) {
        case CH_TRIANGLE:
          vnum = 4;
          break;
        case CH_NOISE:
          vnum = 5 + (s.detail & 1);
          if (s.detail & 1) flags |= NSF_FLAG_SHORT;
          break;
        case CH_DMC:
          // Coloured by which sample is playing, so a drum pattern reads as a
          // pattern rather than as one flat colour.
          vnum = 8 + ((s.detail >> 6) & 7);
          break;
        case CH_VRC6_PULSE1:
        case CH_VRC6_PULSE2:
          // detail is the duty, or 8 for a channel driven as a bare DAC.
          vnum = s.detail & 0x0f;
          break;
        case CH_VRC6_SAW:
          vnum = 9;
          break;
        case CH_FDS: {
          const wave = this.scanner.fdsWave;
          // Same trick the SCC channels use: a cheap digest of the waveform, so
          // a voice change shows as a colour change.
          vnum = wave != null ? (wave[4] + wave[20]) & 0x0f : 0;
          if (s.detail > 0) flags |= NSF_FLAG_MOD;
          break;
        }
        default:
          vnum = s.detail & 3; // pulse duty
          break;
      }

      out[o + F_KCODE] = kcode;
      out[o + F_VOL] = vol;
      out[o + F_KEYKEEP] = this.keyKeepFrames[c];
      out[o + F_VNUM] = vnum;
      out[o + F_FLAGS] = flags;
      // The DMC's timer index says little; which sample it is playing says a
      // lot, so that register value takes the slot instead.
      out[o + F_PERIOD] = c === CH_DMC ? (s.detail >> 6) & 0xff : Math.min(0x7fff, s.period);
    }

    return { nsf: out, keyOns };
  }

  /** The FDS wavetable as signed bytes for the waveform display. */
  private encodeFdsWave(): Uint8Array | null {
    const wave = this.scanner.fdsWave;
    if (wave == null) return null;
    const out = new Uint8Array(wave.length);
    // Six bits unsigned around a centre of 32, drawn as signed bytes.
    for (let i = 0; i < wave.length; i++) out[i] = ((wave[i] - 32) * 4) & 0xff;
    return out;
  }

  /**
   * Advance the scanner to `targetFrame`, capturing one channel snapshot per
   * NTSC frame and a state keyframe every KEYFRAME_SECONDS. `maxFrames` caps the
   * work done in one call so the first audio chunks after a track change aren't
   * held up by a full look-ahead scan.
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
        this.keyframes.push({ frame: this.scannerFrames, state: this.scanner.saveState() });
      }

      const { nsf, keyOns } = this.encodeChannels();
      this.pending.push({
        frame: this.scannerFrames,
        nsf,
        nsfWave: this.encodeFdsWave(),
        keyOns,
      });
      this.trackSilence(nsf, grid);

      const step = Math.max(1, Math.round(grid));
      this.scanner.skip(step);
      this.scannerFrames += step;
    }
  }

  /**
   * Watch for the point where the music stops.
   *
   * The scanner produces no audio - it fast-forwards - so silence is judged from
   * the channel levels it has just encoded, which is the same thing the meters
   * show. Once found, the audible player's fade is moved to land there.
   */
  private trackSilence(nsf: Int16Array, grid: number): void {
    if (this.endDetected || !this.silenceDetection) return;

    let sounding = false;
    for (let c = 0; c < CHANNEL_COUNT; c++) {
      if (nsf[c * NSF_CH_FIELDS + 1] > 0) {
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
    // A sound effect can be over inside a tenth of a second, so any sound at all
    // arms the detector; what has never sounded gets the longer benefit of the
    // doubt.
    const window = this.heardAudio ? SILENCE_SECONDS : EMPTY_TRACK_SECONDS;
    if (this.silentRun < window * this.sampleRate) return;

    const stopped = Math.max(0, this.scannerFrames - this.silentRun);
    // A file whose own metadata already ends sooner keeps its own length.
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
  takeSnapshots(): NSFSnapshot[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  /**
   * Latest keyframe at or before `frame`.
   *
   * `slack` asks for one far enough back that the caller has room to run: the
   * audible engine settles its analogue filters over the samples it fast-forwards
   * through, and a seek landing squarely on a keyframe would give it none, which
   * is heard as a thump as the high passes recharge.
   */
  private nearestKeyframe(frame: number, slack = 0): NSFKeyframe | null {
    let best: NSFKeyframe | null = null;
    let previous: NSFKeyframe | null = null;
    for (const k of this.keyframes) {
      if (k.frame > frame) break;
      previous = best;
      best = k;
    }
    if (best != null && frame - best.frame < slack && previous != null) return previous;
    return best;
  }

  /**
   * Move the audible engine to `frame`, restoring the nearest earlier keyframe
   * and fast-forwarding the remainder. Exact: a restored state reproduces the
   * same samples as continuous playback.
   */
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
