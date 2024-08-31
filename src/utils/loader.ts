import { KSS } from "libkss-js";
import { PlayListEntry } from "../contexts/PlayerContext";
import { BinaryDataStorage } from "./binary-data-storage";
import { MGSC, TextDecoderEncoding, detectEncoding } from "mgsc-js";
import { parseM3U } from "./m3u-parser";
import * as fflate from "fflate";

/// Convert a given url to a download endpoint that allows CORS access.
export function toDownloadEndpoint(url: string) {
  // f.msxplay.com
  let m = url.match(/^(https:\/\/)?f\.msxplay\.com\/([0-9a-z]+)/i);
  if (m != null) {
    return `https://firebasestorage.googleapis.com/v0/b/msxplay-63a7a.appspot.com/o/pastebin%2F${m[2]}?alt=media`;
  }

  // github.com (blob or raw URL)
  m = url.match(/^(?:https:\/\/)?github\.com\/(.+)\/(?:blob|raw)\/(.*)/);
  if (m != null) {
    return `https://raw.githubusercontent.com/${m[1]}/${m[2]}`;
  }

  // Dropbox Public Share URL
  m = url.match(/^(?:https:\/\/)?www.dropbox.com\/(.*)/);
  if (m != null) {
    return `https://dl.dropboxusercontent.com/${m[1]}`.replace('dl=0', '');
  }

  // Google Drive Public URL
  m = url.match(/^(?:https:\/\/)?drive.google.com\/file\/d\/([A-Za-z0-9_\-]+)/);
  if (m != null) {
    return `https://www.googleapis.com/drive/v3/files/${m[1]}?alt=media&key=${
      import.meta.env.VITE_GD_API_KEY
    }`;
  }
  return url;
}

export async function loadTextFromUrl(url: string): Promise<string> {
  const targetUrl = toDownloadEndpoint(url);
  const res = await fetch(targetUrl);
  if (res.status == 200) {
    const blob = await res.blob();
    return loadBlobAsText(blob);
  } else {
    throw new Error(res.statusText);
  }
}

function isZipfile(data: Uint8Array) {
  return data[0] == 0x50 && data[1] == 0x4b && data[2] == 0x03 && data[3] == 0x04;
}

function _unzip(data: Uint8Array): { [key: string]: Uint8Array } {
  return fflate.unzipSync(data, {
    filter: (file) => {
      if (/__MACOSX\//.test(file.name)) {
        return false;
      }
      return /\.(mgs|bgm|opx|mpk|kss|mbm|m3u|m3u8|pls)$/i.test(file.name);
    },
  });
}

export async function loadEntriesFromZip(
  data: Uint8Array | Blob | ArrayBuffer,
  storage: BinaryDataStorage,
  progressCallback?: (value: number | null) => void
): Promise<PlayListEntry[]> {
  let u8a: Uint8Array;
  if (data instanceof Blob) {
    const ab = await data.arrayBuffer();
    u8a = new Uint8Array(ab);
  } else if (data instanceof ArrayBuffer) {
    u8a = new Uint8Array(data);
  } else {
    u8a = data;
  }
  const unzipped = _unzip(u8a);
  const files: File[] = [];
  for (const name in unzipped) {
    const data = unzipped[name];
    files.push(new File([data], name));
  }
  return createEntriesFromFileList(storage, files, progressCallback);
}

export async function loadEntriesFromUrl(
  url: string, // single data, .m3u, .pls or archive (.zip) file.
  storage: BinaryDataStorage,
  progressCallback?: (value: number | null) => void
): Promise<PlayListEntry[]> {
  const targetUrl = toDownloadEndpoint(url);

  console.log(targetUrl);

  try {
    progressCallback?.(0.0);
    
    if (/[^/]*\.(m3u|m3u8|pls)$/i.test(url)) {
      // .m3u or .pls
      const baseUrl = targetUrl.replace(/[^/]*\.(m3u|m3u8|pls)/i, "");
      const text = await loadTextFromUrl(targetUrl);
      const items = parseM3U(text);
      const fileUrls = [];
      for (const item of items) {
        if (/https?:\/\//.test(item.filename)) {
          fileUrls.push(item.filename);
        } else {
          fileUrls.push(`${baseUrl}${item.filename}`);
        }
      }
      return loadFilesFromUrls(fileUrls, storage, progressCallback);
    } else if (/[^/]*\.zip$/i.test(url)) {
      // .zip file
      const res = await fetch(targetUrl);
      if (res.status == 200) {
        return loadEntriesFromZip(await res.blob(), storage, progressCallback);
      } else {
        throw new Error(res.statusText);
      }
    } else {
      // single data file
      const fileUrls = [];
      fileUrls.push(targetUrl);
      return loadFilesFromUrls(fileUrls, storage, progressCallback);
    }
  } finally {
    progressCallback?.(null);
  }
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
    const res = await fetch(toDownloadEndpoint(url));
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
  if (encoding == "euc-jp") {
    // MML can't be euc-jp, so we treat this as shift-jis
    encoding = "shift-jis"
  }

  if (encoding == "shift-jis" || encoding == "utf-8") {
    const text = new TextDecoder(encoding).decode(u8);
    if (text.toLowerCase().indexOf("#opll_mode") >= 0) {
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

export async function loadBlobAsText(blob: Blob): Promise<string> {
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

export async function createEntriesFromFileList(
  storage: BinaryDataStorage,
  files: File[] | FileList,
  progressCallback?: (value: number | null) => void
): Promise<PlayListEntry[]> {
  let m3u = false;
  for (let i = 0; i < files.length; i++) {
    if (/\.(pls|m3u|m3u8?)$/i.test(files[i].name)) {
      m3u = true;
    }
  }

  let entries: PlayListEntry[] = [];
  if (m3u) {
    for (let i = 0; i < files.length; i++) {
      if (/\.(pls|m3u|m3u8)$/i.test(files[i].name)) {
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

function getDirname(path: string): string {
  const fragments = path.split(/[/\\]/);
  if (fragments.length >= 2) {
    fragments.pop();
    return fragments.join("/") + "/";
  }
  return "";
}

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
  files: File[] | FileList,
  progressCallback?: (value: number | null) => void
): Promise<PlayListEntry[]> {
  const text = await loadBlobAsText(m3u);

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

  const m3uRoot = getDirname(m3u.name);

  const processed = new Set<string>();

  for (const id of dataIds) {
    if (id.startsWith("ref://")) {
      if (processed.has(id)) continue;
      const refName = `${m3uRoot}${id.substring(6).toLowerCase()}`;
      const refNameAlt = refName.replace(/\.[^/]+$/, "") + ".kss";
      for (const file of files) {
        const name = file.name.toLowerCase();
        if (refName == name || refNameAlt == name) {
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
  files: File[] | FileList,
  progressCallback?: (value: number | null) => void
): Promise<PlayListEntry[]> {
  const res: PlayListEntry[] = [];
  progressCallback?.(0.0);
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const data = await loadFromFile(file);
      if (data instanceof Uint8Array) {
        if (isZipfile(data)) {
          const entries = await loadEntriesFromZip(data, storage, progressCallback);
          for (const entry of entries) {
            res.push(entry);
          }
        } else {
          const filename = file.name.split(/[/\\]/).pop() ?? "Unknown";
          const entry = await createPlayListEntry(storage, data, filename);
          res.push(entry);
        }
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
