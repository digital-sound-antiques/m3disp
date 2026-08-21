/**
 * Beat estimation from note onsets.
 *
 * Chip music makes this far easier than audio does: the onsets are exact frame
 * numbers taken from key-ons, not peaks picked out of a waveform, and a driver
 * running on a fixed tick already quantises them. So the job is only to find
 * which period the onsets line up on, not to find the onsets.
 *
 * The period is found from the intervals between onsets rather than from the
 * onsets' absolute positions. Folding the onsets onto a candidate period and
 * measuring how tightly they cluster — the obvious approach — fails on exactly
 * the music this has to handle: a part written in sixteenths puts equal weight
 * on all four positions within the beat, so the fold comes out flat and the
 * beat period scores no better than any other. What survives subdivision is
 * that the *pattern* repeats: an interval histogram of every onset pair shows
 * peaks at the beat and at its multiples, however the beat is filled in.
 *
 * So the score for a candidate period is the histogram summed over that
 * period's multiples — a comb. A comb also fits at half or twice the beat, where
 * it lands on a subset of the same peaks, and the comb alone cannot rank those:
 * a period and its double are equally periodic. Two further factors bracket the
 * right one from either side.
 *
 * The grid is judged the way a search result is: precision and recall, against
 * the offset that fits best — which is also the phase, so it costs nothing
 * extra. Precision is how much onset weight lands on the beat; twice the beat
 * halves it, because every other beat then falls in the middle of the grid. So
 * precision argues against periods that are too long. Recall is how many beats
 * have any onset at all; half the beat leaves every second grid point empty, so
 * recall argues against periods that are too short. Neither alone is enough —
 * half the beat keeps precision (beats are a subset of eighths) and twice the
 * beat keeps recall — and a log-symmetric tempo preference cannot split a 2:1
 * pair straddling its centre, since 88 and 176 BPM sit either side of 125. The
 * two together bracket the beat, with the tempo preference only breaking ties.
 *
 * Subdivisions do not confuse the phase, because the heavier onsets — the
 * simultaneous key-ons of a bass note and a drum — fall on the beat.
 */

export type Onset = {
  /** Time in NTSC frames from the start of the track. */
  frame: number;
  /** Relative importance; simultaneous key-ons make a heavier onset. */
  weight: number;
};

export type BeatEstimate = {
  /** Beat length in NTSC frames. */
  periodFrames: number;
  /** Frame of the first beat, in [0, periodFrames). */
  phaseFrames: number;
  /**
   * 0..1. How well the grid fits: onset weight landing on the beat and beats
   * carrying an onset, combined. Around 0.5 is a firm beat; a track with no
   * steady pulse to find scores near zero.
   */
  confidence: number;
  bpm: number;
};

const FPS = 60;
/** Tempo range searched, in BPM. */
const MIN_BPM = 60;
const MAX_BPM = 220;

/** Resolution of the interval histogram and of the period search, in frames. */
const LAG_STEP = 0.25;
const SEARCH_STEP = 0.05;
/**
 * Phase resolution while ranking candidates, in frames. The winner is refined at
 * {@link SEARCH_STEP}; ranking at that resolution too would spend most of the
 * run on candidates that lose anyway, and this runs live in the player.
 */
const COARSE_PHASE_STEP = 0.25;
/**
 * Half-width of the triangular kernel each interval is smeared with. A driver
 * whose tick does not divide the frame rate spreads a nominally constant
 * interval over neighbouring frames — 5,6,5,6 for a sixteenth of 5.5 frames —
 * and an interval measured across many beats accumulates that jitter.
 */
const IOI_KERNEL = 1.25;
/** Multiples of the candidate period summed into its comb score. */
const HARMONICS = 6;
/** How far from a beat an onset still counts as on it, in frames. */
const PHASE_WINDOW = 1.5;
/** Onset weight a beat must catch to count as filled, for recall. */
const COVER_MIN = 0.5;
/** Comb peaks taken through to the (costlier) grid fit. */
const CANDIDATES = 16;
/**
 * Ratios of each leading peak also tried as candidates. The comb cannot rank a
 * period against its own multiples, so these are exactly the periods the peak it
 * did find might have been standing in for, and they must be scored even when
 * the comb left no peak of its own there.
 */
const RELATED = [1 / 3, 1 / 2, 2 / 3, 3 / 2, 2, 3];
const RELATED_OF = 4;
/** Range and resolution of the final joint period/phase refinement, in frames. */
const REFINE_RANGE = 0.3;
const REFINE_STEP = 0.02;

/**
 * A period twice (or half) the real beat also fits the onsets, so the comb
 * score alone picks arbitrarily among them.
 */
const PRIOR_CENTER_BPM = 125;
const PRIOR_WIDTH_OCTAVES = 0.8;
/**
 * Bonus for a candidate close to the caller's `prefer` period, and how close
 * that has to be. A live estimate is recomputed as more of the track arrives,
 * and the 2:1 choice can sit on a knife edge; without a preference for the
 * answer already given, the reading flips between a tempo and its double from
 * one window to the next.
 */
