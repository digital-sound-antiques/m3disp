// The single image shown below the playlist. Sourced from dropped files (or a
// dropped ZIP's contents), or from an image dropped directly on the area.
// Held as an object URL in memory (not persisted); replaced URLs are revoked.

export type DisplayImage = { url: string; name: string } | null;

let current: DisplayImage = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function getDisplayImage(): DisplayImage {
  return current;
}

export function setDisplayImage(next: DisplayImage) {
  if (current?.url === next?.url) return;
  if (current) URL.revokeObjectURL(current.url);
  current = next;
  emit();
}

/** Raw bytes of the current image (for archiving), or null if none. */
export async function getDisplayImageBytes(): Promise<Uint8Array | null> {
  if (!current) return null;
  try {
    const res = await fetch(current.url);
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export function subscribeDisplayImage(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
