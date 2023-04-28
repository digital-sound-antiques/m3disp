import { KSS } from "libkss-js";
import { PlayListEntry } from "../contexts/PlayerContext";
import { BinaryDataStorage } from "./binary-data-storage";
import { MGSC, TextDecoderEncoding, detectEncoding } from "mgsc-js";

export const convertUrlIfRequired = (url: string) => {
  const m = url.match(/^(https:\/\/)?f\.msxplay\.com\/([0-9a-z]+)/i);
  if (m != null) {
    return `https://firebasestorage.googleapis.com/v0/b/msxplay-63a7a.appspot.com/o/pastebin%2F${m[2]}?alt=media`;
  }
  return url;
};

export const loadUrls = async (
  urls: string[],
  storage: BinaryDataStorage,
  setProgress?: (value: number | null) => void
): Promise<PlayListEntry[]> => {
  const entries: PlayListEntry[] = [];
  const queue: Promise<Response>[] = [];
  const countRef = { count: 0 };

  const runner = async (url: string) => {
    const res = await fetch(convertUrlIfRequired(url));
    countRef.count++;
    if (setProgress != null) {
      setProgress((0.5 * countRef.count) / urls.length);
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
      const data = compileIfRequired(new Uint8Array(await res.arrayBuffer()));
      const entry = await createPlayListEntry(storage, data, filename);
      entries.push(entry);
      if (setProgress != null && i % 10 == 0) {
        setProgress(0.5 + (0.5 * i) / urls.length);
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

export function compileIfRequired(u8: Uint8Array): Uint8Array {
  let encoding = detectEncoding(u8);
  if (encoding == "ascii") {
    encoding = "utf-8";
  }
  if (encoding == "shift-jis" || encoding == "utf-8") {
    const text = new TextDecoder(encoding).decode(u8);
    if (text.indexOf("#opll_mode") >= 0) {
      const { mgs, success } = MGSC.compile(text);
      if (success) {
        return mgs;
      } else {
        throw new Error("Compile Error");
      }
    }
  }
  return u8;
}

export async function loadFileAsText(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      try {
        const u8 = new Uint8Array(reader.result as ArrayBuffer);
        let encoding = detectEncoding(u8);
        if (encoding == "ascii" || encoding == "binary") {
          encoding = "utf-8";
        }
        const text = new TextDecoder(encoding as TextDecoderEncoding).decode(u8);
        resolve(text);
      } catch (e) {
        reject(e);
      }
    };
    reader.readAsArrayBuffer(blob);
  });
}