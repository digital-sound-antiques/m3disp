// Shared device-section state (OPLL / PSG / SCC, or the single SPC section):
// display order and per-section collapse. Reorderable/collapsible from both the
// channel list and the keyboard tab, mirrored live and persisted across reloads.
// Views subscribe via useSyncExternalStore.
//
// The section set depends on the player mode, and so does the persisted state:
// each mode keeps its own order/collapse under a suffixed key, and switching
// modes reloads from that mode's storage.

import { getPlayerMode, modeStorageSuffix, sectionKeys, subscribePlayerMode } from "../player-mode";

const ORDER_KEY = "m3disp.chSectionOrder";
const COLLAPSED_KEY = "m3disp.chCollapsedSections";

/** Sections for the current player mode. */
export function getSectionKeys(): string[] {
  return sectionKeys;
}

const orderKey = () => `${ORDER_KEY}${modeStorageSuffix()}`;
const collapsedKey = () => `${COLLAPSED_KEY}${modeStorageSuffix()}`;

function loadOrder(): string[] {
  const keys = sectionKeys;
  try {
    const saved = JSON.parse(localStorage.getItem(orderKey()) ?? "null");
    if (
      Array.isArray(saved) &&
      saved.length === keys.length &&
      keys.every((k) => saved.includes(k))
    ) {
      return saved;
    }
  } catch {
    /* ignore malformed storage */
  }
  return [...keys];
}

function loadCollapsed(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(collapsedKey()) ?? "[]");
    if (Array.isArray(saved)) return saved.filter((k) => typeof k === "string");
  } catch {
    /* ignore malformed storage */
  }
  return [];
}

let order: string[] = loadOrder();
let collapsed: string[] = loadCollapsed();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

// A mode switch changes both the section set and which storage slot is live.
subscribePlayerMode(() => {
  order = loadOrder();
  collapsed = loadCollapsed();
  emit();
});

export function getSectionOrder(): string[] {
  return order;
}

export function setSectionOrder(next: string[]) {
  order = next;
  localStorage.setItem(orderKey(), JSON.stringify(next));
  emit();
}

export function getCollapsedSections(): string[] {
  return collapsed;
}

export function isSectionCollapsed(key: string): boolean {
  return collapsed.includes(key);
}

export function toggleSectionCollapsed(key: string) {
  collapsed = collapsed.includes(key)
    ? collapsed.filter((k) => k !== key)
    : [...collapsed, key];
  localStorage.setItem(collapsedKey(), JSON.stringify(collapsed));
  emit();
}

/** Restore section order/collapse to defaults (all sections shown, expanded).
 *  Clears both modes so a reset is not half-applied. */
export function resetSections() {
  order = [...sectionKeys];
  collapsed = [];
  for (const suffix of ["", ".spc"]) {
    localStorage.removeItem(`${ORDER_KEY}${suffix}`);
    localStorage.removeItem(`${COLLAPSED_KEY}${suffix}`);
  }
  emit();
}

export function subscribeSectionOrder(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Kept for callers that only need the current mode's default set. */
export const SECTION_KEYS = getSectionKeys;
export { getPlayerMode };
