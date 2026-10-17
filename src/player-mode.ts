// Which sound engine the current track uses. The modes never coexist: an SPC
// track shows only its 8 S-DSP voices, an NSF track only its 6 NES channels, and
// everything else only the KSS devices. Rather than have every view filter a
// combined channel list, the mode swaps the definitions themselves — channelIds,
// the section list and the color tables are live bindings that follow it.
//
// Same standalone-external-store shape as channel-section-order /
// channel-visibility, so views subscribe with useSyncExternalStore.

import { useSyncExternalStore } from "react";
import type { ChannelId } from "./kss/channel-status";

export type PlayerMode = "kss" | "spc" | "nsf" | "hes";

export const KSS_CHANNEL_IDS: ChannelId[] = [
  { device: "opll", index: 0 },
  { device: "opll", index: 1 },
  { device: "opll", index: 2 },
  { device: "opll", index: 3 },
  { device: "opll", index: 4 },
  { device: "opll", index: 5 },
  { device: "opll", index: 6 },
  { device: "opll", index: 7 },
  { device: "opll", index: 8 },
  { device: "opll", index: 9 },
  { device: "opll", index: 10 },
  { device: "opll", index: 11 },
  { device: "opll", index: 12 },
  { device: "opll", index: 13 },
  { device: "psg", index: 0 },
  { device: "psg", index: 1 },
  { device: "psg", index: 2 },
  { device: "psg", index: 3 },
  { device: "psg", index: 4 },
  { device: "psg", index: 5 },
  { device: "scc", index: 0 },
  { device: "scc", index: 1 },
  { device: "scc", index: 2 },
  { device: "scc", index: 3 },
  { device: "scc", index: 4 },
];

export const SPC_CHANNEL_IDS: ChannelId[] = [
  { device: "spc", index: 0 },
  { device: "spc", index: 1 },
  { device: "spc", index: 2 },
  { device: "spc", index: 3 },
  { device: "spc", index: 4 },
  { device: "spc", index: 5 },
  { device: "spc", index: 6 },
  { device: "spc", index: 7 },
];

/**
 * The NES sound unit, in the order the hardware's registers run, followed by the
 * VRC6, VRC7 and N163 channels a cartridge may add.
 *
 * The list is fixed, but the channels of chips a file does not declare are
 * marked absent per track (see setAbsentChannels), and the views leave them out.
 */
export const NSF_CHANNEL_IDS: ChannelId[] = [
  { device: "nsf", index: 0 },
  { device: "nsf", index: 1 },
  { device: "nsf", index: 2 },
  { device: "nsf", index: 3 },
  { device: "nsf", index: 4 },
  { device: "nsf", index: 5 },
  { device: "nsf", index: 6 },
  { device: "nsf", index: 7 },
  { device: "nsf", index: 8 },
  { device: "nsf", index: 9 },
  { device: "nsf", index: 10 },
  { device: "nsf", index: 11 },
  { device: "nsf", index: 12 },
  { device: "nsf", index: 13 },
  { device: "nsf", index: 14 },
  { device: "nsf", index: 15 },
  { device: "nsf", index: 16 },
  { device: "nsf", index: 17 },
  { device: "nsf", index: 18 },
  { device: "nsf", index: 19 },
  { device: "nsf", index: 20 },
  { device: "nsf", index: 21 },
  { device: "nsf", index: 22 },
];

/** The PC Engine's six PSG channels, all alike: any of them can play a
 *  waveform, the last two can make noise, the second can be spent on modulating
 *  the first. */
export const HES_CHANNEL_IDS: ChannelId[] = [
  { device: "hes", index: 0 },
  { device: "hes", index: 1 },
  { device: "hes", index: 2 },
  { device: "hes", index: 3 },
  { device: "hes", index: 4 },
  { device: "hes", index: 5 },
];

export const KSS_SECTION_KEYS = ["opll", "psg", "scc"];
export const SPC_SECTION_KEYS = ["spc"];
export const NSF_SECTION_KEYS = ["nsf", "vrc6", "vrc7", "n163"];
export const HES_SECTION_KEYS = ["hes"];

