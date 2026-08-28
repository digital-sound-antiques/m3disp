import { KSSChannelMask, DeviceName } from "./kss-device";

// A "solo" mutes every channel across all chips except the target's bits.
const ALL: KSSChannelMask = { opll: 0x3fff, psg: 0x7, scc: 0x1f, opl: 0, spc: 0xff, nsf: 0x1ff };
const NONE: KSSChannelMask = { opll: 0, psg: 0, scc: 0, opl: 0, spc: 0, nsf: 0 };
const maskEq = (a: KSSChannelMask, b: KSSChannelMask) =>
  a.opll === b.opll &&
  a.psg === b.psg &&
  a.scc === b.scc &&
  a.opl === b.opl &&
  a.spc === b.spc &&
  a.nsf === b.nsf;

/** Mask that isolates the given device bits (everything else muted). */
export function soloMaskFor(dev: DeviceName, bits: number[]): KSSChannelMask {
  let bm = 0;
  for (const b of bits) bm |= 1 << b;
  return { ...ALL, [dev]: ALL[dev] & ~bm };
}

/** Next mask when soloing the given channel bits: isolate them, or — if they
 *  are already the only unmuted channels — unmute everything (toggle off). */
export function toggleSolo(mask: KSSChannelMask, dev: DeviceName, bits: number[]): KSSChannelMask {
  const s = soloMaskFor(dev, bits);
  return maskEq(mask, s) ? { ...NONE } : s;
}
