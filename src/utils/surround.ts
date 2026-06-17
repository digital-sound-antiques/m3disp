export type SurroundMode = "off" | "wide" | "wide-reverb";

export const SURROUND_MODES: SurroundMode[] = ["off", "wide", "wide-reverb"];

// Pseudo-stereo "surround" effect for a mono source.
//
// The synth output is mono (a single channel), so there is no real stereo image
// to widen. Instead we synthesize width from the mono signal: a dry center
// component keeps the image solid, while a pair of short, complementary Haas
// delays with opposite-tilt high-shelf EQ feed the left/right channels to
// decorrelate them into a wide stereo field. "wide-reverb" additionally mixes
// in a light convolution reverb for a more spacious, hall-like impression.
//
// The full node graph is built once; switching modes only ramps three output
// gains, so transitions are click-free and cheap.
export class SurroundEffect {
  readonly input: GainNode;
  readonly output: GainNode;

  private readonly ctx: BaseAudioContext;
  private readonly directGain: GainNode;
  private readonly wideGain: GainNode;
  private readonly reverbGain: GainNode;
  private mode: SurroundMode = "off";

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = new GainNode(ctx);
    this.output = new GainNode(ctx);

    // Direct (bypass) path — mono passes straight through, upmixed to both
    // speakers by the output node. Active only when surround is off.
    this.directGain = new GainNode(ctx, { gain: 1 });
    this.input.connect(this.directGain).connect(this.output);

    // Pseudo-stereo widener.
    const merger = new ChannelMergerNode(ctx, { numberOfInputs: 2 });

    // A little dry mono in both channels keeps the center stable so widening
    // doesn't hollow out the sound.
    const dryGain = new GainNode(ctx, { gain: 0.6 });
    this.input.connect(dryGain);
    dryGain.connect(merger, 0, 0);
    dryGain.connect(merger, 0, 1);

    // Slightly different short delays + opposite high-shelf tilt decorrelate
    // the two sides into a wide image (Haas effect).
    const delayL = new DelayNode(ctx, { delayTime: 0.011, maxDelayTime: 0.1 });
    const delayR = new DelayNode(ctx, { delayTime: 0.019, maxDelayTime: 0.1 });
    const eqL = new BiquadFilterNode(ctx, { type: "highshelf", frequency: 3000, gain: 3 });
    const eqR = new BiquadFilterNode(ctx, { type: "highshelf", frequency: 3000, gain: -3 });
    this.input.connect(delayL).connect(eqL).connect(merger, 0, 0);
    this.input.connect(delayR).connect(eqR).connect(merger, 0, 1);

    this.wideGain = new GainNode(ctx, { gain: 0 });
    merger.connect(this.wideGain).connect(this.output);

    // Reverb layered on top of the widened signal.
    const convolver = new ConvolverNode(ctx, { buffer: makeImpulse(ctx, 2.2, 1.8) });
    this.reverbGain = new GainNode(ctx, { gain: 0 });
    merger.connect(convolver).connect(this.reverbGain).connect(this.output);
  }

  setMode(mode: SurroundMode): void {
    this.mode = mode;
    const t = this.ctx.currentTime;
    const ramp = (param: AudioParam, value: number) => param.setTargetAtTime(value, t, 0.02);
    ramp(this.directGain.gain, mode === "off" ? 1 : 0);
    ramp(this.wideGain.gain, mode === "off" ? 0 : 0.8);
    ramp(this.reverbGain.gain, mode === "wide-reverb" ? 0.33 : 0);
  }

  getMode(): SurroundMode {
    return this.mode;
  }
}

// A simple synthetic reverb impulse: stereo decaying white noise.
function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(seconds * rate));
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}
