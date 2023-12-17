import { PlayListEntry } from "../contexts/PlayerContext";

function parseDuration(value: string | null): number | null {
  if (value == null) {
    return null;
  }

  if (value.trim() === "") {
    return null;
  }

  const columns = value.split(":");
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

/// parse .m3u or Winamp .pls
export function parseM3U(text: string): PlayListEntry[] {
  const lines = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const plsPattern = /^(file[0-9]+=)?([^:]+)(::(kss|msx))?/i;
  const m3uPattern = /^.+\.[a-z0-9_\-]+$/i;

  const res: PlayListEntry[] = [];

  for (const line of lines) {
    if (line.startsWith("#")) continue;

    let [head, id, title, mainDuration, loopDuration, fadeDuration] = line
      .replaceAll("\\,", "\t")
      .split(",");
    title = title?.replaceAll("\t", ",");

    let filename;
    let m = head.match(plsPattern);
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
    } else if (id.startsWith("$")) {
      song = parseInt(id.substring(1), 16);
    } else {
      song = parseInt(id);
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
