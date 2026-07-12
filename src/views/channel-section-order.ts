// Shared device-section state (OPLL / PSG / SCC): display order and per-section
// collapse. Reorderable/collapsible from both the channel list and the keyboard
// tab, mirrored live and persisted across reloads. Views subscribe via
// useSyncExternalStore.

export const SECTION_KEYS = ["opll", "psg", "scc"] as const;
const ORDER_KEY = "m3disp.chSectionOrder";
const COLLAPSED_KEY = "m3disp.chCollapsedSections";

function loadOrder(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(ORDER_KEY) ?? "null");
    if (
      Array.isArray(saved) &&
      saved.length === SECTION_KEYS.length &&
      SECTION_KEYS.every((k) => saved.includes(k))
    ) {
      return saved;
    }
  } catch {
    /* ignore malformed storage */
  }
  return [...SECTION_KEYS];
}

function loadCollapsed(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
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

export function getSectionOrder(): string[] {
  return order;
}

export function setSectionOrder(next: string[]) {
  order = next;
  localStorage.setItem(ORDER_KEY, JSON.stringify(next));
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
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed));
  emit();
}

/** Restore section order/collapse to defaults (all sections shown, expanded). */
export function resetSections() {
  order = [...SECTION_KEYS];
  collapsed = [];
  localStorage.removeItem(ORDER_KEY);
  localStorage.removeItem(COLLAPSED_KEY);
  emit();
}

export function subscribeSectionOrder(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
