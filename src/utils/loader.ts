import * as fflate from "fflate";
import { is7zFile, un7z } from "./sevenzip/archive";
import { KSS } from "libkss-js";
import { MGSC, TextDecoderEncoding, detectEncoding } from "mgsc-js";
import { PlayListEntry } from "../contexts/PlayerContext";
import { BinaryDataStorage } from "./binary-data-storage";
import { parseM3U } from "./m3u-parser";
import { isSPCFile, parseSPC } from "spc700-js";
import { isNSFFile, parseNSF, trackTitle } from "nsf-js";
import { HESPlayer, isHESFile, parseHES } from "hes-js";

/// Convert a given url to a download endpoint that allows CORS access.
export function toDownloadEndpoint(url: string) {
  // f.msxplay.com
  let m = url.match(/^(https:\/\/)?f\.msxplay\.com\/([0-9a-z_\-]+)/i);
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
    return `https://dl.dropboxusercontent.com/${m[1]}`.replace(/&?dl=0/, "");
  }

  // Google Drive Public URL
  m = url.match(/^(?:https:\/\/)?drive\.google\.com\/file\/d\/([A-Za-z0-9_\-]+)/);
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

/** Either kind of archive this can open. */
export function isArchive(data: Uint8Array) {
  return isZipfile(data) || is7zFile(data);
}

/** What is worth taking out of an archive. */
const ARCHIVE_MEMBER = /\.(mgs|bgm|opx|mpk|kss|mbm|spc|nsfe?|hes|m3u8?|pls)$/i;

