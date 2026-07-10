import { AudioPlayer, AudioRendererType } from "webaudio-stream-player";
import { KSSDecoderStartOptions, type KSSDecoderDeviceSnapshot } from "./kss-decoder-worker";

import workletUrl from "./renderer-worklet.ts?worker&url";
import {
  getChannelStatus,
  ChannelId,
  ChannelStatus,
  getChannelStatusArray,
} from "./channel-status";

const NTSC_FRAME = 735; // 1/60 s @ 44100

export class KSSPlayer extends AudioPlayer {
  constructor(rendererType: AudioRendererType) {
    super({
      rendererType: rendererType,
      decoderWorkerFactory: () => {
        const w = new Worker(new URL("./kss-decoder-worker.ts", import.meta.url), {
          type: "module",
        });
        this._decoderWorker = w;
        w.postMessage({ type: "config", lookaheadMs: this._lookaheadMs });
        return w;
      },
      rendererWorkletUrl: workletUrl,
      rendererWorkletName: "renderer",
      recycleDecoder: true,
      numberOfChannels: 1,
    });

    this.addEventListener("decodermessage", (ev: CustomEvent) => {
      const detail = ev.detail;
      if (detail.type == "snapshots") {
        // drop snapshots stamped with a stale token (in-flight from a previous track)
        if (detail.token != null && detail.token !== this._currentToken) return;
        const snapshots = detail.data as Array<KSSDecoderDeviceSnapshot>;
        for (let i = 0; i < snapshots.length; i++) {
          const snapshot = snapshots[i];
          const index = Math.floor(snapshot.frame / NTSC_FRAME);
          this._lastIndex = index;
          this._snapshots[index] = snapshot;
        }
      } else if (detail.type == "buffered") {
        this._buffered = detail.frame | 0;
      } else if (detail.type == "seeking") {
        this.dispatchEvent(
          new CustomEvent("seekprogress", { detail: detail.done ? null : detail.ratio })
        );
      }
    });

    // Feed the (absolute) play head to the decoder so it can bound its
    // decode-ahead; the renderer reports frames relative to the stream start.
    this.addEventListener("progress", (ev: CustomEvent) => {
      const p = ev.detail;
      this._decoderWorker?.postMessage({
        type: "playhead",
        frame: this.baseFrame + (p?.renderer?.currentFrame ?? 0),
      });
    });
  }

  _lastIndex = -1;
  _snapshots: KSSDecoderDeviceSnapshot[] = [];

  outputLatencyOverride: number | null = null;

  private _decoderWorker: Worker | null = null;
  private _lookaheadMs = 500;

  // absolute song frame the current decode stream starts at (nonzero after seek)
  baseFrame = 0;
  // absolute song frame the keyframer has pre-synthesised to (instant-seek range)
  private _buffered = 0;
  // token identifying the loaded track; a seek reuses it, a fresh track bumps it
  private _currentToken = 0;

  private _lastArgs: KSSDecoderStartOptions | null = null;
  private _pendingArgs: KSSDecoderStartOptions | null = null;
  private _busy = false;

  get seekBaseFrame(): number {
    return this.baseFrame;
  }
  /** Absolute frame up to which a forward seek is (near-)instant. */
  get bufferedFrame(): number {
    return this._buffered;
  }

  /** Serialize play()/seek() so a burst of seeks collapses to the latest target
   *  (two overlapping start()s on a recycled decoder would corrupt it). */
  private async _runPlay(args: KSSDecoderStartOptions): Promise<void> {
    this._pendingArgs = args;
    if (this._busy) return;
    this._busy = true;
    try {
      while (this._pendingArgs) {
        const a = this._pendingArgs;
        this._pendingArgs = null;
        this.baseFrame = Math.max(0, a.startFrame ?? 0);
        if (a.songToken != null) this._currentToken = a.songToken;
        // Fresh track: drop the previous voices and reset the buffer bar. On an
        // in-song seek keep them (clearing mid-seek would blank the piano roll).
        if (!a.seek) {
          this._snapshots = [];
          this._buffered = this.baseFrame;
        }
        await super.play(a);
      }
    } finally {
      this._busy = false;
    }
  }

  override async play(args: KSSDecoderStartOptions) {
    this._currentToken += 1;
    const a: KSSDecoderStartOptions = {
      ...args,
      songToken: this._currentToken,
      seek: false,
      startFrame: 0,
    };
    this._lastArgs = a;
    await this._runPlay(a);
  }

  /** Seek within the current track by re-decoding from the target using the
   *  nearest keyframe (near-instant within the buffered range). */
  async seek(sec: number): Promise<void> {
    if (this._lastArgs == null) return;
    const rate = this.audioContext?.sampleRate ?? 44100;
    const startFrame = Math.max(0, Math.round(sec * rate));
    await this._runPlay({
      ...this._lastArgs,
      startFrame,
      seek: true,
      songToken: this._currentToken,
    });
  }

  override async abort() {
    this._snapshots = [];
    await super.abort();
  }

  /** Voice state at a given output frame (relative to the stream start). The
   *  snapshots are keyed by absolute song frame, so add baseFrame. */
  findSnapshotAt(frame: number): KSSDecoderDeviceSnapshot | undefined {
    const latency = this.outputLatencyOverride ?? this.outputLatency;
    const latencyInFrame = (this.audioContext?.sampleRate ?? 0) * latency;
    const abs = this.baseFrame + frame - latencyInFrame;
    const ntscFrame = Math.floor(Math.max(0, abs) / NTSC_FRAME);
    return this._snapshots[ntscFrame];
  }

  getChannelStatus(id: ChannelId): ChannelStatus | null {
    return getChannelStatus(this, id);
  }

  getChannelStatusArray(
    id: ChannelId,
    pastSpanInFrames: number,
    futureSpanInFrames: number
  ): (ChannelStatus | null)[] {
    return getChannelStatusArray(this, id, pastSpanInFrames, futureSpanInFrames);
  }
}
