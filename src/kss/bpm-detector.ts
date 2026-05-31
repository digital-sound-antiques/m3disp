import type { KSSPlayer } from "./kss-player";
import type { ChannelId } from "./channel-status";
import { getKcodeAt } from "./channel-status";

export type BPMInfo = {
  bpm: number;
  framesPerBeat: number;
  phaseOffset: number;
  firstOnset: number;
  /** Actual beat positions (snapshot array indices) */
  beatFrames: number[];
};

const PROBE_CHANNELS: ChannelId[] = [
  { device: "opll", index: 0 },
  { device: "opll", index: 1 },
  { device: "opll", index: 2 },
  { device: "psg",  index: 0 },
  { device: "psg",  index: 1 },
  { device: "scc",  index: 0 },
  { device: "scc",  index: 1 },
];

/**
 * Starting from theoretical beat positions, snaps to actual onset signals within
 * ±snapWindow frames to correct jitter from error diffusion.
 * If no onset is found nearby, uses the rounded theoretical value as-is.
 */
function trackBeats(
  onsets: Uint8Array,
  start: number,
  end: number,
  firstOnset: number,
  fpb: number
): number[] {
  const beats: number[] = [];
  let pos = firstOnset;
  const snapWindow = 2; // Max jitter from error diffusion ≈ ±1 frame, with margin

  while (pos <= end) {
    beats.push(Math.round(pos));
    const nextNominal = pos + fpb;

    // Snap to an onset near the next theoretical beat position if one exists
    let bestPos = nextNominal;
    let bestDist = Infinity;
    const lo = Math.round(nextNominal - snapWindow);
    const hi = Math.round(nextNominal + snapWindow);
    for (let f = lo; f <= hi; f++) {
      const fi = f - start;
      if (fi >= 0 && fi < onsets.length && onsets[fi] === 1) {
        const dist = Math.abs(f - nextNominal);
        if (dist < bestDist) { bestDist = dist; bestPos = f; }
      }
    }
    pos = bestPos;
  }
  return beats;
}

export function detectBPM(player: KSSPlayer): BPMInfo | null {
  const snapshots = player._snapshots;
  const total = snapshots.length;
  if (total < 120) return null;

  // ---- Skip leading silence and find the first note-on position ----
  let firstOnset = -1;
  outer:
  for (let i = 0; i < total; i++) {
    for (const id of PROBE_CHANNELS) {
      if (getKcodeAt(snapshots[i], id) !== null) { firstOnset = i; break outer; }
    }
  }
  if (firstOnset < 0) return null;

  // ---- Analysis window (from first onset, last 30 seconds) ----
  const end   = Math.min(total, player._lastIndex + 1);
  const start = Math.max(firstOnset, end - 30 * 60);
  const len   = end - start;
  if (len < 60) return null;

  // ---- Build onset signal ----
  const onsets = new Uint8Array(len);
  for (const id of PROBE_CHANNELS) {
    let prev: number | null = null;
    for (let i = 0; i < len; i++) {
      const kcode = getKcodeAt(snapshots[start + i], id);
      if (kcode !== null && kcode !== prev) onsets[i] = 1;
      prev = kcode ?? null;
    }
  }

  // ---- Autocorrelation (store correlation values in array) ----
  // BPM 60~200 → lag 18~60 frames
  const minLag = 18;
  const maxLag = 60;
  const corrArr = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let c = 0;
    for (let i = 0; i < len - lag; i++) c += onsets[i] & onsets[i + lag];
    corrArr[lag] = c;
  }

  let bestLag = minLag;
  for (let lag = minLag + 1; lag <= maxLag; lag++) {
    if (corrArr[lag] > corrArr[bestLag]) bestLag = lag;
  }
  if (corrArr[bestLag] < 4) return null;

  // ---- Parabolic interpolation for sub-frame lag estimation ----
  let refinedLag = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const c0 = corrArr[bestLag - 1];
    const c1 = corrArr[bestLag];
    const c2 = corrArr[bestLag + 1];
    const denom = c0 - 2 * c1 + c2;
    if (denom < 0) refinedLag = bestLag - 0.5 * (c2 - c0) / denom;
  }

  // ---- Calculate BPM (clamp to range 60~200) ----
  let bpm = 3600 / refinedLag;
  while (bpm < 75)  bpm *= 2;
  while (bpm > 180) bpm /= 2;

  const framesPerBeat = Math.round(3600 / bpm);
  const fpbExact = 3600.0 / bpm;

  // ---- Fix phase as a float anchored at firstOnset ----
  const phaseOffset = firstOnset % fpbExact;

  // ---- Track actual beat positions using onset snapping ----
  const beatFrames = trackBeats(onsets, start, end, firstOnset, fpbExact);

  return { bpm, framesPerBeat, phaseOffset, firstOnset, beatFrames };
}