/** Skip the resource forks a Mac puts in a zip, and directory entries. */
function wantedMember(name: string): boolean {
  if (/__MACOSX\//.test(name)) return false;
  if (name.endsWith("/")) return false;
  return ARCHIVE_MEMBER.test(name);
}

/** Unpack either kind of archive into its members, by name. */
function _unzip(data: Uint8Array): { [key: string]: Uint8Array } {
  if (is7zFile(data)) {
    const out: { [key: string]: Uint8Array } = {};
    for (const entry of un7z(data, wantedMember)) out[entry.name] = entry.data;
    return out;
  }
  return fflate.unzipSync(data, { filter: (file) => wantedMember(file.name) });
}

/** Unpack an archive - .zip or .7z - and load whatever music is inside it. */
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
    files.push(new File([data as BlobPart], name));
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

    const res = await fetch(targetUrl);

    if (res.status != 200) {
      throw new Error(res.statusText);
    }

    const contentType = res.headers.get("content-type")?.replace(/;.*$/, "").trim(); // strip charset section
    const ab = await res.arrayBuffer();
    const u8a = new Uint8Array(ab);

    console.log(contentType);

    // an archive: .zip or .7z
    if (isArchive(u8a)) {
      return loadEntriesFromZip(u8a, storage, progressCallback);
    }

    if (contentType == "text/plain") {
      const text = loadBufferAsText(ab);
      if (!/#opll_mode/.test(text)) {
        // play list
        const baseUrl = targetUrl.replace(/[^/]*\.(m3u8?|pls)/i, "");
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
      }
    }

    // mml or binary
    const fileUrls = [];
    fileUrls.push(targetUrl);
    return loadFilesFromUrls(fileUrls, storage, progressCallback);
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
      entries.push(...(await createPlayListEntries(storage, data, filename)));
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

/** Track numbers a HES file could hold: the driver takes one byte. */
const HES_TRACK_LIMIT = 256;

/** Machine time each candidate track is given to start making a sound. */
const HES_PROBE_SECONDS = 0.3;

/**
 * Find which track numbers a HES file actually plays.
 *
 * Unlike an NSF, a HES file states neither how many tracks it holds nor what
 * they are numbered - its driver simply takes a byte and does whatever it does.
 * Rips ship an .m3u naming them, and when one is loaded that is what is used;
 * dropped on its own, the only way to know is to ask the driver. So each
 * number is started and given a fraction of a second of machine time, and the
 * ones that make a sound become entries.
 *
 * This finds more than an .m3u lists, because it finds the sound effects too.
 * They are in the file, so they are offered.
 */
async function findHESTracks(data: Uint8Array): Promise<number[]> {
  const found: number[] = [];
  try {
    const file = parseHES(data);
    const frames = Math.floor(44100 * HES_PROBE_SECONDS);
    for (let track = 0; track < HES_TRACK_LIMIT; track++) {
      const player = new HESPlayer({ sampleRate: 44100 });
      // The scanner's shortcut: no audio comes out of a probe, so there is no
      // point settling the filters at the end of it.
      player.filterPrimeOnSkip = false;
      player.load(file, track);
      player.skip(frames);
      if (player.getChannelStatusArray().some((c) => c.active)) found.push(track);
      // Let the page breathe: this is a second or two of work on the thread
      // that draws.
      if ((track & 0x0f) === 0x0f) await new Promise((r) => setTimeout(r, 0));
    }
  } catch (e) {
    console.warn(e);
  }
  // A file whose driver answers nothing still gets its own entry, so it can be
  // played and heard to be silent rather than vanishing.
  return found.length > 0 ? found : [0];
}

/**
 * Turn one file into playlist entries.
 *
 * Usually that is one entry, but an NSF is a program holding any number of
 * tracks and it says how many, so each becomes its own entry - unlike KSS, where
 * the sub-song count is not recorded anywhere and only an .m3u can name them.
 * NSFe files carry per-track titles and lengths, which are used when present.
 */
const createPlayListEntries = async (
  storage: BinaryDataStorage,
  data: Uint8Array,
  filename: string
): Promise<PlayListEntry[]> => {
  if (isNSFFile(data)) {
    const nsf = parseNSF(data);
    const dataId = await storage.put(data);
    const album = nsf.title || filename;
    const entries: PlayListEntry[] = [];
    for (let track = 0; track < nsf.trackCount; track++) {
      const named = nsf.trackLabels[track];
      const ms = nsf.trackTimes[track];
      entries.push({
        title:
          named != null && named !== ""
            ? named
            : nsf.trackCount > 1
              ? `${album} (${trackTitle(nsf, track)})`
              : album,
        filename,
        dataId,
        song: track,
        duration: ms != null && ms > 0 ? ms : undefined,
        format: "nsf",
      });
    }
    return entries;
  }

  if (formatOf(data) === "hes") {
    const dataId = await storage.put(data);
    const tracks = await findHESTracks(data);
    return tracks.map((track) => ({
      title: tracks.length > 1 ? `${filename} (Track $${track.toString(16).toUpperCase().padStart(2, "0")})` : filename,
      filename,
      dataId,
      song: track,
      format: "hes" as const,
    }));
  }

  let title: string;
  const isSPC = isSPCFile(data);
  if (isSPC) {
    // KSS can't parse an SPC dump; its title lives in the ID666/xid6 tags.
    const { tags } = parseSPC(data);
    title = tags.title || tags.game || filename;
  } else {
    const kss = new KSS(data, filename);
    title = kss.getTitle();
    if (title == "") title = filename;
    kss.release();
  }
  const dataId = await storage.put(data);
  return [
    {
      title,
      filename,
      dataId,
      format: isSPC ? "spc" : undefined,
    },
  ];
};

export function compileIfRequired(u8: Uint8Array): Uint8Array {
  let encoding = detectEncoding(u8);
  if (encoding == "ascii") {
    encoding = "utf-8";
  }
  if (encoding == "euc-jp") {
    // MML can't be euc-jp, so we treat this as shift-jis
    encoding = "shift-jis";
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

function loadBufferAsText(input: Uint8Array | ArrayBuffer | ArrayBufferLike): string {
  let u8: Uint8Array;
  if (input instanceof Uint8Array) {
    u8 = input;
  } else {
    u8 = new Uint8Array(input);
  }
  let encoding = detectEncoding(u8);
  if (encoding == "ascii" || encoding == "binary") {
    encoding = "utf-8";
  }
  return new TextDecoder(encoding as TextDecoderEncoding).decode(u8);
}

export async function loadBlobAsText(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      try {
        const text = loadBufferAsText(reader.result as ArrayBuffer);
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
    if (/\.(pls|m3u8?)$/i.test(files[i].name)) {
      m3u = true;
    }
  }

  let entries: PlayListEntry[] = [];
  if (m3u) {
    for (let i = 0; i < files.length; i++) {
      if (/\.(pls|m3u8?)$/i.test(files[i].name)) {
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

/**
 * Store one file a playlist refers to, and take a title from it.
 *
 * Only KSS carries a title where libkss can read it. The other formats are
 * handed to it too if it is asked, and it throws - which used to lose the file
 * entirely, so an .m3u beside a .hes or a .nsf resolved to nothing. Their names
 * come from the playlist anyway, so a title is not something to fail over.
 */
/** Which of the players a file belongs to, from its own contents. */
function formatOf(data: Uint8Array): PlayListEntry["format"] {
  if (isHESFile(data)) return "hes";
  if (isNSFFile(data)) return "nsf";
  if (isSPCFile(data)) return "spc";
  return undefined;
}

const registerFile = async (
  storage: BinaryDataStorage,
  file: File
): Promise<{ title: string; dataId: string; format: PlayListEntry["format"] }> => {
  const data = await loadFromFile(file);
  if (!(data instanceof Uint8Array)) throw new Error(`Can't load ${file.name}`);

  const format = formatOf(data);
  let title = "";
  if (format == null) {
    try {
      const kss = new KSS(data, file.name);
      title = kss.getTitle();
      kss.release();
    } catch {
      // Not something libkss knows; the playlist names it instead.
    }
  }
  const dataId = await storage.put(data);
  return { title, dataId, format };
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
      format: PlayListEntry["format"];
    };
  } = {};

  // Lower case, because that is what the names are compared against below: a
  // playlist inside a subdirectory otherwise matches nothing, its own
  // directory being the one part of the path that kept its capitals.
  const m3uRoot = getDirname(m3u.name).toLowerCase();

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
    const { title, dataId, format } = dataMap[item.dataId] ?? {};
    if (dataId != null) {
      res.push({ ...item, title: item.title ?? title, dataId, format });
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
        if (isArchive(data)) {
          const entries = await loadEntriesFromZip(data, storage, progressCallback);
          for (const entry of entries) {
            res.push(entry);
          }
        } else {
          const filename = file.name.split(/[/\\]/).pop() ?? "Unknown";
          res.push(...(await createPlayListEntries(storage, data, filename)));
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
