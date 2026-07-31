// Adaptive frame governor, shared by every animated roll/scope canvas (the main
// piano roll, the per-channel roll grid, and the wave grid). It paces rendering
// by WALL-CLOCK time, not by counting animation frames, so the effective fps is
// the same whatever the display refresh rate (60 / 120 / 144Hz) — a stride-count
// scheme would render 120fps on a 120Hz panel and turn "force 30fps" into 60fps.
//
// A single shared instance is correct: these views share one frame budget, and
// when several animate at once their costs sum into one estimate and they render
// in lockstep. The decision is made once per rAF timestamp; later callers in the
// same frame get the cached answer.
//
// `forcedFps` overrides the adaptive target: 0 = auto, else an absolute target
// (12..60). Auto measures the total paint cost and steps the target down
// (60 → 30 → 20) when the machine can't keep up, so slow machines get a steady
// low fps instead of stutter while fast machines stay at 60. Auto caps at 60 by
// AUTO_FPS[0] — rolls gain nothing from a 120Hz panel's full rate.
const AUTO_FPS = [60, 30, 20];

export const rollFrameGov = {
  ts: -1, // last decided rAF timestamp (dedup within a frame)
  prevTs: -1, // previous rAF timestamp (for the refresh-rate estimate)
  lastRenderT: 0, // timestamp of the last frame we actually rendered
  refreshMs: 1000 / 60, // EMA of the display's rAF interval
  costAccum: 0, // summed paint time (ms) of the views in the current frame
  emaCost: 0, // EMA of a full render's total cost
  autoIdx: 0, // index into AUTO_FPS for adaptive mode
  forcedFps: 0, // 0 = auto; else an absolute target fps
  render: true,
  prevRendered: false,

  // Call at the top of each view's frame with the rAF timestamp; returns whether
  // this view should paint this frame. Only the first caller per timestamp decides.
  frame(ts: number): boolean {
    if (ts === this.ts) return this.render;

    // estimate the display's refresh interval from consecutive rAF timestamps
    // (ignore stalls / tab-switches outside a sane range)
    if (this.prevTs >= 0) {
      const rdt = ts - this.prevTs;
      if (rdt > 3 && rdt < 40) this.refreshMs = this.refreshMs * 0.9 + rdt * 0.1;
    }
    this.prevTs = ts;

    // fold the previous render's cost into the estimate and pick the auto tier
    // (only after a render frame, so skipped near-zero-cost frames don't drag it
    // down, and only in auto mode — a pinned target shouldn't chase the estimate)
    if (this.ts >= 0 && this.prevRendered && !this.forcedFps) {
      this.emaCost = this.emaCost ? this.emaCost * 0.85 + this.costAccum * 0.15 : this.costAccum;
      const curBudget = 1000 / AUTO_FPS[this.autoIdx];
      const fasterBudget = this.autoIdx > 0 ? 1000 / AUTO_FPS[this.autoIdx - 1] : 0;
      if (this.autoIdx < AUTO_FPS.length - 1 && this.emaCost > curBudget * 0.9) this.autoIdx++;
      else if (this.autoIdx > 0 && this.emaCost < fasterBudget * 0.8) this.autoIdx--;
    }
    this.ts = ts;
    this.costAccum = 0;

    const targetFps = this.forcedFps || AUTO_FPS[this.autoIdx];
    const interval = 1000 / targetFps;
    // render once the target interval has (nearly) elapsed. The half-refresh
    // tolerance keeps vsync quantization from halving the rate — e.g. a 16.7ms
    // (60fps) target must still fire every frame on a 60Hz panel despite jitter.
    this.render = ts - this.lastRenderT >= interval - this.refreshMs * 0.5;
    if (this.render) this.lastRenderT = ts;
    this.prevRendered = this.render;
    return this.render;
  },

  addCost(ms: number) {
    this.costAccum += ms;
  },
};
