// Adaptive frame governor, shared by every animated roll/scope canvas (the main
// piano roll, the per-channel roll grid, and the wave grid). It measures the
// total paint cost per animation frame and, when the machine can't hold 60fps,
// renders every 2nd (or 3rd) frame instead of stuttering — a steady 30/20fps
// beats erratic drops. Fast machines stay at stride 1 (full 60fps, full quality)
// so capture quality is untouched.
//
// A single shared instance is correct: these views share one frame budget, and
// when several animate at once their costs sum into one estimate and they skip
// in lockstep. The decision is made once per rAF timestamp; later callers in the
// same frame get the cached answer. Hysteresis on the stride avoids oscillation
// (raising the stride lowers work but not the intrinsic per-render cost we key on).
//
// `forcedStride` overrides the adaptive logic: 0 = auto, 1 = force 60fps (never
// skip), 2 = force 30fps, 3 = force 20fps. Set it from the UI each frame.
export const rollFrameGov = {
  ts: -1,
  costAccum: 0, // summed paint time (ms) of the views in the current frame
  emaCost: 0, // EMA of a full render's total cost
  stride: 1, // adaptive stride: render every `stride`-th frame
  forcedStride: 0, // 0 = auto; else pin the stride
  tick: 0,
  render: true,
  prevRendered: false,

  // Call at the top of each view's frame with the rAF timestamp; returns whether
  // this view should paint this frame. Only the first caller per timestamp decides.
  frame(ts: number): boolean {
    if (ts === this.ts) return this.render;
    // fold in the previous frame's cost — but only if it was a render frame (so
    // skipped, near-zero-cost frames don't drag the estimate down) and only in
    // auto mode (a pinned stride shouldn't chase the estimate)
    if (this.ts >= 0 && this.prevRendered && !this.forcedStride) {
      this.emaCost = this.emaCost ? this.emaCost * 0.85 + this.costAccum * 0.15 : this.costAccum;
      const b = 13; // ~ms budget share per render at 60fps
      if (this.stride < 3 && this.emaCost > b * this.stride) this.stride++;
      else if (this.stride > 1 && this.emaCost < b * (this.stride - 1) - 3) this.stride--;
    }
    this.ts = ts;
    this.costAccum = 0;
    this.tick++;
    const stride = this.forcedStride || this.stride;
    this.render = this.tick % stride === 0;
    this.prevRendered = this.render;
    return this.render;
  },

  addCost(ms: number) {
    this.costAccum += ms;
  },
};

// Map a scope FPS setting (0 = auto, or a target fps) to a governor stride.
export function fpsToStride(fps: number): number {
  if (fps === 60) return 1;
  if (fps === 30) return 2;
  if (fps === 20) return 3;
  return 0; // auto
}
