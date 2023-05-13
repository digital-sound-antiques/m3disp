import { AudioPlayer, AudioRendererType, MonoWaveBuffer } from "webaudio-stream-player";
import { KSSDecoderStartOptions, type KSSDecoderDeviceSnapshot } from "./kss-decoder-worker";

import workletUrl from "./renderer-worklet.ts?worker&url";
import {
  getChannelStatus,
  ChannelId,
  ChannelStatus,
  getChannelStatusArray,
} from "./channel-status";

export class WaveThumbnail {
  min: number = 0.0;
  max: number = 0.0;
  _buffer = new MonoWaveBuffer(60 * 60);
  _dataCache: Int16Array | null = null;

  get length() {
    return this._buffer.wp;
  }

  clear() {
    this.min = 16383;
    this.max = -16384;
    this._buffer.clear();
    this._dataCache = null;
  }

  write(data: Int16Array) {
    this._buffer.write(data);
    for (let i = 0; i < data.length; i++) {
      if (data[i] < this.min) {
        this.min = data[i];
      }
      if (this.max < data[i]) {
        this.max = data[i];
      }
    }
    this._dataCache = null;
  }

  get data(): Int16Array {
    if (this._dataCache == null) {
      if (this._buffer.wave instanceof Int16Array) {
        this._dataCache = new Int16Array(
          this._buffer.wave.buffer,
          this._buffer.wave.byteOffset,
          this._buffer.wp
        );
      } else {
        this._dataCache = new Int16Array();
      }
    }
    return this._dataCache;
  }
}
export class KSSPlayer extends AudioPlayer {
  constructor(rendererType: AudioRendererType) {
    super({
      rendererType: rendererType,
      decoderWorkerFactory: () => {
        return new Worker(new URL("./kss-decoder-worker.ts", import.meta.url), { type: "module" });
      },
      rendererWorkletUrl: workletUrl,
      rendererWorkletName: "renderer",
      recycleDecoder: true,
      numberOfChannels: 1,
    });

    this.addEventListener("decodermessage", (ev: CustomEvent) => {
      const detail = ev.detail;
      if (detail.type == "snapshots") {
        const snapshots = detail.data as Array<KSSDecoderDeviceSnapshot>;
        const wave = new Int16Array(snapshots.length);
        for (let i = 0; i < snapshots.length; i++) {
          const snapshot = snapshots[i];
          const index = Math.floor(snapshot.frame / 735);
          this._lastIndex = index;
          this._snapshots[index] = snapshot;
          wave[i] = snapshot.wave;
        }
        this.thumbnail.write(wave);
      }
    });
  }

  _lastIndex = -1;

  _snapshots: KSSDecoderDeviceSnapshot[] = [];

  thumbnail = new WaveThumbnail();

  outputLatencyOverride: number | null = null;

  findSnapshotAt(frame: number): KSSDecoderDeviceSnapshot | undefined {
    const latency = this.outputLatencyOverride ?? this.outputLatency;
    const latencyInFrame = (this.audioContext?.sampleRate ?? 0) * latency;
    const fixedFrame = Math.max(0, frame - latencyInFrame);
    const ntscFrame = Math.floor(fixedFrame / 735);
    return this._snapshots[ntscFrame];
  }

  override async play(args: KSSDecoderStartOptions) {
    this._snapshots = [];
    this.thumbnail.clear();
    await super.play(args);
  }

  override async abort() {
    this._snapshots = [];
    await super.abort();
    this.thumbnail.clear();
  }

  getChannelStatus(id: ChannelId): ChannelStatus | null {
    return getChannelStatus(this, id);
  }

  getChannelStatusArray(id: ChannelId, pastSpanInFrames: number, futureSpanInFrames: number): (ChannelStatus | null)[] {
    return getChannelStatusArray(this, id, pastSpanInFrames, futureSpanInFrames);
  }
}
