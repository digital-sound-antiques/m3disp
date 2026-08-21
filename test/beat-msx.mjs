// Check the beat estimator against MGS files, whose own MML says the tempo.
//
// MGSRC recovers the source MML from a compiled .MGS, tempo command included, so
// this is ground truth for the format m3disp actually plays — the synthetic tests
// prove the maths, and this proves it against real music at a known tempo.
//
//   node test/beat-msx.mjs <dir-or-file> [seconds]
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { KSS, KSSPlay } from "libkss-js";
import { mgs2mml } from "mgsrc-js";
import { estimateBeat } from "../src/kss/beat-estimate.ts";

const RATE = 44100;
const FPS = 60;
const SECONDS = Number(process.argv[3] ?? 60);

/**
 * Onsets from the register writes the driver makes, one bucket per NTSC frame.
 *
 * These are the same key-on edges the player's keyframer watches: a PSG channel
 * whose mixer/volume goes non-zero, an OPLL channel whose key bit rises, and a
 * rhythm instrument switched on.
 */
function onsetsOf(data, seconds) {
  const kss = new KSS(new Uint8Array(data), "beat");
  const play = new KSSPlay(RATE);

  const psgKey = new Array(3).fill(false);
  const opllKey = new Array(14).fill(false);
  let psgAdr = 0;
  let opllAdr = 0;
  let hits = 0;

  play.setIOWriteHandler((_, a, d) => {
    if (a === 0xa0) psgAdr = d;
    else if (a === 0xa1) {
      if (psgAdr >= 8 && psgAdr <= 10) {
        const ch = psgAdr - 8;
        const on = (d & 0x1f) !== 0;
        if (on && !psgKey[ch]) hits++;
        psgKey[ch] = on;
      }
    } else if (a === 0x7c) opllAdr = d;
    else if (a === 0x7d) {
      if (opllAdr >= 0x20 && opllAdr <= 0x28) {
        const ch = opllAdr - 0x20;
        const on = (d & 0x10) !== 0;
        if (on && !opllKey[ch]) hits++;
        opllKey[ch] = on;
      } else if (opllAdr === 0x0e) {
        const rhythm = (d & 0x20) !== 0;
        for (let bit = 0; bit < 5; bit++) {
          const ch = 9 + bit;
          const on = rhythm && (d & (0x10 >> bit)) !== 0;
          if (on && !opllKey[ch]) hits++;
          opllKey[ch] = on;
        }
      }
    }
  });

  play.setData(kss);
  play.reset(0, 0);

  const onsets = [];
  const step = Math.floor(RATE / FPS);
  for (let frame = 0; frame < seconds * FPS; frame++) {
    hits = 0;
    play.calcSilent(step);
    if (hits > 0) onsets.push({ frame, weight: hits });
    if (play.getStopFlag() !== 0) break;
  }
  play.release();
  kss.release();
  return onsets;
}

/**
 * Tempi named by the file's own MML: the `#tempo` header, plus any in-track `t`
 * command, which means the tempo changes and there is no one answer to compare
 * against. Track lines start with the channel letter, so a `t` there is a
 * command and not part of a header word.
 */
function mmlTempi(data) {
  const mml = mgs2mml(new Uint8Array(data).buffer);
  // MGSRC cannot recover the tempo from the oldest format version and reports 75
  // for every one of them, so those files carry no ground truth to test against.
  if (/;mgs_version:\s*MGS300/.test(mml)) return [];
  const tempi = [];
  for (const line of mml.split("\n")) {
    const header = line.match(/^#tempo\s+(\d+)/);
    if (header != null) {
      tempi.push(Number(header[1]));
      continue;
    }
    if (/^[0-9A-F]\s/.test(line)) {
      for (const m of line.matchAll(/t\s*(\d+)/g)) tempi.push(Number(m[1]));
    }
  }
  return [...new Set(tempi)];
}

const target = process.argv[2];
const files = statSync(target).isDirectory()
  ? readdirSync(target)
      .filter((f) => f.toLowerCase().endsWith(".mgs"))
      .sort()
      .map((f) => join(target, f))
  : [target];

await KSSPlay.initialize();

console.log(
  "file".padEnd(22),
  "onsets",
  "est BPM".padStart(8),
  "MML t".padStart(8),
  "conf".padStart(6),
  "ratio".padStart(7),
  "verdict"
);

const counts = { exact: 0, octave: 0, off: 0, skipped: 0 };
for (const path of files) {
  const data = readFileSync(path);
  const name = path.split("/").pop().slice(0, 22);
  let tempi;
  try {
    tempi = mmlTempi(data);
  } catch (e) {
    console.log(name.padEnd(22), "  (MGSRC failed:", e.message + ")");
    counts.skipped++;
    continue;
  }
  const onsets = onsetsOf(data, SECONDS);
  const est = estimateBeat(onsets);
  if (est == null || tempi.length !== 1) {
    // Several tempo commands mean the tempo changes (or the MML sets it twice),
    // and then there is no single right answer to compare against.
    const why =
      est == null
        ? "no estimate"
        : tempi.length === 0
          ? "no tempo in the MML"
          : `tempi ${tempi.join(",")}`;
    console.log(name.padEnd(22), String(onsets.length).padStart(6), `  (skipped: ${why})`);
    counts.skipped++;
    continue;
  }
  const want = tempi[0];
  const ratio = est.bpm / want;
  // A tempo heard an octave out is a different answer from a wrong one: the grid
  // still lands on the music, so it is worth counting separately.
  const nearest = [1, 2, 1 / 2, 3, 1 / 3, 3 / 2, 2 / 3].find((r) => Math.abs(ratio / r - 1) < 0.02);
  const verdict = nearest === 1 ? "exact" : nearest != null ? `octave x${nearest.toFixed(2)}` : "OFF";
  if (nearest === 1) counts.exact++;
  else if (nearest != null) counts.octave++;
  else counts.off++;
  console.log(
    name.padEnd(22),
    String(onsets.length).padStart(6),
    est.bpm.toFixed(1).padStart(8),
    String(want).padStart(8),
    est.confidence.toFixed(3).padStart(6),
    ratio.toFixed(3).padStart(7),
    verdict
  );
}

console.log(
  `\n${counts.exact} exact, ${counts.octave} at an octave, ${counts.off} off, ` +
    `${counts.skipped} skipped`
);
