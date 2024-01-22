import { PlayListEntry } from "../contexts/PlayerContext";

function parseDuration(value: string | null): number | null {
  const v = value?.trim();

  if (v == null) {
    return null;
  }

  if (v == "") {
    return null;
  }

  const columns = v.split(":");
  let duration = 0;
  for (let i = 0; i < columns.length; i++) {
    duration = duration * 60 + parseInt(columns[i]);
  }

  return duration * 1000;
}

function parseLoopDuration(value: string | null, mainDurationInMs: number | null): number | null {
  if (value == null || mainDurationInMs == null) {
    return null;
  }
  if (value.trim() === "") {
    return null;
  }
  if (value.endsWith("-")) {
    const text = value.substring(0, value.length - 1);
    const durationInMs = parseDuration(text);
    if (durationInMs != null && durationInMs <= mainDurationInMs) {
      return mainDurationInMs - durationInMs;
    }
    return null;
  } else {
    return parseDuration(value);
  }
}

function parseSongNumber(value: string): number {
  if (value.startsWith("$")) {
    return parseInt(value.substring(1), 16);
  } else {
    return parseInt(value);
  }
}

export function parseNEZplugM3U(lines: string[]): PlayListEntry[] {
  const extendedPattern = /^(file[0-9]+=)?([^:]+)(::(kss|msx))?/i;
  const m3uPattern = /^.+\.[a-z0-9_\-]+$/i;

  const res: PlayListEntry[] = [];

  let plsMode = false;

  for (const line of lines) {
    if (/^\s*#/.test(line)) {
      continue;
    }
    if (line.trim() == "[playlist]") {
      plsMode = true;
      continue;
    }
    if (plsMode && !/^\s*file/i.test(line)) {
      continue;
    }

    let [head, id, title, mainDuration, loopDuration, fadeDuration] = line
      .replaceAll("\\,", "\t")
      .split(",");
    title = title?.replaceAll("\t", ",");

    let filename;
    let m = head.match(extendedPattern);
    if (m != null) {
      filename = m[2];
    } else {
      let m = head.match(m3uPattern);
      if (m != null) {
        filename = m[0];
      }
    }

    if (filename == null) continue;

    let song;
    if (id == null || id == "") {
      song = null;
    } else {
      song = parseSongNumber(id);
    }

    let mainDurationInMs = parseDuration(mainDuration);
    let loopDurationInMs = parseLoopDuration(loopDuration, mainDurationInMs);
    let fadeDurationInMs = parseDuration(fadeDuration);

    let durationInMs;
    if (mainDurationInMs != null && loopDurationInMs != null) {
      durationInMs = mainDurationInMs + loopDurationInMs;
    } else {
      durationInMs = mainDurationInMs;
    }

    res.push({
      filename,
      title,
      dataId: `ref://${filename}`,
      song,
      duration: durationInMs,
      fadeDuration: fadeDurationInMs,
    });
  }
  return res;
}

/// parse Extended M3U
export function parseExtendedM3U(lines: string[]): PlayListEntry[] {
  // #EXTM3U - file header, must be the first line of the file.
  // #EXTINC:<enc> - text encoding, must be the second line of the flie.
  // #EXTINF:<time> (key-value pair)*,Track Title
  //   ex. #EXTINF:123 song=<song> loop=<loop> fade=<fade>,Track Title
  //   - <time>: (required) maximum runtime in seconds.
  //   - <song>: (optional) sub song number.
  //   - <loop>: (optional) number of loops (if specified, runtime will be auto detected).
  //   - <fade>: (optional) fade duraion in seconds.
  const infoPattern = /^#EXTINF:([0-9]+)(.*)$/i;
  let extInfo = {};

  const entries: PlayListEntry[] = [];
  for (const line of lines) {
    const m = line.match(infoPattern);
    if (m != null) {
      let duration = parseDuration(m[1]);
      if (duration == 0) {
        duration = null;
      }
      const values = m[2].split(/(?<!\\)[,]/).map((e) => e.trim());
      const props = values[0].split(/\s+/);
      const title = values[1];
      let song: number | null | undefined;
      let loop: number | null | undefined;
      let fadeDuration: number | null | undefined;

      for (const prop of props) {
        const [key, value] = prop.split("=").map((e) => e.trim());
        if (key == "song") {
          song = parseSongNumber(value);
        } else if (key == "loop") {
          loop = parseInt(value);
        } else if (key == "fade") {
          fadeDuration = parseDuration(value);
        }
      }
      extInfo = { duration, song, loop, fadeDuration, title };
    } else if (line.trim().startsWith("#")) {
      // ignore
    } else if (line.trim() != "") {
      const filename = line.trim();
      entries.push({ ...extInfo, filename, dataId: `ref://${filename}` });
      extInfo = {};
    }
  }
  return entries;
}

export function parseM3U(text: string): PlayListEntry[] {
  const lines = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  if (lines.length > 0) {
    if (/^#EXTM3U/i.test(lines[0].trim())) {
      return parseExtendedM3U(lines);
    }
    return parseNEZplugM3U(lines);
  }
  return [];
}
