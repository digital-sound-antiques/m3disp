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
};

export type KSSDecoderDeviceSnapshot = {
  frame: number;
  psg?: Uint8Array | null;
  scc?: Uint8Array | null;
  opll?: Uint8Array | null;
  opl?: Uint8Array | null;
  opllkeyKeepFrames?: ArrayLike<number> | null;
  wave: number;
};

const defaultDuration = 60 * 1000 * 5;
const defaultFadeDuration = 5 * 1000;
const defaultLoop = 2;

class KSSDecoderWorker extends AudioDecoderWorker {
  constructor(worker: Worker) {
    super(worker);
  }

  private _kss: KSS | null = null;
  private _kssplay: KSSPlay | null = null;



  private _duration = 60 * 1000 * 5;
  private _fadeDuration = 5 * 1000;
  private _decodeFrames = 0;
  private _maxLoop = 2;
  private _hasDebugMarker = false;

  async init(args: any): Promise<void> {
    await KSSPlay.initialize();
  }

  async start(args: KSSDecoderStartOptions): Promise<void> {
    if (args.data instanceof Uint8Array) {
      this._kss = new KSS(args.data, args.label ?? "");
    } else if (args.data instanceof ArrayBuffer) {
      const u8a = new Uint8Array(args.data);
      this._kss = new KSS(u8a, args.label ?? "");
    } else {
      throw new Error(`Invalid data type=${typeof args.data}`);
    }

    if (this._kssplay != null) {
      this._kssplay.release();
    }
    this._kssplay = new KSSPlay(this.sampleRate);

    this._kssplay.setData(this._kss);
    this._kssplay.setDeviceQuality({ psg: 1, opll: 1, scc: 0, opl: 1 });
    this._kssplay.reset(args.song ?? 0, args.cpu ?? 0);
    if (args.rcf != null) {
      this._kssplay.setRCF(args.rcf.resistor, args.rcf.capacitor);
    } else {
      this._kssplay.setRCF(0, 0);
    }

    this._kssplay.setChannelMask("psg", args.channelMask?.psg ?? 0);
    this._kssplay.setChannelMask("scc", args.channelMask?.scc ?? 0);
    this._kssplay.setChannelMask("opll", args.channelMask?.opll ?? 0);
    this._kssplay.setChannelMask("opl", args.channelMask?.opl ?? 0);
    this._kssplay.setSilentLimit(15 * 1000);

    this._fadeDuration = args.fadeDuration ?? defaultFadeDuration;
    this._duration = (args.duration ?? defaultDuration);
    this._hasDebugMarker = args.debug ?? false;
    this._maxLoop = args.loop ?? defaultLoop;
    this._decodeFrames = 0;

    this._kssplay.setIOWriteHandler(this._ioWriteHandler);
  }

  _opllAdr = 0xff;

  // Hints[i] == true if key-off is detected;
  // Hints[9]: BD
  // Hints[10]: SD
  // Hints[11]: TOM
  // Hints[12]: CYM
  // Hints[13]: HH
  _opllKeyStatus: boolean[] = [];
  _opllKeyEdgeHints: boolean[] = [];
  _opllKeyKeepFrames: number[] = [];

  _ioWriteHandler = (_: any, a: number, d: number) => {
    if (a == 0x7c) {
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

  _skipToDebugMarker() {
    if (this._kssplay == null) return;

    const interval = Math.floor(this.sampleRate / 60);
    const maxTick = (this.sampleRate * this._duration) / 1000;
    let tick = 0;
    while (tick <= maxTick) {
      this._kssplay!.calcSilent(interval);
      const jumpct = this._kssplay!.getMGSJumpCount();
      if (jumpct != 0) {
        break;
      }
      tick += interval;
    }
  }

  _updateKeyOnFrames(step: number) {
    for (let i = 0; i < 14; i++) {
      if (this._opllKeyEdgeHints[i]) {
        this._opllKeyKeepFrames[i] = 0;
      } else {
        this._opllKeyKeepFrames[i] += step;
      }
    }
    this._opllKeyEdgeHints = [];
  }

  async process(): Promise<Array<Int16Array> | null> {
    if (this._kssplay == null) return null;

    if (this._hasDebugMarker) {
      this._skipToDebugMarker();
    }

    if (this._kssplay.getFadeFlag() == 2 || this._kssplay.getStopFlag() != 0) {
      return null;
    }

    const currentTimeInMs = (this._decodeFrames / this.sampleRate) * 1000;

    if (
      this._kssplay.getLoopCount() >= this._maxLoop ||
      this._duration <= currentTimeInMs
    ) {
      if (this._kssplay.getFadeFlag() == 0) {
        this._kssplay.fadeStart(this._fadeDuration);
      }
    }

    if ((this._duration + this._fadeDuration) < currentTimeInMs) {
      return null;
    }

    const step = Math.floor(this.sampleRate / 60);
    const res = new Int16Array(this.sampleRate);
    const snapshots: KSSDecoderDeviceSnapshot[] = [];

    for (let t = 0; t < res.length; t += step) {
      const buf = this._kssplay.calc(step);
      res.set(buf, t);
      const sum = buf.reduce((prev, curr) => prev + curr, 0);
      const wave = Math.round(sum / buf.length);
      this._updateKeyOnFrames(step);
      snapshots.push({
        frame: this._decodeFrames,
        psg: this._kssplay.readDeviceRegs("psg"),
        scc: this._kssplay.readDeviceRegs("scc"),
        opll: this._kssplay.readDeviceRegs("opll"),
        opllkeyKeepFrames: [...this._opllKeyKeepFrames],
        wave,
      });
      this._decodeFrames += step;
    }

    if (snapshots.length > 0) {
      this.worker.postMessage({ type: "snapshots", data: snapshots });
    }

    return [res];
  }

  async abort(): Promise<void> {
    this._kss?.release();
    this._kss = null;
  }

  async dispose(): Promise<void> {
    this._kssplay?.release();
    this._kssplay = null;
    this._kss?.release();
    this._kss = null;
  }
}

console.log("kss-decoder-worker");

/* `self as any` is workaround. See: [issue#20595](https://github.com/microsoft/TypeScript/issues/20595) */
const decoder = new KSSDecoderWorker(self as any);
