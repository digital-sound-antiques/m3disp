import { KSS, KSSPlay } from "libkss-js";
import { AudioDecoderWorker } from "webaudio-stream-player";
import { KSSChannelMask } from "./kss-device";

export type KSSDecoderStartOptions = {
  data: Uint8Array | ArrayBuffer | ArrayBufferLike | ArrayLike<number>;
  label?: string | null;
  song?: number | null;
  cpu?: number | null;
  duration?: number | null;
  fadeDuration?: number | null;
  defaultDuration?: number | null;
  rcf?: null | {
    resistor: number;
    capacitor: number;
  };
  debug?: boolean | null;
  loop?: number | null;
  channelMask?: KSSChannelMask;
  opllMask?: number | null;
  psgMask?: number | null;
  sccMask?: number | null;
  /** Absolute output frame to (re)start decoding at. Used for seek. */
  startFrame?: number | null;
  /** In-song seek: reuse the loaded engines (keyframe restore) instead of reloading. */
  seek?: boolean | null;
  /** Identifies the loaded track; a seek with a matching token reuses the engines. */
  songToken?: number | null;
};

export type KSSDecoderDeviceSnapshot = {
  frame: number;
  psg?: Uint8Array | null;
  psgKeyKeepFrames?: ArrayLike<number> | null;
  scc?: Uint8Array | null;
  sccKeyKeepFrames?: ArrayLike<number> | null;
  opll?: Uint8Array | null;
  opllKeyKeepFrames?: ArrayLike<number> | null;
};

const defaultDuration = 60 * 1000 * 5;
const defaultFadeDuration = 5 * 1000;
const defaultLoop = 2;

/** Keyframe (state snapshot) spacing. Snapshots are ~57KB each, so 2s keeps the
 *  memory for a full track modest while giving fine enough seek granularity. */
const KEYFRAME_SECONDS = 2;
/** How far ahead of the play head the keyframer keeps its device-register
 *  snapshots so the piano-roll / score look-ahead stays populated (the piano
 *  roll can show up to ~12s ahead at its widest range). */
const SCAN_AHEAD_SECONDS = 13;

