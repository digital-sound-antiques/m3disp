// Shared device-section order (OPLL / PSG / SCC), reorderable by drag in the
// channel list and mirrored live in the keyboard dialog. Persisted so it
// survives reloads. Both views subscribe via useSyncExternalStore.

export const SECTION_KEYS = ["opll", "psg", "scc"] as const;
const ORDER_KEY = "m3disp.chSectionOrder";

function load(): string[] {
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

let order: string[] = load();
const listeners = new Set<() => void>();

export function getSectionOrder(): string[] {
  return order;
}

export function setSectionOrder(next: string[]) {
  order = next;
  localStorage.setItem(ORDER_KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}

export function subscribeSectionOrder(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
