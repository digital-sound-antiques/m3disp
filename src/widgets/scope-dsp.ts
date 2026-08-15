// Shared oscilloscope DSP used by the Scope grid and the Keyboard-view mini
// scopes: mapping a device-local channel to its per-channel wave-buffer offset,
// and the phase-lock (correlation) trigger. Kept out of WaveGrid so both callers
// can import it without an import cycle.
import { PerChLayout } from "libkss-js";
import type { DeviceName } from "../kss/kss-device";

/**
 * Widest a Scope cell is allowed to get, as width/height. Past this a trace
 * flattens into a line and its shape stops reading; the grid grows past the
 * pane and scrolls rather than squashing further.
 *
 * Dividing a fixed budget by the column count keeps the *row* at a constant
 * shape however the channels are split across it: two columns of 8:1 cells
 * occupy the same band as one 16:1 cell, so changing the column count
 * rearranges the traces without changing how tall the grid wants to be.
 */
export const maxScopeCellAspect = (cols: number) => 16 / cols;

// OPLL rhythm channels are ordered differently in emu2413's ch_out (the per-ch
// wave buffer) than in m3disp's channelIds convention. Map channelIds rhythm
// index → ch_out index. ch_out: 9=BD 10=HH 11=SD 12=TOM 13=CYM; channelIds:
// 9=BD 10=SD 11=TOM 12=CYM 13=HH. (Physically CH8=HH+SD, CH9=TOM+CYM.)
const OPLL_RHYTHM_WAVE: Record<number, number> = { 9: 9, 10: 11, 11: 12, 12: 13, 13: 10 };

// per-channel wave-buffer int16 offset for a device-local channel index
export const waveOffset = (device: DeviceName, index: number) => {
  // The eight S-DSP voices sit at the front of the shared per-channel layout.
  if (device === "spc") return index;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const base = (PerChLayout as any)[device].offset as number;
  if (device === "opll" && index >= 9) return base + OPLL_RHYTHM_WAVE[index];
  // emu2149 has 3 physical PSG channels; m3disp splits each into a tone (0-2)
  // and a noise (3-5) lane, but ch_out already mixes tone+noise per channel.
  if (device === "psg") return base + (index % 3);
  return base + index;
};

// Phase lock by correlation: within the 2×WINDOW read buffer, pick the display
// offset o ∈ [0, WINDOW] whose window best matches the previously displayed
// (detrended) slice `prev`. Locking to the previous frame pins the phase, so
// the same portion of the waveform is shown every frame — the thing that stops
// the trace / waterfall ridges from batting around. DC-invariant (each
// candidate's mean, from `prefix`, is removed before comparing).
//
// Coarse-to-fine to stay cheap across every grid cell at 60fps: scan the whole
// range at a coarse step, then refine ±1 step around the winner. That's roughly
// (WINDOW/step + 2·step) candidates instead of WINDOW/2, yet lands on the exact
// sample (better than the old fixed 2-step). Comparison is decimated to CMP pts.
export function correlationOffset(
  buf: Int32Array,
  prefix: Float64Array,
  WINDOW: number,
  prev: Float32Array
): number {
  const CMP = Math.min(WINDOW, 64); // decimated comparison points
  const cmpStep = WINDOW / CMP;
  const sadAt = (o: number) => {
    const dc = (prefix[o + WINDOW] - prefix[o]) / WINDOW;
    let sad = 0;
    for (let c = 0; c < CMP; c++) {
      const j = (c * cmpStep) | 0;
      const diff = buf[o + j] - dc - prev[j];
      sad += diff < 0 ? -diff : diff;
    }
    return sad;
  };
  const step = Math.max(2, WINDOW >> 6); // ~16 @1024, 8 @512, 4 @256, 2 @128
  let best = 0;
  let bestSad = Infinity;
  for (let o = 0; o <= WINDOW; o += step) {
    const sad = sadAt(o);
    if (sad < bestSad) {
      bestSad = sad;
      best = o;
    }
  }
  // refine within one coarse step either side of the winner, sample by sample
  const lo = Math.max(0, best - step + 1);
  const hi = Math.min(WINDOW, best + step - 1);
  for (let o = lo; o <= hi; o++) {
    if (o === best) continue;
    const sad = sadAt(o);
    if (sad < bestSad) {
      bestSad = sad;
      best = o;
    }
  }
  return best;
}
