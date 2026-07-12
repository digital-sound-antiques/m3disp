import * as fflate from "fflate";

const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|avif)$/i;

function imageMime(name: string): string {
  switch (name.toLowerCase().split(".").pop()) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "bmp":
      return "image/bmp";
    case "avif":
      return "image/avif";
    default:
      return "application/octet-stream";
  }
}

function isZipfile(d: Uint8Array) {
  return d[0] == 0x50 && d[1] == 0x4b && d[2] == 0x03 && d[3] == 0x04;
}

function basename(p: string) {
  return p.split(/[/\\]/).pop() ?? p;
}

/**
 * Scan dropped files for images — a loose image file, or images bundled inside
 * a dropped ZIP — and return the first by name as a displayable object URL, or
 * null if none are found.
 */
export async function extractFirstImage(
  files: FileList | File[]
): Promise<{ name: string; url: string } | null> {
  const found: { name: string; bytes: Uint8Array }[] = [];

  for (const file of Array.from(files as ArrayLike<File>)) {
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      continue;
    }
    if (isZipfile(bytes)) {
      try {
        const entries = fflate.unzipSync(bytes, {
          filter: (f) => !/__MACOSX\//.test(f.name) && IMAGE_RE.test(f.name),
        });
        for (const name in entries) {
          found.push({ name: basename(name), bytes: entries[name] });
        }
      } catch {
        /* not a readable zip; ignore */
      }
    } else if (IMAGE_RE.test(file.name)) {
      found.push({ name: basename(file.name), bytes });
    }
  }

  if (found.length == 0) return null;

  found.sort((a, b) => a.name.localeCompare(b.name));
  const first = found[0];
  const url = URL.createObjectURL(new Blob([first.bytes as BlobPart], { type: imageMime(first.name) }));
  return { name: first.name, url };
}
