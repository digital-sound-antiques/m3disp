// Ground truth for the beat estimator: onsets generated from a known tempo.
//
// Real tracks can only be checked for plausibility, so the accuracy claim rests
// on synthetic patterns that carry the properties that break naive estimators —
// sixteenth subdivision, a tick that does not divide the frame rate, dropped
// notes and off-grid ornaments.
import { estimateBeat } from "../src/kss/beat-estimate.ts";

const FPS = 60;

/** Deterministic PRNG, so a failure is reproducible. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * Onsets for `bars` bars of 4/4 at `bpm`, filled in sixteenths.
 *
 * `density` is the chance a sixteenth sounds at all, `strayRate` the chance of
 * an extra onset off the grid. Positions are rounded to whole frames, which is
 * what reading key-ons once per frame does to a driver running on its own tick.
 */
function pattern({ bpm, bars, phase = 0, density = 0.55, strayRate = 0.04, seed = 1 }) {
  const rand = rng(seed);
  const beat = (FPS * 60) / bpm;
  const onsets = [];
  for (let b = 0; b < bars * 16; b++) {
    const onBeat = b % 4 === 0;
    const onBar = b % 16 === 0;
    if (!onBeat && rand() > density) continue;
    // A bass note and a drum landing together make the beat the heavier onset.
    const weight = onBar ? 4 : onBeat ? 3 : rand() < 0.3 ? 2 : 1;
    onsets.push({ frame: Math.round(phase + (b * beat) / 4), weight });
    if (rand() < strayRate) {
      onsets.push({ frame: Math.round(phase + (b * beat) / 4 + beat / 6), weight: 1 });
    }
  }
  return onsets;
}

let failures = 0;

function check(label, onsets, expectBpm, expectPhase) {
  const est = estimateBeat(onsets);
  if (est == null) {
    console.log(`FAIL ${label}: no estimate (${onsets.length} onsets)`);
    failures++;
    return;
  }
  const period = (FPS * 60) / expectBpm;
  const bpmErr = (Math.abs(est.bpm - expectBpm) / expectBpm) * 100;
  // The phase is only defined modulo the beat.
  let phaseErr = Math.abs(((est.phaseFrames - expectPhase) % period) + period) % period;
  if (phaseErr > period / 2) phaseErr = period - phaseErr;
  const ok = bpmErr < 1.5 && phaseErr < 1.5;
  if (!ok) failures++;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${label.padEnd(30)} ` +
      `bpm ${est.bpm.toFixed(1).padStart(6)} (want ${expectBpm.toFixed(1).padStart(6)}, ` +
      `${bpmErr.toFixed(2)}%)  phase err ${phaseErr.toFixed(2)}f  conf ${est.confidence.toFixed(3)}`
  );
}

// Tempi across the searched range, including ones whose sixteenth is not a
// whole number of frames (150 BPM is 6.0, 164 is 5.49, 137 is 6.57).
for (const bpm of [72, 90, 100, 112, 120, 137, 150, 164, 176, 200]) {
  check(`${bpm} bpm, 16ths`, pattern({ bpm, bars: 16, phase: 7, seed: bpm }), bpm, 7);
}

// Sparser music, where the beat is carried by fewer notes.
for (const bpm of [96, 128, 160]) {
  check(
    `${bpm} bpm, sparse`,
    pattern({ bpm, bars: 16, phase: 13, density: 0.25, seed: bpm + 1 }),
    bpm,
    13
  );
}

// Eighth-note feel only: nothing at all on the sixteenths.
for (const bpm of [104, 140]) {
  const beat = (FPS * 60) / bpm;
  const onsets = [];
  for (let e = 0; e < 16 * 8; e++) {
    onsets.push({ frame: Math.round(3 + (e * beat) / 2), weight: e % 2 === 0 ? 3 : 1 });
  }
  check(`${bpm} bpm, 8ths only`, onsets, bpm, 3);
}

// Half the material: a short jingle still has to come out right.
check("120 bpm, 4 bars", pattern({ bpm: 120, bars: 4, phase: 0, seed: 9 }), 120, 0);

// Too little to judge: the estimator must decline rather than guess.
const tiny = [0, 30, 61, 90].map((frame) => ({ frame, weight: 1 }));
if (estimateBeat(tiny) != null) {
  console.log("FAIL declines on 4 onsets: returned an estimate");
  failures++;
} else {
  console.log("ok   declines on 4 onsets");
}

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
