import { KSS } from "libkss-js";
import { PlayListEntry } from "../contexts/PlayerContext";
import { BinaryDataStorage } from "./binary-data-storage";

export const loadUrls = async (
  urls: string[],
  storage: BinaryDataStorage,
  setProgress?: (value: number | null) => void
): Promise<PlayListEntry[]> => {
  const entries: PlayListEntry[] = [];
  const queue: Promise<Response>[] = [];
  const countRef = { count: 0 };

  const runner = async (url: string) => {
    const res = await fetch(url);
    countRef.count++;
    if (setProgress != null) {
      setProgress(0.5 * countRef.count / urls.length);
    }
    return res;
  };

  if (setProgress != null) {
    setProgress(0.0);
  }

  for (let i = 0; i < urls.length; i++) {
    queue.push(runner(urls[i]));
  }

  await Promise.all(queue);

  for (let i = 0; i < queue.length; i++) {
    try {
      const url = urls[i];
      const res = await queue[i];
      const filename = url.split(/[/\\]/).pop() ?? "Unknown";
      const data = new Uint8Array(await res.arrayBuffer());
      const entry = await createPlayListEntry(storage, data, filename);
      entries.push(entry);
      if (setProgress != null && i % 10 == 0) {
        setProgress(0.5 + 0.5 * i / urls.length);
      }
    } catch (e) {
      console.warn(e);
    }
  }
  if (setProgress != null) {
    setProgress(null);
  }
  return entries;
};

const createPlayListEntry = async (
  storage: BinaryDataStorage,
  data: Uint8Array,
  filename: string
): Promise<PlayListEntry> => {
  const kss = new KSS(data, filename);
  let title = kss.getTitle();
  if (title == "") title = filename;
  kss.release();
  const dataId = await storage.put(data);
  return {
    title,
    filename,
    dataId,
  };
};
