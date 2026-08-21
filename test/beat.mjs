// Measure the beat estimator against real tracks.
//
// Onsets come from the SPC path because it can be driven headlessly; the
// estimator itself only ever sees onset times, so it is format-agnostic.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SPCPlayer } from "spc700-js";
import { estimateBeat } from "../src/kss/beat-estimate.ts";

const RATE = 32000;
const FPS = 60;
const SECONDS = Number(process.argv[3] ?? 60);

function onsetsOf(data, seconds) {
  const p = new SPCPlayer({ sampleRate: RATE });
  p.load(data);
  const onsets = [];
  // Key-on counts, not "has it changed": a voice can be retriggered more than
  // once between reads, and the count is what says how heavy the onset is.
  const last = p.getVoiceStatusArray().map((v) => v.keyOnCount);
  const left = new Int16Array(1024);
  const right = new Int16Array(1024);
  let acc = 0;
  for (let frame = 0; frame < seconds * FPS; frame++) {
    // Exact 60 Hz frames at 32 kHz: 533 samples, then 534, and so on.
    acc += RATE;
    const n = Math.floor(acc / FPS);
    acc -= n * FPS;
    for (let done = 0; done < n; ) {
      const chunk = Math.min(1024, n - done);
      p.renderInto(left, right, 0, chunk);
      done += chunk;
    }
    let weight = 0;
    for (const v of p.getVoiceStatusArray()) {
      weight += v.keyOnCount - last[v.index];
      last[v.index] = v.keyOnCount;
    }
    if (weight > 0) onsets.push({ frame, weight });
  }
  return onsets;
}

/**
 * How close each beat sits to an onset, in frames (median).
 *
 * Measured from the beats and not from the onsets: music in sixteenths puts most
 * onsets a quarter of a beat away from the grid however right the grid is, so the
 * onset-side error says more about the subdivision than about the estimate.
 */
function beatError(onsets, est) {
  const errs = [];
  const last = onsets[onsets.length - 1].frame;
  for (let beat = est.phaseFrames; beat <= last; beat += est.periodFrames) {
    let nearest = Infinity;
    for (const o of onsets) nearest = Math.min(nearest, Math.abs(o.frame - beat));
    errs.push(nearest);
  }
  errs.sort((a, b) => a - b);
  return errs[errs.length >> 1];
}

const target = process.argv[2];
const files = readdirSync(target)
  .filter((f) => f.toLowerCase().endsWith(".spc"))
  .sort();

console.log(
  "file".padEnd(38),
  "onsets",
  "BPM".padStart(7),
  "period".padStart(7),
  "conf".padStart(6),
  "beat err".padStart(9),
  "ms".padStart(6)
);
const bpms = [];
for (const f of files) {
  const onsets = onsetsOf(new Uint8Array(readFileSync(join(target, f))), SECONDS);
  const t0 = performance.now();
  const est = estimateBeat(onsets);
  const ms = performance.now() - t0;
  if (est == null) {
    console.log(f.padEnd(38), String(onsets.length).padStart(6), "  (too few onsets)");
    continue;
  }
  bpms.push(est.bpm);
  console.log(
    f.padEnd(38),
    String(onsets.length).padStart(6),
    est.bpm.toFixed(1).padStart(7),
    est.periodFrames.toFixed(2).padStart(7),
    est.confidence.toFixed(3).padStart(6),
    beatError(onsets, est).toFixed(2).padStart(9),
    ms.toFixed(0).padStart(6)
  );
}
