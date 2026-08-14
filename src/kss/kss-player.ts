import { AudioPlayer, AudioRendererType } from "webaudio-stream-player";
import { KSSDecoderStartOptions, type KSSDecoderDeviceSnapshot } from "./kss-decoder-worker";
import { KSSChannelMask } from "./kss-device";

import workletUrl from "./renderer-worklet.ts?worker&url";
import {
  getChannelStatus,
  ChannelId,
  ChannelStatus,
  getChannelStatusArray,
} from "./channel-status";

const NTSC_FRAME = 735; // 1/60 s @ 44100
// int16 values per sample in the per-channel wave buffer (libkss PerChLayout.stride)
const WAVE_STRIDE = 44;

export class KSSPlayer extends AudioPlayer {
  constructor(rendererType: AudioRendererType) {
    super({
      rendererType: rendererType,
      decoderWorkerFactory: () => {
        const w = new Worker(new URL("./kss-decoder-worker.ts", import.meta.url), {
          type: "module",
        });
        this._decoderWorker = w;
        w.postMessage({ type: "config", lookaheadMs: this._lookaheadMs, waveEnabled: this._waveEnabled });
        return w;
      },
      rendererWorkletUrl: workletUrl,
      rendererWorkletName: "renderer",
      recycleDecoder: true,
      // Stereo throughout: the SPC path is natively stereo (per-voice L/R
      // volumes plus a stereo echo), and the channel count is baked into the
      // renderer at construction, so it can't be swapped per track. KSS is mono
      // and simply duplicates its output into both channels.
      numberOfChannels: 2,
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
      } else if (detail.type == "wave") {
        if (detail.token == null || detail.token === this._currentToken) {
          this._writeWave(detail.frame | 0, detail.data as Int16Array);
        }
      } else if (detail.type == "buffered") {
        this._buffered = detail.frame | 0;
      } else if (detail.type == "duration") {
        if (detail.token == null || detail.token === this._currentToken) {
          this._totalFrame = detail.frame | 0;
        }
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

  // Per-channel raw waveform ring (only populated while the wave view is on).
  // Interleaved int16, WAVE_STRIDE values per sample (see libkss PerChLayout),
  // indexed circularly by absolute song frame.
  _waveEnabled = false;
  _waveRing: Int16Array | null = null;
  _waveRingSamples = 0; // ring capacity in samples
  _waveEnd = 0; // absolute frame just past the newest written sample

  outputLatencyOverride: number | null = null;

  private _decoderWorker: Worker | null = null;
  private _lookaheadMs = 500;

  // absolute song frame the current decode stream starts at (nonzero after seek)
  baseFrame = 0;
  // absolute song frame the keyframer has pre-synthesised to (instant-seek range)
  private _buffered = 0;
  // actual total length in frames (intro + loops + fade), 0 until the worker reports it
  private _totalFrame = 0;
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
  /** Actual total length in frames (0 until the worker has found the loop/end). */
  get totalFrame(): number {
    return this._totalFrame;
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
          this._totalFrame = 0;
          // drop stale per-channel wave data from the previous track
          this._waveRing = null;
          this._waveRingSamples = 0;
          this._waveEnd = 0;
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
    let startFrame = Math.max(0, Math.round(sec * rate));
    if (this._totalFrame > 0) {
      startFrame = Math.min(startFrame, this._totalFrame);
    } else if (startFrame > this._buffered) {
      // The real length is not known yet: a target beyond the scanned region
      // may lie past the actual end of the track, where the decoder would kill
      // playback the moment the end is discovered. Treat such a seek as invalid.
      return;
    }
    await this._runPlay({
      ...this._lastArgs,
      startFrame,
      seek: true,
      songToken: this._currentToken,
    });
  }

  override async abort() {
    // Reset the seek origin BEFORE super.abort(): the final (empty) progress
    // event it dispatches resolves the play position as baseFrame + 0, which
    // must read 0:00 — otherwise the time display sticks at the last seek
    // target (e.g. after seeking past the not-yet-measured end of a track).
    this.baseFrame = 0;
    await super.abort();
  }

  /** Apply a channel mute mask to the running decoder live (no re-decode). */
  setChannelMask(mask: KSSChannelMask): void {
    this._decoderWorker?.postMessage({ type: "setChannelMask", mask });
  }

  /** Turn per-channel waveform capture on/off in the decoder (only worth the
   *  extra synthesis while the wave view is visible). */
  setWaveEnabled(enabled: boolean): void {
    if (this._waveEnabled === enabled) return;
    this._waveEnabled = enabled;
    this._decoderWorker?.postMessage({ type: "config", waveEnabled: enabled });
    if (!enabled) {
      this._waveRing = null;
      this._waveRingSamples = 0;
      this._waveEnd = 0;
    }
  }

  /** Store a decoded per-channel chunk into the circular ring (keyed by frame). */
  private _writeWave(frame: number, data: Int16Array): void {
    const samples = (data.length / WAVE_STRIDE) | 0;
    if (samples <= 0) return;
    if (this._waveRing == null) {
      const rate = this.audioContext?.sampleRate ?? 44100;
      this._waveRingSamples = Math.ceil(rate * 1.5);
      this._waveRing = new Int16Array(this._waveRingSamples * WAVE_STRIDE);
    }
    const ring = this._waveRing;
    const cap = this._waveRingSamples;
    for (let i = 0; i < samples; i++) {
      const dst = ((frame + i) % cap) * WAVE_STRIDE;
      const src = i * WAVE_STRIDE;
      for (let k = 0; k < WAVE_STRIDE; k++) ring[dst + k] = data[src + k];
    }
    this._waveEnd = frame + samples;
  }

  /**
   * Read the per-channel window of `samples` ending at absolute frame `endFrame`
   * into `out` (length samples*WAVE_STRIDE, interleaved). Frames outside the
   * retained ring are left as 0. Returns false if no wave data is available.
   */
  /**
   * Read one channel's waveform window (its int16 at `offset` within each
   * sample, see libkss PerChLayout) of `samples` ending at `endFrame`, adding
   * into `out` (so callers can sum several channels of a merged cell). Frames
   * outside the ring contribute 0. Returns false if no wave data is available.
   */
  readWaveChannel(endFrame: number, samples: number, offset: number, out: Int32Array): boolean {
    const ring = this._waveRing;
    if (ring == null) return false;
    const cap = this._waveRingSamples;
    const oldest = this._waveEnd - cap;
    const start = endFrame - samples + 1;
    for (let i = 0; i < samples; i++) {
      const f = start + i;
      if (f >= oldest && f < this._waveEnd && f >= 0) {
        out[i] += ring[(f % cap) * WAVE_STRIDE + offset];
      }
    }
    return true;
  }

  readWaveWindow(endFrame: number, samples: number, out: Int16Array): boolean {
    const ring = this._waveRing;
    if (ring == null) return false;
    const cap = this._waveRingSamples;
    const oldest = this._waveEnd - cap;
    const start = endFrame - samples + 1;
    for (let i = 0; i < samples; i++) {
      const f = start + i;
      const o = i * WAVE_STRIDE;
      if (f >= oldest && f < this._waveEnd && f >= 0) {
        const src = (f % cap) * WAVE_STRIDE;
        for (let k = 0; k < WAVE_STRIDE; k++) out[o + k] = ring[src + k];
      } else {
        for (let k = 0; k < WAVE_STRIDE; k++) out[o + k] = 0;
      }
    }
    return true;
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
