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

function createExtendedM3U(entries: (PlayListEntry & { exportName?: string | null })[]) {
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
    if (entry.exportName != null) {
      lines.push(entry.exportName);
    } else {
      const ext = extractExtension(entry.filename);
      lines.push(`${entry.dataId}${ext}`);
    }
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

function insertCounterToBasename(filename: string, count: number) {
  const segments = filename.split(".");
  if (segments.length >= 2) {
    const ext = segments.pop();
    return segments.join(".") + ` (${count})` + "." + ext;
  }
  return `${filename} (${count})`;
}

/** Determine filename for exporting. Duplicated file names are taken into account. */
function withExportName(entries: PlayListEntry[]): (PlayListEntry & { exportName: string })[] {
  const res: (PlayListEntry & { exportName: string })[] = [];
  const dataIdToExportName: { [key: string]: string } = {};
  const counterMap: { [key: string]: number } = {};

  for (const entry of entries) {
    const { filename, dataId } = entry;
    let exportName = dataIdToExportName[dataId];
    if (exportName != null) {
      res.push({ ...entry, exportName: dataIdToExportName[dataId] });
    } else {
      // suffix ' ($count)' if the same export name already exists for a different file.
      const count = counterMap[filename] != null ? counterMap[filename] + 1 : null;
      exportName = count != null ? insertCounterToBasename(filename, count) : filename;
      res.push({ ...entry, exportName });
      counterMap[filename] = count ?? 1;
      dataIdToExportName[dataId] = exportName;
    }
  }

  return res;
}

export async function zipEntries(
  entries: PlayListEntry[],
  storage: BinaryDataStorage,
  progressCallback?: (value: number | null) => void
): Promise<Uint8Array> {
  const targets = withExportName(entries);
  const m3u = createExtendedM3U(targets);
  const data: fflate.Zippable = {};
  data["index.m3u"] = new TextEncoder().encode(m3u);
  for (const entry of targets) {
    data[entry.exportName] = await storage.get(entry.dataId);
  }
  console.log(data);
  const zip = fflate.zipSync(data);
  return zip;
}

export async function saveEntriesAsZip(
  filename: string,
  entries: PlayListEntry[],
  storage: BinaryDataStorage,
  progressCallback?: (value: number | null) => void
) {
  const zip = await zipEntries(entries, storage, progressCallback);
  saveAs(zip, filename);
}
