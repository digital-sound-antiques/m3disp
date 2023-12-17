import { PlayListEntry } from "../contexts/PlayerContext";

function parseDuration(value: string | null) {
  if (value == null) {
    return null;
  }

  if (value?.trim() === "") {
    return null;
  }

  let minus = false;
  let text = value;
  if (value.endsWith("-")) {
    text = value.substring(0, value.length - 1);
    minus = true;
  }

  const columns = text.split(":");
  let duration = 0;
  for (let i = 0; i < columns.length; i++) {
    duration = duration * 60 + parseInt(columns[i]);
  }

  return (minus ? -1 : 1) * duration * 1000;
}

/// parseM3U or Playlist
export function parseM3U(text: string): PlayListEntry[] {
  const lines = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const plsPattern = /^(file[0-9]+=)?([^:]+)(::(kss|msx))?/i;
  const m3uPattern = /^.+\.[a-z]+$/i;

  const res: PlayListEntry[] = [];
  for (const line of lines) {
    if (line.startsWith("#")) continue;

    let [head, id, title, mainDuration, loopDuration, fadeDuration] = line
      .replaceAll("\\,", "\t")
      .split(",");

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
    
    title = title?.replaceAll("\t", ",");

    let song;
    if (id == null || id == "") {
      song = null;
    } else if (id.startsWith("$")) {
      song = parseInt(id.substring(1), 16);
    } else {
      song = parseInt(id);
    }

    let mainDurationInMs = parseDuration(mainDuration);
    let loopDurationInMs = parseDuration(loopDuration);
    let fadeDurationInMs = parseDuration(fadeDuration);

    let durationInMs = mainDurationInMs;

    if (durationInMs != null && loopDurationInMs != null) {
      if (loopDurationInMs > 0) {
        durationInMs += loopDurationInMs;
      } else if (loopDurationInMs < 0 || loopDurationInMs === -0) {
        durationInMs += durationInMs + loopDurationInMs;
      } else {
        // do nothind
      }
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