const STICKY_BONUS = 1.2;
const STICKY_TOLERANCE = 0.03;

function tempoPrior(bpm: number): number {
  const octaves = Math.log2(bpm / PRIOR_CENTER_BPM) / PRIOR_WIDTH_OCTAVES;
  return Math.exp(-0.5 * octaves * octaves);
}

/** Triangular kernel: 1 at the centre, 0 at and beyond `halfWidth`. */
function kernel(distance: number, halfWidth: number): number {
  const d = Math.abs(distance);
  return d >= halfWidth ? 0 : 1 - d / halfWidth;
}

/**
 * Weighted histogram of the intervals between onset pairs, smeared with
 * {@link IOI_KERNEL} and binned at {@link LAG_STEP}. Index `i` is the interval
 * `i * LAG_STEP` frames.
 */
function intervalHistogram(onsets: Onset[], maxLag: number, span: number): Float64Array {
  const bins = Math.ceil(maxLag / LAG_STEP) + 2;
  const h = new Float64Array(bins);
  const spread = Math.ceil(IOI_KERNEL / LAG_STEP);
  for (let i = 0; i < onsets.length; i++) {
    const a = onsets[i];
    for (let j = i + 1; j < onsets.length; j++) {
      const lag = onsets[j].frame - a.frame;
      if (lag > maxLag) break; // onsets are sorted, so no later j is closer
      const w = a.weight * onsets[j].weight;
      const centre = lag / LAG_STEP;
      const from = Math.max(0, Math.ceil(centre - spread));
      const to = Math.min(bins - 1, Math.floor(centre + spread));
      for (let b = from; b <= to; b++) h[b] += w * kernel(b * LAG_STEP - lag, IOI_KERNEL);
    }
  }
  // Long intervals have less of the track to occur in, so leaving the counts raw
  // would tilt every comb towards short periods.
  for (let b = 0; b < bins; b++) h[b] /= Math.max(1, span - b * LAG_STEP);
  return h;
}

/** The histogram at an arbitrary lag, interpolated between bins. */
function sampleHistogram(h: Float64Array, lag: number): number {
  const x = lag / LAG_STEP;
  const i = Math.floor(x);
  if (i < 0 || i + 1 >= h.length) return 0;
  const t = x - i;
  return h[i] * (1 - t) + h[i + 1] * t;
}

type GridFit = {
  /** Onset weight caught by the grid, as a fraction of all onset weight. */
  precision: number;
  /** Beats that caught at least {@link COVER_MIN} of weight, as a fraction. */
  recall: number;
};

/** How well the grid `period`/`phase` fits the onsets. Onsets must be sorted. */
function gridFit(onsets: Onset[], totalWeight: number, period: number, phase: number): GridFit {
  const firstBeat = Math.ceil((onsets[0].frame - phase) / period);
  const lastBeat = Math.floor((onsets[onsets.length - 1].frame - phase) / period);
  const beats = lastBeat - firstBeat + 1;
  if (beats <= 0) return { precision: 0, recall: 0 };

  const caught = new Float64Array(beats);
  let hit = 0;
  for (const o of onsets) {
    const x = (o.frame - phase) / period;
    const beat = Math.round(x);
    const w = o.weight * kernel((x - beat) * period, PHASE_WINDOW);
    if (w === 0) continue;
    hit += w;
    const i = beat - firstBeat;
    if (i >= 0 && i < beats) caught[i] += w;
  }
  let filled = 0;
  for (const c of caught) if (c >= COVER_MIN) filled++;

  // Onsets scattered at random would still land near a grid this often, so that
  // much of the weight caught says nothing about the beat — and at a subdivision
  // it is nearly all of it.
  const chance = PHASE_WINDOW / period;
  const precision = Math.max(0, (hit / totalWeight - chance) / (1 - chance));
  return { precision, recall: filled / beats };
}

/**
 * The offset of the grid of `period` that catches the most onset weight, searched
 * at `step`. `from`/`to` narrow the search, for refining an offset already found.
 */
function bestGrid(
  onsets: Onset[],
  totalWeight: number,
  period: number,
  step: number,
  from = 0,
  to = period
): GridFit & { phase: number } {
  let best: GridFit = { precision: -1, recall: 0 };
  let phase = from;
  for (let p = from; p < to; p += step) {
    const fit = gridFit(onsets, totalWeight, period, p);
    if (fit.precision > best.precision) {
      best = fit;
      phase = p;
    }
  }
  return { ...best, phase };
}

/** Precision and recall as one number, the way an F-measure does it. */
function fitScore(fit: GridFit): number {
  const sum = fit.precision + fit.recall;
  return sum <= 0 ? 0 : (2 * fit.precision * fit.recall) / sum;
}

