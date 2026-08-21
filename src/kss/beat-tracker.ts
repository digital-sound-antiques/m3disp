/**
 * A live beat estimate for the playing track.
 *
 * The decoder's look-ahead scan already walks every NTSC frame of the song and
 * counts the channels keyed on in each one, so the onsets the estimator needs
 * arrive with the device snapshots — nothing has to be replayed. This module
 * folds them up as they land and re-estimates now and then, keeping the answer
 * in one place for the readout and the piano roll to share.
 *
 * The estimate covers a trailing window rather than the whole song: it bounds
 * the work, and a track that changes tempo halfway then follows the change
 * instead of averaging over it.
 *
 * The estimate itself runs in a worker (see beat-worker): folding onsets is
 * nothing, but a run of the estimator is about a frame's worth of work, and
 * doing that on the main thread every few seconds was visible in the roll.
 */

import { estimateBeat, type BeatEstimate, type Onset } from "./beat-estimate";
import { SPC_VOICE_FIELDS } from "../spc/spc-engine";
import type { BeatRequest } from "./beat-worker";
import type { KSSDecoderDeviceSnapshot } from "./kss-decoder-worker";

export type { BeatEstimate };

/** Don't guess from less material than this. */
const MIN_FRAMES = 60 * 12;
/** New material needed before the estimate is recomputed. */
const REFRESH_FRAMES = 60 * 8;
/** Length of the trailing window the estimate is made from. */
const WINDOW_FRAMES = 60 * 60;
/**
 * Below this the track has no pulse worth drawing — an ambient or free-time
 * piece, or a passage too sparse to place a beat in.
 */
export const BEAT_MIN_CONFIDENCE = 0.15;

let current: BeatEstimate | null = null;
/** The snapshot array the collected onsets belong to; identity = the song. */
let songRef: KSSDecoderDeviceSnapshot[] | null = null;
/** Frames already folded into {@link onsets}. */
let scanned = 0;
let estimatedAt = 0;
let onsets: Onset[] = [];
const listeners = new Set<() => void>();

/** Bumped on every reset, so a result computed for the previous track is dropped. */
let songId = 0;
/** True while the worker is busy; one request at a time is plenty. */
let pending = false;
let worker: Worker | null = null;
/** Set once the worker turns out to be unavailable, to stop retrying. */
let workerUnavailable = false;

function beatWorker(): Worker | null {
  if (worker != null || workerUnavailable) return worker;
  try {
    worker = new Worker(new URL("./beat-worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (ev: MessageEvent<{ id: number; estimate: BeatEstimate | null }>) => {
      pending = false;
      if (ev.data.id !== songId || ev.data.estimate == null) return;
      current = ev.data.estimate;
      for (const l of listeners) l();
    };
    worker.onerror = () => {
      // Fall back to estimating in place rather than losing the feature.
      pending = false;
      workerUnavailable = true;
      worker?.terminate();
      worker = null;
    };
  } catch {
    workerUnavailable = true;
    worker = null;
  }
  return worker;
}

export function subscribeBeat(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current estimate, or null when there is none (yet). */
export function getBeat(): BeatEstimate | null {
  return current;
}

/** The current estimate, only if it is worth showing. See {@link BEAT_MIN_CONFIDENCE}. */
export function getConfidentBeat(): BeatEstimate | null {
  return current != null && current.confidence >= BEAT_MIN_CONFIDENCE ? current : null;
}

function reset(snapshots: KSSDecoderDeviceSnapshot[] | null): void {
  songRef = snapshots;
  scanned = 0;
  estimatedAt = 0;
  onsets = [];
  songId++;
  pending = false;
  if (current != null) {
    current = null;
    for (const l of listeners) l();
  }
}

/** Channels keyed on during this frame. */
function keyOnsOf(snap: KSSDecoderDeviceSnapshot): number {
  if (snap.keyOns != null) return snap.keyOns;
  // SPC dumps have no register writes to watch, but each voice reports the frames
  // since its own key-on, so a zero there is this frame's attack. (Field order:
  // see encodeVoices in spc/spc-engine.)
  const spc = snap.spc;
  if (spc == null) return 0;
  let count = 0;
  for (let v = 0; v < 8; v++) {
    const o = v * SPC_VOICE_FIELDS;
    if (spc[o + 2] === 0 && spc[o + 1] > 0) count++;
  }
  return count;
}

/**
 * Fold in whatever the decoder has scanned since the last call, and re-estimate
 * when enough new material has arrived. Cheap to call often; the work is bounded
 * and only actually done when it is due.
 */
export function trackBeat(snapshots: KSSDecoderDeviceSnapshot[] | null): void {
  if (snapshots == null) {
    if (songRef != null) reset(null);
    return;
  }
  if (snapshots !== songRef) reset(snapshots);

  // Frames arrive in order, so stop at the first one not decoded yet rather than
  // skipping it: after a seek the gap may never be filled, and walking past it
  // would drop that music from the estimate for good.
  while (scanned < snapshots.length) {
    const snap = snapshots[scanned];
    if (snap == null) break;
    const weight = keyOnsOf(snap);
    if (weight > 0) onsets.push({ frame: scanned, weight });
    scanned++;
  }

  if (pending || scanned < MIN_FRAMES || scanned - estimatedAt < REFRESH_FRAMES) return;
  estimatedAt = scanned;

  const from = scanned - WINDOW_FRAMES;
  if (from > 0) {
    const drop = onsets.findIndex((o) => o.frame >= from);
    if (drop > 0) onsets = onsets.slice(drop);
  }

  const prefer = current?.periodFrames ?? null;
  const w = beatWorker();
  if (w == null) {
    const next = estimateBeat(onsets, 60, prefer);
    if (next == null) return;
    current = next;
    for (const l of listeners) l();
    return;
  }

  const frames = new Int32Array(onsets.length);
  const weights = new Int32Array(onsets.length);
  for (let i = 0; i < onsets.length; i++) {
    frames[i] = onsets[i].frame;
    weights[i] = onsets[i].weight;
  }
  const request: BeatRequest = { id: songId, frames, weights, fps: 60, prefer };
  pending = true;
  w.postMessage(request, [frames.buffer, weights.buffer]);
}
