// Per-channel VISIBILITY (distinct from mute): hidden channels are dropped from
// the Keyboard / Roll / Scope views entirely, and a category whose channels are
// all hidden disappears header-and-all. Toggled by the checkbox in the Channels
// list. This is a display concern parallel to channel-section-order, so it's the
// same standalone external store: keyed by the flat channelIds index (opll 0-13,
// psg 14-19, scc 20-24), persisted, default = everything visible (empty set).
import { modeStorageSuffix, subscribePlayerMode } from "../player-mode";

// The flat index means something different per player mode (25 KSS channels vs
// 8 SPC voices), so each mode gets its own storage slot and the set is reloaded
// when the mode changes.
const KEY = "m3disp.chHidden";

const storageKey = () => `${KEY}${modeStorageSuffix()}`;

function load(): Set<number> {
  try {
    const raw = localStorage.getItem(storageKey());
    if (raw) return new Set<number>(JSON.parse(raw) as number[]);
  } catch {
    /* ignore malformed */
  }
  return new Set();
}

let hidden = load();
// stable snapshot array for useSyncExternalStore (identity changes only on commit)
let snapshot: number[] = [...hidden].sort((a, b) => a - b);
const listeners = new Set<() => void>();

function commit() {
  snapshot = [...hidden].sort((a, b) => a - b);
  localStorage.setItem(storageKey(), JSON.stringify(snapshot));
  for (const l of listeners) l();
}

// Switching modes swaps in that mode's own hidden set.
subscribePlayerMode(() => {
  hidden = load();
  snapshot = [...hidden].sort((a, b) => a - b);
  for (const l of listeners) l();
});

export function subscribeChannelVisibility(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Stable snapshot of the hidden flat-index set — for useSyncExternalStore. */
export function getHiddenChannels(): number[] {
  return snapshot;
}

export function isChannelHidden(flatIndex: number): boolean {
  return hidden.has(flatIndex);
}

/** True when every given flat index is hidden (a cell/row/section is "hidden"
 *  only when all of its channels are). Empty input → not hidden. */
export function areChannelsHidden(flatIndices: number[]): boolean {
  return flatIndices.length > 0 && flatIndices.every((i) => hidden.has(i));
}

export function setChannelsHidden(flatIndices: number[], hide: boolean): void {
  let changed = false;
  for (const i of flatIndices) {
    if (hide) {
      if (!hidden.has(i)) {
        hidden.add(i);
        changed = true;
      }
    } else if (hidden.delete(i)) {
      changed = true;
    }
  }
  if (changed) commit();
}

export function resetChannelVisibility(): void {
  for (const suffix of ["", ".spc"]) localStorage.removeItem(`${KEY}${suffix}`);
  if (hidden.size) {
    hidden = new Set();
    commit();
  }
}