type Keyframe = { frame: number; data: Uint8Array };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class KSSDecoderWorker extends AudioDecoderWorker {
  constructor(worker: Worker) {
    super(worker);
    // The base class owns worker.onmessage for its request protocol. Wrap it to
    // intercept our own control messages (play-head for decode-ahead throttling,
    // and config) before delegating.
    const baseOnMessage = worker.onmessage!.bind(worker);
    worker.onmessage = (e: MessageEvent) => {
      const d = e.data;
      switch (d?.type) {
        case "playhead":
          this._playhead = d.frame | 0;
          return;
        case "config":
          if (d.lookaheadMs != null) this._lookaheadMs = d.lookaheadMs;
          return;
        case "setChannelMask":
          // live channel mute: apply to BOTH engines so keyframes stay consistent
          this._channelMask = d.mask;
          this._applyChannelMask(this._player);
          this._applyChannelMask(this._keyframer);
          return;
        default:
          // The base abort awaits the in-flight process(); set our flag here so
          // the throttle/fast-forward loops break immediately.
          if (d?.type === "abort") this._aborted = true;
          baseOnMessage(e);
      }
    };
  }

  private _kss: KSS | null = null;
  // Audible engine, kept ~lookaheadMs ahead of the play head.
  private _player: KSSPlay | null = null;
  // State-save engine: runs ahead (calcSilent), captures keyframes every
  // KEYFRAME_SECONDS and posts device-register snapshots for the piano roll.
  private _keyframer: KSSPlay | null = null;

  private _playerFrames = 0; // absolute output frame the player has rendered to
  private _keyframerFrames = 0; // absolute output frame the keyframer has reached
  // keyframes in ascending frame order; each holds the exact VM state at .frame
  private _keyframes: Keyframe[] = [];
  private _originFrame = 0; // frame the keyframe schedule starts from (0, or post-debug-skip)
  private _nextKeyframeFrame = 0; // next scheduled capture frame
  private _bufferedHWM = 0; // furthest keyframer position (drives the seek buffer bar)
  private _endFrame = 0; // actual total length (intro + loops + fade), 0 until the keyframer finds it

  private _duration = defaultDuration;
  private _fadeDuration = defaultFadeDuration;
  private _maxLoop = defaultLoop;
  private _hasDebugMarker = false;
  private _song = 0;
  private _cpu = 0;
  private _loadedToken = -1;
  private _playhead = 0;
  private _lookaheadMs = 500;
  private _aborted = false;
  // current per-device channel mute mask; applied to both engines and re-applied
  // after every loadState/reset so a keyframe's mask never overrides the live one
  private _channelMask: KSSChannelMask = { psg: 0, scc: 0, opll: 0, opl: 0 };

  private get _keyframeFrames() {
    return KEYFRAME_SECONDS * this.sampleRate;
  }

  async init(_args: any): Promise<void> {
    await KSSPlay.initialize();
    this._player = new KSSPlay(this.sampleRate);
    this._keyframer = new KSSPlay(this.sampleRate);
    // Only the keyframer needs the write handlers: it runs ahead and owns the
    // device-register snapshots fed to the piano roll.
    this._keyframer.setIOWriteHandler(this._ioWriteHandler);
    this._keyframer.setMemWriteHandler(this._memWriteHandler);
  }

  /** Apply per-track config to both engines so their emulated state stays
   *  identical (a keyframe captured by one is restorable into the other). */
  private _configureEngine(kssplay: KSSPlay, args: KSSDecoderStartOptions) {
    kssplay.setData(this._kss!);
    kssplay.setDeviceQuality({ psg: 1, opll: 1, scc: 0, opl: 1 });
    kssplay.reset(args.song ?? 0, args.cpu ?? 0);
    if (args.rcf != null) {
      kssplay.setRCF(args.rcf.resistor, args.rcf.capacitor);
    } else {
      kssplay.setRCF(0, 0);
    }
    this._applyChannelMask(kssplay);
    kssplay.setSilentLimit(15 * 1000);
  }

  /** Apply the current channel mask to one engine (all four devices). */
  private _applyChannelMask(kssplay: KSSPlay | null) {
    if (kssplay == null) return;
    kssplay.setChannelMask("psg", this._channelMask.psg);
    kssplay.setChannelMask("scc", this._channelMask.scc);
    kssplay.setChannelMask("opll", this._channelMask.opll);
    kssplay.setChannelMask("opl", this._channelMask.opl);
  }

  async start(args: KSSDecoderStartOptions): Promise<void> {
    this._aborted = false;

    this._fadeDuration = args.fadeDuration ?? defaultFadeDuration;
    this._duration =
      args.duration ?? (args.defaultDuration ?? defaultDuration) - this._fadeDuration;
    this._maxLoop = args.loop ?? defaultLoop;
    this._hasDebugMarker = args.debug ?? false;

    const startFrame = Math.max(0, args.startFrame ?? 0);
    this._playhead = startFrame;

    const inSong =
      args.seek === true &&
      args.songToken != null &&
      args.songToken === this._loadedToken &&
      this._player != null;

    if (inSong) {
      // In-song seek: restore the player to the target from the nearest keyframe,
      // and make sure the keyframer stays ahead of the new play head.
      await this._seekPlayerTo(startFrame);
      if (this._keyframerFrames < startFrame) this._seekKeyframerTo(startFrame);
    } else {
      // Fresh track (or backward seek past all keyframes): reload both engines.
      let u8: Uint8Array;
      if (args.data instanceof Uint8Array) {
        u8 = args.data;
      } else if (args.data instanceof ArrayBuffer) {
        u8 = new Uint8Array(args.data);
      } else {
        throw new Error(`Invalid data type=${typeof args.data}`);
      }
      this._kss?.release();
      this._kss = new KSS(u8, args.label ?? "");
      this._song = args.song ?? 0;
      this._cpu = args.cpu ?? 0;
      this._channelMask = {
        psg: args.channelMask?.psg ?? 0,
        scc: args.channelMask?.scc ?? 0,
        opll: args.channelMask?.opll ?? 0,
        opl: args.channelMask?.opl ?? 0,
      };

      this._configureEngine(this._player!, args);
      this._configureEngine(this._keyframer!, args);
      this._loadedToken = args.songToken ?? -1;
      this._keyframes = [];
      this._playerFrames = 0;
      this._keyframerFrames = 0;
      this._bufferedHWM = 0;
      this._endFrame = 0;
      this._resetKeyState();

      if (this._hasDebugMarker) {
        const skipped = this._skipToDebugMarker(this._player!);
        this._playerFrames = skipped;
        this._keyframer!.calcSilent(skipped);
        this._keyframerFrames = skipped;
      }
      // seed the keyframe schedule at the (post-skip) origin so a rewind there is instant
      this._originFrame = this._keyframerFrames;
      this._nextKeyframeFrame = this._originFrame;
      this._captureKeyframe();

      if (startFrame > this._playerFrames) {
        await this._seekPlayerTo(startFrame);
      }
      if (this._keyframerFrames < startFrame) this._seekKeyframerTo(startFrame);
    }

    this._postBuffered();
  }

  /** Restore the player to `target` (absolute frame) from the nearest keyframe
   *  at/below it, then fast-forward the remainder. */
  private async _seekPlayerTo(target: number): Promise<void> {
    const player = this._player!;
    const kf = this._nearestKeyframe(target);
    if (kf != null) {
      player.loadState(kf.data);
      this._playerFrames = kf.frame;
    } else {
      player.reset(this._song, this._cpu);
      this._playerFrames = 0;
    }
    // keyframe carries the mask it was captured with; force the current one
    this._applyChannelMask(player);
    await this._fastForward(
      player,
      () => this._playerFrames,
      (f) => (this._playerFrames = f),
      target
    );
  }

  /** Move the keyframer to `target` (used when a forward seek jumps past the
   *  scanned region) so its look-ahead snapshots resume from the new position.
   *  Remaining catch-up runs incrementally in _advanceKeyframer(). */
  private _seekKeyframerTo(target: number) {
    const kf = this._nearestKeyframe(target);
    if (kf != null && kf.frame > this._keyframerFrames) {
      this._keyframer!.loadState(kf.data);
      this._keyframerFrames = kf.frame;
      this._nextKeyframeFrame = kf.frame + this._keyframeFrames;
      this._applyChannelMask(this._keyframer);
    } else if (kf == null) {
      this._keyframer!.reset(this._song, this._cpu);
      this._keyframerFrames = 0;
      this._originFrame = 0;
      this._nextKeyframeFrame = 0;
      this._resetKeyState();
      this._applyChannelMask(this._keyframer);
    }
  }

  /** Silently clock `kssplay` up to `target`, yielding between 1s chunks so a
   *  newer seek can interrupt, and posting progress for long (unbuffered) skips. */
  private async _fastForward(
    kssplay: KSSPlay,
    getFrame: () => number,
    setFrame: (f: number) => void,
    target: number
  ): Promise<void> {
    const from = getFrame();
    const span = Math.max(1, target - from);
    const t0 = performance.now();
    let reporting = false;
    const chunk = this.sampleRate;
    while (!this._aborted && getFrame() < target) {
      const before = getFrame();
      const n = Math.min(chunk, target - before);
      kssplay.calcSilent(n);
      setFrame(before + n);
      if (!reporting && performance.now() - t0 > 120) reporting = true;
      if (reporting) {
        this.worker.postMessage({
          type: "seeking",
          ratio: Math.min(1, (getFrame() - from) / span),
        });
      }
      await sleep(0);
    }
    if (reporting) this.worker.postMessage({ type: "seeking", done: true });
  }

  /** Nearest keyframe with frame <= target (keyframes are in ascending order). */
  private _nearestKeyframe(target: number): Keyframe | null {
    for (let i = this._keyframes.length - 1; i >= 0; i--) {
      if (this._keyframes[i].frame <= target) return this._keyframes[i];
    }
    return null;
  }

  /** Capture a keyframe at the keyframer's current (exact) position. Called only
   *  when _keyframerFrames === _nextKeyframeFrame. */
  private _captureKeyframe() {
    this._keyframes.push({ frame: this._keyframerFrames, data: this._keyframer!.saveState() });
  }

  _opllAdr = 0xff;
  _psgAdr = 0xff;

  _opllKeyStatus: boolean[] = [];
  _opllKeyEdgeHints: boolean[] = [];
  _opllKeyKeepFrames: number[] = [];

  _psgKeyStatus: boolean[] = [];
  _psgVolume: number[] = [0, 0, 0];
  _psgKeyEdgeHints: boolean[] = [];
  _psgKeyKeepFrames: number[] = [];

  _sccKeyStatus: boolean[] = [];
  _sccVolume: number[] = [0, 0, 0, 0, 0];
  _sccKeyEdgeHints: boolean[] = [];
  _sccKeyKeepFrames: number[] = [];
  _sccEnhancedMode = false;

  private _resetKeyState() {
    this._opllAdr = 0xff;
    this._psgAdr = 0xff;
    this._opllKeyStatus = [];
    this._opllKeyEdgeHints = [];
    this._opllKeyKeepFrames = [];
    this._psgKeyStatus = [];
    this._psgVolume = [0, 0, 0];
    this._psgKeyEdgeHints = [];
    this._psgKeyKeepFrames = [];
    this._sccKeyStatus = [];
    this._sccVolume = [0, 0, 0, 0, 0];
    this._sccKeyEdgeHints = [];
    this._sccKeyKeepFrames = [];
    this._sccEnhancedMode = false;
  }

  _memWriteHandler = (_: any, a: number, d: number) => {
    if (a == 0x9000) {
      if (d & 0x80) {
        this._sccEnhancedMode = true;
      } else {
        this._sccEnhancedMode = false;
      }
    } else {
      let ch, vol, newKeyStatus;
      if (this._sccEnhancedMode) {
        if (0xb8aa <= a && a <= 0xba8e) {
          ch = a - 0xb8aa;
          vol = d & 0xf;
          if (vol > this._sccVolume[ch] + 4) {
            newKeyStatus = false;
          }
          this._sccVolume[ch] = vol;
        }
      } else {
        if (0x98aa <= a && a <= 0x98ae) {
          ch = a - 0x98aa;
          vol = d & 0xf;
          if (vol > this._sccVolume[ch] + 4) {
            newKeyStatus = false;
          }
          this._sccVolume[ch] = vol;
        }
      }
      if (ch != null) {
        const k = newKeyStatus ?? vol != 0;
        if (this._sccKeyStatus[ch] != k) {
          this._sccKeyStatus[ch] = k;
          this._sccKeyEdgeHints[ch] = true;
        }
      }
    }
  };

  _ioWriteHandler = (_: any, a: number, d: number) => {
    if (a == 0xa0) {
      this._psgAdr = d;
    } else if (a == 0xa1) {
      if (8 <= this._psgAdr && this._psgAdr <= 10) {
        const ch = this._psgAdr - 8;
        const newKeyStatus = (d & 0x1f) != 0;
        if (this._psgKeyStatus[ch] != newKeyStatus) {
          this._psgKeyStatus[ch] = newKeyStatus;
          this._psgKeyEdgeHints[ch] = true;
        }
      }
    } else if (a == 0x7c) {
      this._opllAdr = d;
    } else if (a == 0x7d) {
      if (0x20 <= this._opllAdr && this._opllAdr <= 0x28) {
        const ch = this._opllAdr - 0x20;
        const newKeyStatus = (d & 0x10) != 0;
        if (newKeyStatus != this._opllKeyStatus[ch]) {
          this._opllKeyStatus[ch] = newKeyStatus;
          this._opllKeyEdgeHints[ch] = true;
        }
      }
      if (this._opllAdr == 0x0e) {
        for (let ch = 9; ch < 14; ch++) {
          let newKeyStatus = (d & 0x20) != 0;

          if (ch == 9) {
            newKeyStatus &&= (d & 0x10) != 0 || this._opllKeyStatus[6];
          }
          if (ch == 10) {
            newKeyStatus &&= (d & 0x8) != 0 || this._opllKeyStatus[7];
          }
          if (ch == 11) {
            newKeyStatus &&= (d & 0x4) == 0 || this._opllKeyStatus[8];
          }
          if (ch == 12) {
            newKeyStatus &&= (d & 0x2) == 0 || this._opllKeyStatus[8];
          }
          if (ch == 13) {
            newKeyStatus &&= (d & 0x1) == 0 || this._opllKeyStatus[7];
          }
          if (newKeyStatus != this._opllKeyStatus[ch]) {
            this._opllKeyStatus[ch] = newKeyStatus;
            this._opllKeyEdgeHints[ch] = true;
          }
        }
      }
    }
  };

  private _skipToDebugMarker(kssplay: KSSPlay): number {
    const interval = Math.floor(this.sampleRate / 60);
    const maxTick = (this.sampleRate * this._duration) / 1000;
    let tick = 0;
    while (tick <= maxTick) {
      kssplay.calcSilent(interval);
      tick += interval;
      if (kssplay.getMGSJumpCount() != 0) {
        break;
      }
    }
    return tick;
  }

  _updateKeyOnFrames(step: number) {
    for (let i = 0; i < 3; i++) {
      if (this._psgKeyEdgeHints[i]) {
        this._psgKeyKeepFrames[i] = 0;
      } else {
        this._psgKeyKeepFrames[i] += step;
      }
    }
    this._psgKeyEdgeHints = [];

    for (let i = 0; i < 5; i++) {
      if (this._sccKeyEdgeHints[i]) {
        this._sccKeyKeepFrames[i] = 0;
      } else {
        this._sccKeyKeepFrames[i] += step;
      }
    }
    this._sccKeyEdgeHints = [];

    for (let i = 0; i < 14; i++) {
      if (this._opllKeyEdgeHints[i]) {
        this._opllKeyKeepFrames[i] = 0;
      } else {
        this._opllKeyKeepFrames[i] += step;
      }
    }
    this._opllKeyEdgeHints = [];
  }

  /** Advance the keyframer up to `target`, capturing keyframes at
   *  KEYFRAME_SECONDS boundaries and posting device-register snapshots (one per
   *  NTSC frame). Bounded per call so it never starves the audio render. The
   *  NTSC step (sampleRate/60) evenly divides the 2s interval, so scheduled
   *  keyframe frames are always reached exactly. */
  private _advanceKeyframer(target: number): void {
    const kf = this._keyframer;
    if (kf == null) return;
    const step = Math.floor(this.sampleRate / 60);
    const fadeFrames = (this.sampleRate * this._fadeDuration) / 1000;
    const endLimit = (this.sampleRate * (this._duration + this._fadeDuration)) / 1000;
    // once the actual end is known, don't scan past it
    const scanLimit = this._endFrame > 0 ? this._endFrame : endLimit;
    const hardTarget = Math.min(target, scanLimit);
    const snapshots: KSSDecoderDeviceSnapshot[] = [];
    let guard = 0;
    while (
      !this._aborted &&
      this._keyframerFrames < hardTarget &&
      kf.getStopFlag() == 0 &&
      guard++ < 4096
    ) {
      kf.calcSilent(step);
      this._updateKeyOnFrames(step);
      this._keyframerFrames += step;
      // Determine the actual song length: the driver fades once it has looped
      // `maxLoop` times, ending fadeFrames later. (The audible player applies the
      // same policy; the keyframer just discovers the frame first.)
      if (this._endFrame === 0 && kf.getLoopCount() >= this._maxLoop) {
        this._reportDuration(this._keyframerFrames + fadeFrames);
      }
      snapshots.push({
        frame: this._keyframerFrames - step,
        psg: kf.readDeviceRegs("psg"),
        psgKeyKeepFrames: [...this._psgKeyKeepFrames],
        scc: kf.readDeviceRegs("scc"),
        sccKeyKeepFrames: [...this._sccKeyKeepFrames],
        opll: kf.readDeviceRegs("opll"),
        opllKeyKeepFrames: [...this._opllKeyKeepFrames],
      });
      if (this._keyframerFrames >= this._nextKeyframeFrame) {
        this._captureKeyframe();
        this._nextKeyframeFrame += this._keyframeFrames;
      }
    }
    // Natural end: the song stopped on its own, or reached the duration cap
    // (non-looping / silence). The keyframer's current frame is the total length.
    if (this._endFrame === 0 && (kf.getStopFlag() != 0 || this._keyframerFrames >= endLimit)) {
      this._reportDuration(this._keyframerFrames);
    }
    if (snapshots.length > 0) {
      this.worker.postMessage({ type: "snapshots", data: snapshots, token: this._loadedToken });
    }
    if (this._keyframerFrames > this._bufferedHWM) {
      this._bufferedHWM = this._keyframerFrames;
      this._postBuffered();
    }
  }

  /** Record and announce the actual total length (once). */
  private _reportDuration(frame: number): void {
    this._endFrame = frame;
    this.worker.postMessage({ type: "duration", frame, token: this._loadedToken });
  }

  private _postBuffered(): void {
    this.worker.postMessage({ type: "buffered", frame: this._bufferedHWM });
  }

  async process(): Promise<Array<Int16Array> | null> {
    const player = this._player;
    if (player == null) return null;

    // keep the piano-roll / score look-ahead fed ahead of the (small) audio buffer
    this._advanceKeyframer(this._playhead + SCAN_AHEAD_SECONDS * this.sampleRate);

    // end-of-track handling (mirrors the previous single-engine policy)
    if (player.getFadeFlag() == 2 || player.getStopFlag() != 0) {
      return null;
    }
    const currentTimeInMs = (this._playerFrames / this.sampleRate) * 1000;
    if (player.getLoopCount() >= this._maxLoop || this._duration <= currentTimeInMs) {
      if (player.getFadeFlag() == 0) {
        player.fadeStart(this._fadeDuration);
      }
    }
    if (this._duration + this._fadeDuration <= currentTimeInMs) {
      return null;
    }

    // Decode-ahead throttle: keep only ~lookaheadMs of audio ahead of the play
    // head. While throttled, spend the idle time extending the keyframer toward
    // the end of the track (so more of the timeline becomes instantly seekable)
    // instead of just sleeping.
    const limit = (this._lookaheadMs / 1000) * this.sampleRate;
    let waits = 0;
    while (
      !this._aborted &&
      this._playhead > 0 &&
      this._playerFrames - this._playhead > limit &&
      waits < 200
    ) {
      this._advanceKeyframer(this._keyframerFrames + this.sampleRate);
      await sleep(15);
      waits++;
    }
    if (this._aborted || this._player == null) return null;

    // ~1/8s chunk keeps the buffer near the lookahead target
    const step = Math.floor(this.sampleRate / 8);
    const res = player.calc(step);
    this._playerFrames += step;
    return [res];
  }

  async abort(): Promise<void> {
    this._aborted = true;
  }

  async dispose(): Promise<void> {
    this._player?.release();
    this._keyframer?.release();
    this._player = null;
    this._keyframer = null;
    this._kss?.release();
    this._kss = null;
    this._keyframes = [];
    this._loadedToken = -1;
  }
}

console.log("kss-decoder-worker");

/* `self as any` is workaround. See: [issue#20595](https://github.com/microsoft/TypeScript/issues/20595) */
new KSSDecoderWorker(self as any);
