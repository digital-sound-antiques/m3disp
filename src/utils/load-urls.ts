import { KSS } from "libkss-js";
import { PlayListEntry } from "../contexts/PlayerContext";
import { BinaryDataStorage } from "./binary-data-storage";
import { MGSC, TextDecoderEncoding, detectEncoding } from "mgsc-js";
import { parseM3U } from "./m3u-parser";

export const convertUrlIfRequired = (url: string) => {
  // MSXplay.com
  let m = url.match(/^(https:\/\/)?f\.msxplay\.com\/([0-9a-z]+)/i);
  if (m != null) {
    return `https://firebasestorage.googleapis.com/v0/b/msxplay-63a7a.appspot.com/o/pastebin%2F${m[2]}?alt=media`;
  }

  // github.com (blob or raw URL)
  m = url.match(/^(?:https:\/\/)?github\.com\/(.+)\/(?:blob|raw)\/(.*)/);
  if (m != null) {
    return `https://raw.githubusercontent.com/${m[1]}/${m[2]}`;
  }

  return url;
};

export async function loadEntriesFromUrl(
  url: string, // m3u, pls or single data file.
  storage: BinaryDataStorage,
  progressCallback?: (value: number | null) => void
): Promise<PlayListEntry[]> {
  const targetUrl = convertUrlIfRequired(url);
  const fileUrls = [];

  if (/[^/]*\.(m3u|pls)/i.test(url)) {
    const baseUrl = targetUrl.replace(/[^/]*\.(m3u|pls)/i, "");
    const res = await fetch(targetUrl);
    const items = parseM3U(await res.text());
    for (const item of items) {
      if (/https?:\/\//.test(item.filename)) {
        fileUrls.push(item.filename);
      } else {
        fileUrls.push(`${baseUrl}${item.filename}`);
      }
    }
  } else { 
    fileUrls.push(targetUrl);
  }
  return loadFilesFromUrls(fileUrls, storage, progressCallback);
}

export const loadFilesFromUrls = async (
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

export async function loadFilesFromFileList(
  storage: BinaryDataStorage,
  files: FileList,
  progressCallback?: (value: number | null) => void
): Promise<PlayListEntry[]> {
  let m3u = false;
  for (let i = 0; i < files.length; i++) {
    if (/\.(pls|m3u)$/i.test(files[i].name)) {
      m3u = true;
    }
  }

  let entries: PlayListEntry[] = [];
  if (m3u) {
    for (let i = 0; i < files.length; i++) {
      if (/\.(pls|m3u)$/i.test(files[i].name)) {
        entries = [
          ...entries,
          ...(await loadEntriesFromM3U(storage, files[i], files, progressCallback)),
        ];
      }
    }
  } else {
    entries = await loadEntriesFromFileList(storage, files, progressCallback);
  }
  return entries;
}

const getFilename = (path: string): string => {
  return path.split(/[/\\]/).pop()!;
};

const getBasename = (path: string) => {
  const filename = path.split(/[/\\]/).pop();
  const fragments = filename!.split(".");
  fragments.pop();
  return fragments.join(".");
};

async function loadFromFile(blob: Blob): Promise<Uint8Array | string> {
  return new Promise<Uint8Array | string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      try {
        const u8 = new Uint8Array(reader.result as ArrayBuffer);
        resolve(compileIfRequired(u8));
      } catch (e) {
        reject(e);
      }
    };
    reader.readAsArrayBuffer(blob);
  });
}

const registerFile = async (
  storage: BinaryDataStorage,
  file: Blob
): Promise<{ title: string; dataId: string }> => {
  const data = await loadFromFile(file);
  if (data instanceof Uint8Array) {
    const kss = new KSS(data, file.name);
    const title = kss.getTitle();
    kss.release();
    const dataId = await storage.put(data);
    return { title, dataId };
  }
  throw new Error(`Can't load ${file.name}`);
};

export async function loadEntriesFromM3U(
  storage: BinaryDataStorage,
  m3u: File,
  files: FileList,
  progressCallback?: (value: number | null) => void
): Promise<PlayListEntry[]> {
  const text = await loadFileAsText(m3u);

  if (typeof text !== "string") {
    throw new Error("Not a text file");
  }
  const items = parseM3U(text);
  const dataIds = items.map((e) => e.dataId);
  const dataMap: {
    [key: string]: {
      dataId: string;
      title: string;
    };
  } = {};

  const processed = new Set<string>();

  for (const id of dataIds) {
    if (id.startsWith("ref://")) {
      if (processed.has(id)) continue;
      const refName = id.substring(6).toLowerCase();
      const refBasename = getBasename(refName);
      for (const file of files) {
        const name = getFilename(file.name).toLowerCase();
        if (refName == name || refBasename + ".kss" == name) {
          try {
            dataMap[id] = await registerFile(storage, file);
            processed.add(id);
          } catch (e) {
            console.error(`Can't load: ${file.name}`);
          }
        }
      }
    }
  }

  const res: PlayListEntry[] = [];
  for (const item of items) {
    const { title, dataId } = dataMap[item.dataId] ?? {};
    if (dataId != null) {
      res.push({ ...item, title: item.title ?? title, dataId });
    }
  }
  return res;
}

export async function loadEntriesFromFileList(
  storage: BinaryDataStorage,
  files: FileList,
  progressCallback?: (value: number | null) => void
): Promise<PlayListEntry[]> {
  const res: PlayListEntry[] = [];
  progressCallback?.(0.0);
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const data = await loadFromFile(file);
      if (data instanceof Uint8Array) {
        const filename = file.name.split(/[/\\]/).pop() ?? "Unknown";
        const entry = await createPlayListEntry(storage, data, filename);
        res.push(entry);
      }
    } catch (e) {
      console.warn(e);
    }
    if (i % 10 == 0) {
      progressCallback?.(i / files.length);
    }
  }
  progressCallback?.(null);
  return res;
}