/** Eight hues spread evenly around the wheel at the same perceptual lightness
 *  and chroma as the KSS palette, so the two modes read as one design. */
export const SPC_CHANNEL_COLORS: string[] = [
  "#e18516", // orange
  "#b99c1c", // yellow
  "#47b95f", // green
  "#1db98d", // teal
  "#1fb3ba", // cyan
  "#20ace5", // blue
  "#968efa", // violet
  "#dd72c2", // pink
];

/** Six hues from the same wheel as the S-DSP palette, at the same perceptual
 *  lightness and chroma, so every mode reads as one design. The two pulses take
 *  neighbouring hues because they are a pair; noise and the DMC — the percussion
 *  pair — take the far side. */
/** Six hues from the same wheel, evenly spread: the PSG's channels have no
 *  fixed roles, so nothing here should suggest one is the bass or the lead. */
export const HES_CHANNEL_COLORS: string[] = [
  "#e18516", // orange
  "#b99c1c", // yellow
  "#47b95f", // green
  "#1fb3ba", // cyan
  "#968efa", // violet
  "#dd72c2", // pink
];

export const NSF_CHANNEL_COLORS: string[] = [
  "#e18516", // pulse 1     orange
  "#b99c1c", // pulse 2     yellow
  "#47b95f", // triangle    green
  "#968efa", // noise       violet
  "#dd72c2", // dmc         pink
  "#1fb3ba", // fds         cyan
  "#20ace5", // vrc6 pulse1 blue
  "#4fa1fb", // vrc6 pulse2 light blue
  "#1db98d", // vrc6 saw    teal
  // The VRC7's six are interchangeable FM channels, so they take the OPLL's
  // first six colours: the same chip family, shown the same way.
  "#b99c1c", // vrc7 fm1
  "#20ace5", // vrc7 fm2
  "#47b95f", // vrc7 fm3
  "#968efa", // vrc7 fm4
  "#e18516", // vrc7 fm5
  "#1fb3ba", // vrc7 fm6
  // The N163's eight are interchangeable wavetable channels, so they take the
  // S-DSP's eight hues, spread evenly around the wheel.
  "#e18516", // n163 ch1
  "#b99c1c", // n163 ch2
  "#47b95f", // n163 ch3
  "#1db98d", // n163 ch4
  "#1fbb6f", // n163 ch5
  "#20ace5", // n163 ch6
  "#968efa", // n163 ch7
  "#dd72c2", // n163 ch8
];

const MODES: Record<PlayerMode, { channels: ChannelId[]; sections: string[] }> = {
  kss: { channels: KSS_CHANNEL_IDS, sections: KSS_SECTION_KEYS },
  spc: { channels: SPC_CHANNEL_IDS, sections: SPC_SECTION_KEYS },
  nsf: { channels: NSF_CHANNEL_IDS, sections: NSF_SECTION_KEYS },
  hes: { channels: HES_CHANNEL_IDS, sections: HES_SECTION_KEYS },
};

let mode: PlayerMode = "kss";

/** Channel list for the current mode. Live binding — importers see the swap. */
export let channelIds: ChannelId[] = KSS_CHANNEL_IDS;
/** Device sections for the current mode. Live binding. */
export let sectionKeys: string[] = KSS_SECTION_KEYS;

const listeners = new Set<() => void>();

export function getPlayerMode(): PlayerMode {
  return mode;
}

export function setPlayerMode(next: PlayerMode): void {
  if (mode === next) return;
  mode = next;
  channelIds = MODES[next].channels;
  sectionKeys = MODES[next].sections;
  for (const l of listeners) l();
}

export function subscribePlayerMode(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function usePlayerMode(): PlayerMode {
  return useSyncExternalStore(subscribePlayerMode, getPlayerMode, getPlayerMode);
}

/** Suffix for persisted per-mode layout keys. The flat channel index means
 *  something different in each mode, so their stored state must not collide. */
export function modeStorageSuffix(m: PlayerMode = mode): string {
  return m === "kss" ? "" : `.${m}`;
}
