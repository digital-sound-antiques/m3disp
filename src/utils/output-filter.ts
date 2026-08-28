// The last thing in the audio path: the roll-off any piece of audio equipment
// has above the top of the musical range.
//
// It is here for two reasons. The obvious one is that no real amplifier and no
// real speaker reproduces 20 kHz flat, so a player that does sounds harsher
// than the machine it is emulating ever did. The less obvious one is that
// energy up there is not free even when it cannot be heard: a Bluetooth codec
// spends bits on the top sub-bands whether or not anything musical is in them,
// and those bits come out of the middle of the range where the ear is. Content
// above ~16 kHz is bought at the cost of the part that matters.
//
// Applies to every format the app plays, not just one - it stands in for the
// listener's equipment, which does not know which chip made the sound.

/** Corner frequency. Above the top of what the chips have to say, below where
 *  a codec starts spending bits on nothing. */
const CUTOFF_HZ = 18000;

/**
 * The two Q values that make a pair of biquads a fourth-order Butterworth: flat
 * to the corner, then 24 dB per octave. A single biquad would still be passing
 * most of the top octave an octave later.
 */
const BUTTERWORTH_Q = [0.5412, 1.3066];

export class OutputFilter {
  readonly input: BiquadFilterNode;
  readonly output: BiquadFilterNode;

  constructor(ctx: BaseAudioContext, cutoffHz = CUTOFF_HZ) {
    const stages = BUTTERWORTH_Q.map((q) => {
      const node = ctx.createBiquadFilter();
      node.type = "lowpass";
      node.frequency.value = cutoffHz;
      node.Q.value = q;
      return node;
    });
    stages[0].connect(stages[1]);
    this.input = stages[0];
    this.output = stages[1];
  }
}
