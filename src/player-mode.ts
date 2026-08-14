// Which sound engine the current track uses. The two modes never coexist: an
// SPC track shows only its 8 S-DSP voices, and everything else shows only the
// KSS devices. Rather than have every view filter a combined channel list, the
// mode swaps the definitions themselves — channelIds, the section list and the
// color tables are live bindings that follow it.
//
// Same standalone-external-store shape as channel-section-order /
// channel-visibility, so views subscribe with useSyncExternalStore.

import { useSyncExternalStore } from "react";
import type { ChannelId } from "./kss/channel-status";

export type PlayerMode = "kss" | "spc";

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

export const KSS_SECTION_KEYS = ["opll", "psg", "scc"];
export const SPC_SECTION_KEYS = ["spc"];

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
  channelIds = next === "spc" ? SPC_CHANNEL_IDS : KSS_CHANNEL_IDS;
  sectionKeys = next === "spc" ? SPC_SECTION_KEYS : KSS_SECTION_KEYS;
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
  return m === "spc" ? ".spc" : "";
}
