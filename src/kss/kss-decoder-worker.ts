import { KSS, KSSPlay } from "libkss-js";
import { AudioDecoderWorker } from "webaudio-stream-player";
import { KSSChannelMask } from "./kss-device";
import { SPCEngine, isSPCFile } from "../spc/spc-engine";

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
  /** SPC mode only: 8 voices x SPC_VOICE_FIELDS int16s. */
  spc?: Int16Array | null;
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
/** Short ramp applied to the first samples of every (re)start so a track that
 *  opens on a non-zero sample doesn't click at the transition. Kept as short as
 *  short (~5ms) so it removes the DC step without audibly softening the
 *  attack of the track's first note. */
const FADE_IN_SEC = 0.005;

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
          if (d.waveEnabled != null) {
            this._waveEnabled = d.waveEnabled;
            this._spc?.setWaveEnabled(d.waveEnabled);
          }
          return;
        case "setChannelMask":
          // live channel mute: apply to BOTH engines so keyframes stay consistent
          this._channelMask = d.mask;
          this._applyChannelMask(this._player);
          this._applyChannelMask(this._keyframer);
          this._spc?.setVoiceMask(this._channelMask.spc ?? 0);
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
  /** Non-null while an .spc track is loaded; the KSS engines idle in that case. */
  private _spc: SPCEngine | null = null;
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
  // Canonical keyframes captured from the AUDIBLE player during real synthesis
  // (calc), keyed by 2s-grid index. Unlike the keyframer's states (built with
  // calcSilent, so device DSP internals like envelopes can be stale), these have
  // fully-synthesised internal state, so a seek into an already-heard region can
  // restore an accurate state. Only populated up to the play head.
  private _playerKeyframes = new Map<number, Keyframe>();
  private _nextPlayerKeyframeFrame = 0; // next player capture frame
  private _bufferedHWM = 0; // furthest keyframer position (drives the seek buffer bar)
  private _endFrame = 0; // actual total length (intro + loops + fade), 0 until the keyframer finds it
  // whether _endFrame ends on a fade-out (loop cut-off / duration cap) rather
  // than a natural stop (stop flag). Only fade-out ends get the anchored fade.
  private _endIsFadeOut = false;

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
  private _waveEnabled = false; // when true, also emit per-channel waveform data
  private _fadeInRemaining = 0; // samples of start-fade left to apply
  // current per-device channel mute mask; applied to both engines and re-applied
  // after every loadState/reset so a keyframe's mask never overrides the live one
  private _channelMask: KSSChannelMask = { psg: 0, scc: 0, opll: 0, opl: 0, spc: 0 };

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
    // ramp the first few ms of output up from zero so the track (or seek target)
    // doesn't begin on a click
    this._fadeInRemaining = Math.floor(this.sampleRate * FADE_IN_SEC);

    this._fadeDuration = args.fadeDuration ?? defaultFadeDuration;
    this._duration =
      args.duration ?? (args.defaultDuration ?? defaultDuration) - this._fadeDuration;
    this._maxLoop = args.loop ?? defaultLoop;
    this._hasDebugMarker = args.debug ?? false;

    const startFrame = Math.max(0, args.startFrame ?? 0);
    this._playhead = startFrame;

    const u8raw =
      args.data instanceof Uint8Array
        ? args.data
        : args.data instanceof ArrayBuffer
          ? new Uint8Array(args.data)
          : null;

    // SPC takes over the whole decoder: the KSS engines stay loaded but idle,
    // and every message this worker posts describes the SPC machine instead.
    //
    // The dispatch has to live here rather than in a worker of its own: the
    // player builds its decoder once and recycles it, so the worker is chosen
    // before any track — and therefore any format — is known.
    if (u8raw != null && isSPCFile(u8raw)) {
      await this._startSPC(u8raw, args, startFrame);
      return;
    }
    if (this._spc != null) {
      this._spc.dispose();
      this._spc = null;
    }

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
        spc: args.channelMask?.spc ?? 0,
      };

      this._configureEngine(this._player!, args);
      this._configureEngine(this._keyframer!, args);
      this._loadedToken = args.songToken ?? -1;
      this._keyframes = [];
      this._playerKeyframes.clear();
      this._playerFrames = 0;
      this._keyframerFrames = 0;
      this._bufferedHWM = 0;
      this._endFrame = 0;
      this._endIsFadeOut = false;
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
      this._nextPlayerKeyframeFrame = this._playerFrames;
      this._captureKeyframe();

      if (startFrame > this._playerFrames) {
        await this._seekPlayerTo(startFrame);
      }
      if (this._keyframerFrames < startFrame) this._seekKeyframerTo(startFrame);
    }

    this._postBuffered();
  }

  /** Start (or seek within) an .spc track. */
  private async _startSPC(
    u8: Uint8Array,
    args: KSSDecoderStartOptions,
    startFrame: number
  ): Promise<void> {
    const inSong =
      args.seek === true &&
      args.songToken != null &&
      args.songToken === this._loadedToken &&
      this._spc != null;

    if (!inSong) {
      this._spc?.dispose();
      this._spc = new SPCEngine(this.sampleRate);
      this._spc.setWaveEnabled(this._waveEnabled);
      this._channelMask = {
        psg: args.channelMask?.psg ?? 0,
        scc: args.channelMask?.scc ?? 0,
        opll: args.channelMask?.opll ?? 0,
        opl: args.channelMask?.opl ?? 0,
        spc: args.channelMask?.spc ?? 0,
      };
      this._spc.setVoiceMask(this._channelMask.spc);
      this._spc.load(u8, {
        // m3disp's own defaults only apply when the tags say nothing.
        defaultPlaySeconds: (args.defaultDuration ?? defaultDuration) / 1000,
        loopCount: args.loop ?? defaultLoop,
      });
      this._loadedToken = args.songToken ?? -1;
      this._bufferedHWM = 0;
      this._endFrame = 0;
      this._endIsFadeOut = false;
      // SPC length comes from the ID666/xid6 tags and is known up front, so the
      // seek bar gets its true total immediately rather than after a scan.
      this._reportDuration(this._spc.totalFrames, false);
    }

    const spc = this._spc!;
    if (startFrame > 0 || inSong) {
      spc.seekAudibleTo(startFrame);
      if (spc.scannerFrames < startFrame) spc.seekScannerTo(startFrame);
    }
    this._bufferedHWM = Math.max(this._bufferedHWM, spc.bufferedFrame);
    this._postBuffered();
  }

  /** Decode one chunk of the loaded .spc, feeding the look-ahead as it goes. */
  private async _processSPC(): Promise<Array<Int16Array> | null> {
    const spc = this._spc;
    if (spc == null) return null;

    if (spc.totalFrames > 0 && spc.audibleFrames >= spc.totalFrames) return null;

    // Same decode-ahead throttle as the KSS path: while the buffer is full,
    // spend the time extending the look-ahead instead of sleeping.
    const limit = (this._lookaheadMs / 1000) * this.sampleRate;
    let waits = 0;
    while (
      !this._aborted &&
      this._playhead > 0 &&
      spc.audibleFrames - this._playhead > limit &&
      waits < 200
    ) {
      spc.advanceScanner(spc.scannerFrames + this.sampleRate);
      this._flushSPCSnapshots();
      await sleep(15);
      waits++;
    }
    if (this._aborted || this._spc == null) return null;

    let step = Math.floor(this.sampleRate / 8);
    if (spc.totalFrames > 0) step = Math.min(step, spc.totalFrames - spc.audibleFrames);
    if (step <= 0) return null;

    const { left, right, perCh } = spc.render(step);
    const chunkStart = spc.audibleFrames - step;

    const primed =
      spc.audibleFrames - this._playhead >= (this._lookaheadMs / 1000) * this.sampleRate;
    spc.advanceScanner(
      this._playhead + SCAN_AHEAD_SECONDS * this.sampleRate,
      primed ? Infinity : this.sampleRate
    );
    this._flushSPCSnapshots();

    if (perCh != null) {
      this.worker.postMessage(
        { type: "wave", frame: chunkStart, data: perCh, token: this._loadedToken },
        [perCh.buffer]
      );
    }

    return [left, right];
  }

  /** Post whatever voice snapshots the scanner produced, and the buffer mark. */
  private _flushSPCSnapshots(): void {
    const spc = this._spc;
    if (spc == null) return;
    const snapshots = spc.takeSnapshots();
    if (snapshots.length > 0) {
      this.worker.postMessage({ type: "snapshots", data: snapshots, token: this._loadedToken });
    }
    if (spc.bufferedFrame > this._bufferedHWM) {
      this._bufferedHWM = spc.bufferedFrame;
      this._postBuffered();
    }
  }

  /** Restore the player to `target` (absolute frame) from the nearest keyframe
   *  at/below it, then fast-forward the remainder. */
  private async _seekPlayerTo(target: number): Promise<void> {
    const player = this._player!;
    // Prefer the player's own canonical state when it is at least as close as the
    // keyframer's: player states were built with real synthesis (accurate device
    // internals), the keyframer's with calcSilent (envelopes etc. can be stale).
    const kk = this._nearestKeyframe(target);
    const pk = this._nearestPlayerKeyframe(target);
    // Use the canonical (player) state as long as it's within one grid step of
    // the keyframer's nearest — i.e. the target is in an already-heard region so
    // the player has coverage. The few extra fast-forwarded frames cost nothing
    // next to loading a state with accurate (not stale) device internals. Only
    // fall back to the keyframer when it is clearly closer (unheard / forward).
    const kf = pk != null && (kk == null || pk.frame + this._keyframeFrames >= kk.frame) ? pk : kk;
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
    // Resume canonical capture at the next grid boundary. The span just fast-
    // forwarded used calcSilent (provisional), so don't capture the landing frame.
    this._nextPlayerKeyframeFrame =
      (Math.floor(this._playerFrames / this._keyframeFrames) + 1) * this._keyframeFrames;
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

  /** Nearest canonical (player-captured) keyframe with frame <= target, or null. */
  private _nearestPlayerKeyframe(target: number): Keyframe | null {
    let best: Keyframe | null = null;
    for (const kf of this._playerKeyframes.values()) {
      if (kf.frame <= target && (best == null || kf.frame > best.frame)) best = kf;
    }
    return best;
  }

  /** Capture the audible player's canonical state at its current position, keyed
   *  by the 2s grid cell (so re-crossing a cell after a rewind just refreshes it).
   *  Called from process() during real synthesis only — never during a calcSilent
   *  fast-forward, so a provisional state can't overwrite a canonical one. */
  private _capturePlayerKeyframe() {
    const g = Math.floor(this._playerFrames / this._keyframeFrames);
    this._playerKeyframes.set(g, { frame: this._playerFrames, data: this._player!.saveState() });
    this._nextPlayerKeyframeFrame = (g + 1) * this._keyframeFrames;
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
   *  keyframe frames are always reached exactly. `maxAdvanceFrames` caps how far
   *  a single call may progress, so the initial 13s look-ahead is spread over
   *  many calls instead of blocking the first audible chunk (slow devices). */
  private _advanceKeyframer(target: number, maxAdvanceFrames = Infinity): void {
    const kf = this._keyframer;
    if (kf == null) return;
    const step = Math.floor(this.sampleRate / 60);
    const fadeFrames = (this.sampleRate * this._fadeDuration) / 1000;
    const endLimit = (this.sampleRate * (this._duration + this._fadeDuration)) / 1000;
    // once the actual end is known, don't scan past it
    const scanLimit = this._endFrame > 0 ? this._endFrame : endLimit;
    const hardTarget = Math.min(target, this._keyframerFrames + maxAdvanceFrames, scanLimit);
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
      // A song can reach its loop count and set its stop flag on the very same
      // frame (it ends exactly at the loop point). Only treat this as a loop
      // cut-off (which fades over the following fadeFrames) when the driver has
      // NOT also stopped; otherwise fall through to the natural-stop path below,
      // which ends cleanly at the exact frame with no fade.
      if (this._endFrame === 0 && kf.getStopFlag() == 0 && kf.getLoopCount() >= this._maxLoop) {
        this._reportDuration(this._keyframerFrames + fadeFrames, true);
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
    // End of song: the driver stopped on its own (stop flag) or we hit the
    // duration cap (non-looping / silence). A natural stop ends cleanly with no
    // fade; only the duration cap fades out. The keyframer's current frame is
    // the total length.
    if (this._endFrame === 0 && (kf.getStopFlag() != 0 || this._keyframerFrames >= endLimit)) {
      const naturalStop = kf.getStopFlag() != 0;
      this._reportDuration(this._keyframerFrames, !naturalStop);
    }
    if (snapshots.length > 0) {
      this.worker.postMessage({ type: "snapshots", data: snapshots, token: this._loadedToken });
    }
    if (this._keyframerFrames > this._bufferedHWM) {
      this._bufferedHWM = this._keyframerFrames;
      this._postBuffered();
    }
  }

  /** Record and announce the actual total length (once). `isFadeOut` marks a
   *  loop cut-off / duration-cap end (audible player fades before it); a natural
   *  stop-flag end passes false and is played through to the exact frame. */
  private _reportDuration(frame: number, isFadeOut: boolean): void {
    this._endFrame = frame;
    this._endIsFadeOut = isFadeOut;
    this.worker.postMessage({ type: "duration", frame, token: this._loadedToken });
  }

  private _postBuffered(): void {
    this.worker.postMessage({ type: "buffered", frame: this._bufferedHWM });
  }

  async process(): Promise<Array<Int16Array> | null> {
    if (this._spc != null) return this._processSPC();

    const player = this._player;
    if (player == null) return null;

    // end-of-track handling
    if (player.getFadeFlag() == 2 || player.getStopFlag() != 0) {
      return null;
    }

    if (this._endFrame > 0) {
      // The keyframer has found the exact end. A loop cut-off / duration-cap end
      // fades out over the last fadeFrames; that fade is applied by position to
      // the decoded samples below, so it lands exactly on zero at _endFrame — no
      // chunk-timing click, and correct even when seeking into the fade region.
      // A natural stop-flag end plays through unfaded. Either way, stop at the
      // detected frame.
      if (this._playerFrames >= this._endFrame) {
        return null;
      }
    } else {
      // End not found yet (keyframer still catching up): fall back to the
      // driver's own time-based fade.
      const currentTimeInMs = (this._playerFrames / this.sampleRate) * 1000;
      if (player.getLoopCount() >= this._maxLoop || this._duration <= currentTimeInMs) {
        if (player.getFadeFlag() == 0) {
          player.fadeStart(this._fadeDuration);
        }
      }
      if (this._duration + this._fadeDuration <= currentTimeInMs) {
        return null;
      }
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

    // ~1/8s chunk keeps the buffer near the lookahead target. Decode the audible
    // chunk BEFORE advancing the keyframer so the first chunk after a track
    // change isn't delayed by the look-ahead scan (a slow-device glitch source).
    const step = Math.floor(this.sampleRate / 8);
    const chunkStart = this._playerFrames;
    // When the wave view is active, render the mixed audio AND the raw
    // per-channel outputs in one synthesis pass; otherwise just the mix.
    let res: Int16Array;
    let perCh: Int16Array | null = null;
    if (this._waveEnabled) {
      const r = player.calcWithPerCh(step);
      res = r.pcm;
      perCh = r.perCh;
    } else {
      res = player.calc(step);
    }
    this._playerFrames += step;

    // capture the player's canonical state at ~2s boundaries (real synthesis
    // only) so a later seek into this heard region restores an accurate state
    if (this._playerFrames >= this._nextPlayerKeyframeFrame) this._capturePlayerKeyframe();

    // ramp the first samples of a (re)start up from zero to avoid a click when
    // the track/seek target opens on a non-zero sample
    if (this._fadeInRemaining > 0) {
      const total = Math.floor(this.sampleRate * FADE_IN_SEC);
      for (let i = 0; i < res.length && this._fadeInRemaining > 0; i++, this._fadeInRemaining--) {
        res[i] = Math.round((res[i] * (total - this._fadeInRemaining)) / total);
      }
    }

    // position-based fade-out over the last fadeFrames before _endFrame (loop
    // cut-off / duration-cap ends). Scaling by the exact frame position — rather
    // than letting the driver run a timed fade — lands on zero precisely at
    // _endFrame regardless of chunk timing, and stays correct when seeking into
    // the fade region (the level matches the position instead of restarting).
    if (this._endIsFadeOut && this._endFrame > 0) {
      const fadeFrames = (this.sampleRate * this._fadeDuration) / 1000;
      const fadeStart = this._endFrame - fadeFrames;
      const chunkStart = this._playerFrames - res.length;
      if (chunkStart + res.length > fadeStart) {
        for (let i = 0; i < res.length; i++) {
          const f = chunkStart + i;
          if (f >= fadeStart) {
            const g = (this._endFrame - f) / fadeFrames;
            res[i] = g > 0 ? Math.round(res[i] * g) : 0;
          }
        }
      }
    }

    // then feed the piano-roll / score look-ahead ahead of the play head. Cap it
    // to ~1s per call only while the audio buffer is still filling, so the first
    // chunks after a (re)start aren't blocked by the 13s scan on a slow device;
    // once the buffer is primed, let it build the full look-ahead at once again.
    const primed = this._playerFrames - this._playhead >= (this._lookaheadMs / 1000) * this.sampleRate;
    this._advanceKeyframer(
      this._playhead + SCAN_AHEAD_SECONDS * this.sampleRate,
      primed ? Infinity : this.sampleRate
    );

    // hand the raw per-channel window (this chunk) to the main thread, keyed by
    // its absolute start frame; transferred so it's zero-copy. The main keeps a
    // frame-indexed ring the wave view reads at the (latency-corrected) playhead.
    if (perCh != null) {
      this.worker.postMessage(
        { type: "wave", frame: chunkStart, data: perCh, token: this._loadedToken },
        [perCh.buffer]
      );
    }

    // KSS is mono; the player runs stereo for the SPC path's sake. Both channel
    // buffers are transferred to the renderer, so they must be distinct objects.
    return [res, res.slice()];
  }

  async abort(): Promise<void> {
    this._aborted = true;
  }

  async dispose(): Promise<void> {
    this._spc?.dispose();
    this._spc = null;
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
