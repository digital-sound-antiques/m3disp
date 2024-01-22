import { PlayListEntry } from "../contexts/PlayerContext";
import { BinaryDataStorage } from "./binary-data-storage";
import * as fflate from "fflate";

function extractExtension(name: string): string {
  const m = name.toLowerCase().match(/(\.[a-z0-9_\-]+)$/i);
  if (m != null) {
    if (m[1] == ".zip") {
      return ".kss";
    }
    return m[1];
  }
  return "";
}

function createExtendedM3U(entries: PlayListEntry[]) {
  const lines = ["#EXTM3U", "#EXTENC:UTF-8"];
  for (const entry of entries) {
    const props: { [key: string]: any } = {
      ...(entry.song != null ? { song: entry.song } : null),
      ...(entry.fadeDuration != null ? { fade: entry.fadeDuration } : null),
    };
    const kv = [];
    for (let key in props) {
      kv.push(`${key}=${props[key]}`);
    }
    const time = Math.round((entry.duration ?? 0) / 1000);
    const info = [`#EXTINF:${time}`];
    if (kv.length > 0) {
      info.push(` ${kv.join(" ")}`);
    }
    if (entry.title != null) {
      info.push(`,${entry.title}`);
    }
    lines.push(info.join(""));
    const ext = extractExtension(entry.filename);
    lines.push(`${entry.dataId}${ext}`);
  }
  return lines.join("\n");
}

export function saveAs(input: Uint8Array | string, filename: string) {
  const blob = new Blob([input]);
  const a = document.createElement("a");
  a.href = window.URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

export async function zipEntries(
  entries: PlayListEntry[],
  storage: BinaryDataStorage,
  progressCallback?: (value: number | null) => void
): Promise<Uint8Array> {
  const m3u = createExtendedM3U(entries);
  const data: fflate.Zippable = {};
  data["index.m3u"] = new TextEncoder().encode(m3u);
  for (const entry of entries) {
    const ext = extractExtension(entry.filename);
    data[`${entry.dataId}${ext}`] = await storage.get(entry.dataId);
  }
  const zip = fflate.zipSync(data);
  return zip;
}

export async function saveEntriesAsZip(
  entries: PlayListEntry[],
  storage: BinaryDataStorage,
  progressCallback?: (value: number | null) => void
) {
  const zip = await zipEntries(entries, storage, progressCallback);
  saveAs(zip, "m3disp.zip");
}