/**
 * Estimate the beat the onsets fall on, or null when there is too little to go
 * on. `fps` is the unit of `Onset.frame`. `prefer` is a period a previous
 * estimate settled on, nudged towards so a repeated estimate stays stable.
 */
export function estimateBeat(
  onsets: Onset[],
  fps: number = FPS,
  prefer: number | null = null
): BeatEstimate | null {
  if (onsets.length < 8) return null;

  const sorted = onsets.slice().sort((a, b) => a.frame - b.frame);
  let totalWeight = 0;
  for (const o of sorted) totalWeight += o.weight;
  if (totalWeight <= 0) return null;

  const minPeriod = (fps * 60) / MAX_BPM;
  const maxPeriod = (fps * 60) / MIN_BPM;
  // Two beats of material cannot show a repeating pattern; ask for eight.
  const span = sorted[sorted.length - 1].frame - sorted[0].frame;
  if (span < 8 * minPeriod) return null;

  const maxLag = Math.min(HARMONICS * maxPeriod, span);
  const h = intervalHistogram(sorted, maxLag, span);

  const comb = (period: number): number => {
    let sum = 0;
    let norm = 0;
    // Nearer multiples are the better evidence: they are supported by more
    // pairs, and they accumulate less of the driver's tick jitter.
    for (let k = 1; k <= HARMONICS && k * period <= maxLag; k++) {
      sum += sampleHistogram(h, k * period) / k;
      norm += 1 / k;
    }
    return norm === 0 ? 0 : (sum / norm) * tempoPrior((fps * 60) / period);
  };

  // Comb peaks, best first. Only peaks are worth keeping: a period between two
  // multiples of the beat scores below both of its neighbours.
  const peaks: number[] = [];
  const combOf = new Map<number, number>();
  let prev = -1;
  let rising = false;
  for (let period = minPeriod; period <= maxPeriod + SEARCH_STEP; period += SEARCH_STEP) {
    const score = comb(period);
    if (rising && score < prev) {
      peaks.push(period - SEARCH_STEP);
      combOf.set(period - SEARCH_STEP, prev);
    }
    rising = score > prev;
    prev = score;
  }
  if (peaks.length === 0) return null;
  peaks.sort((a, b) => combOf.get(b)! - combOf.get(a)!);

  const candidates = peaks.slice(0, CANDIDATES);
  for (const period of peaks.slice(0, RELATED_OF)) {
    for (const ratio of RELATED) {
      const related = period * ratio;
      if (related < minPeriod || related > maxPeriod) continue;
      if (candidates.some((c) => Math.abs(c - related) < SEARCH_STEP)) continue;
      candidates.push(related);
    }
  }

  let bestPeriod = 0;
  let bestScore = -1;
  for (const period of candidates) {
    const fit = bestGrid(sorted, totalWeight, period, COARSE_PHASE_STEP);
    const sticky =
      prefer != null && Math.abs(period / prefer - 1) < STICKY_TOLERANCE ? STICKY_BONUS : 1;
    const score = comb(period) * fitScore(fit) * sticky;
    if (score > bestScore) {
      bestScore = score;
      bestPeriod = period;
    }
  }
  if (bestPeriod === 0) return null;

  // The comb resolution is enough to name the tempo but not to keep a grid in
  // step over a whole track: 0.05 frames of period error is four frames of drift
  // after sixteen bars. Fitting period and phase together against every onset
  // pins both down.
  let best: (GridFit & { phase: number; period: number }) | null = null;
  for (let period = bestPeriod - REFINE_RANGE; period <= bestPeriod + REFINE_RANGE; period += REFINE_STEP) {
    const fit = bestGrid(sorted, totalWeight, period, COARSE_PHASE_STEP);
    if (best == null || fit.precision > best.precision) best = { ...fit, period };
  }
  if (best == null) return null;
  // ...and the winning period's offset at full resolution.
  const fine = bestGrid(
    sorted,
    totalWeight,
    best.period,
    SEARCH_STEP,
    Math.max(0, best.phase - COARSE_PHASE_STEP),
    best.phase + COARSE_PHASE_STEP
  );
  if (fine.precision >= best.precision) best = { ...fine, period: best.period };

  return {
    periodFrames: best.period,
    phaseFrames: best.phase,
    confidence: fitScore(best),
    bpm: (fps * 60) / best.period,
  };
}

/** Frame of the `n`th beat at or after `fromFrame`. */
export function beatFrames(est: BeatEstimate, fromFrame: number, toFrame: number): number[] {
  const out: number[] = [];
  if (est.periodFrames <= 0) return out;
  const first = Math.ceil((fromFrame - est.phaseFrames) / est.periodFrames);
  for (let n = first; ; n++) {
    const f = est.phaseFrames + n * est.periodFrames;
    if (f > toFrame) break;
    out.push(f);
  }
  return out;
}
