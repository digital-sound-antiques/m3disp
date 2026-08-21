/**
 * Runs the beat estimate off the main thread.
 *
 * The estimate takes ~15ms on a minute of onsets — a whole frame at 60fps, and
 * it repeats every few seconds as the look-ahead scan advances, which the roll
 * shows as a periodic stutter. Nothing about it needs the DOM, and it is not on
 * the audio path either, so it gets a thread of its own rather than sharing
 * either. Onsets arrive as two parallel arrays so the transfer is a move, not a
 * structured copy of one object per onset.
 */

import { estimateBeat } from "./beat-estimate";

export type BeatRequest = {
  /** Echoed back so a result from a previous track can be discarded. */
  id: number;
  frames: Int32Array;
  weights: Int32Array;
  fps: number;
  /** Period a previous estimate settled on; see estimateBeat. */
  prefer: number | null;
};

self.onmessage = (ev: MessageEvent<BeatRequest>) => {
  const { id, frames, weights, fps, prefer } = ev.data;
  const onsets = new Array(frames.length);
  for (let i = 0; i < frames.length; i++) onsets[i] = { frame: frames[i], weight: weights[i] };
  self.postMessage({ id, estimate: estimateBeat(onsets, fps, prefer) });
};
