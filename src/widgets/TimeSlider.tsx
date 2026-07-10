import { useContext, useEffect, useRef, useState } from "react";

import { AudioPlayerProgress } from "webaudio-stream-player";
import { PlayerContext } from "../contexts/PlayerContext";

const DEFAULT_FADE_MS = 5000;

function toTimeString(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Red played region up to the head, light-gray keyframe-buffered region, dark
 *  unbuffered — as an inline linear-gradient behind the native range track. */
function seekBackground(current: number, buffered: number, max: number): string {
  const played = (Math.min(current, max) / Math.max(max, 1)) * 100;
  const buf = Math.max(played, (Math.min(buffered, max) / Math.max(max, 1)) * 100);
  return `linear-gradient(to right, #ff4d4f ${played}%, #6b7480 ${played}%, #6b7480 ${buf}%, #30363d ${buf}%)`;
}

export function TimeSlider() {
  const context = useContext(PlayerContext);
  const [currentSec, setCurrentSec] = useState(0);
  const [bufferedSec, setBufferedSec] = useState(0);
  const [seekingTo, setSeekingTo] = useState<number | null>(null);
  const seekingRef = useRef<number | null>(null);
  seekingRef.current = seekingTo;

  const rate = context.audioContext?.sampleRate ?? 44100;

  useEffect(() => {
    const handleProgress = (ev: CustomEvent<AudioPlayerProgress>) => {
      const player = context.player;
      const absSec = (player.seekBaseFrame + (ev.detail.renderer.currentFrame ?? 0)) / rate;
      setCurrentSec(absSec);
      setBufferedSec(player.bufferedFrame / rate);
      if (seekingRef.current != null && Math.abs(absSec - seekingRef.current) < 1) {
        setSeekingTo(null);
      }
    };
    context.player.addEventListener("progress", handleProgress);
    return () => context.player.removeEventListener("progress", handleProgress);
  }, [context.player, rate]);

  // Prefer the actual length the decoder found (intro + loops + fade). Until it
  // is known, fall back to the per-entry duration or the global cap estimate.
  const entry = context.currentEntry;
  const capMs =
    entry?.duration != null
      ? entry.duration + (entry.fadeDuration ?? DEFAULT_FADE_MS)
      : context.defaultDuration;
  const reportedSec = context.player.totalFrame > 0 ? context.player.totalFrame / rate : 0;
  // while the decoder is still measuring the real length, keep a moving slider
  // range from the estimate but show the total as "measuring" rather than 5:00.
  const measuring = entry != null && reportedSec <= 0;
  const totalSec = reportedSec > 0 ? reportedSec : capMs / 1000;

  const displaySec = seekingTo ?? currentSec;
  const maxSec = Math.max(totalSec, displaySec, 1);

  return (
    <div className="transport-seek">
      <div className="time">
        <span>{toTimeString(displaySec)}</span>
        <input
          className="seek"
          type="range"
          min={0}
          max={maxSec}
          step={0.05}
          value={Math.min(displaySec, maxSec)}
          disabled={entry == null}
          style={{ background: seekBackground(displaySec, bufferedSec, maxSec) }}
          onChange={(e) => setSeekingTo(Number(e.target.value))}
          onPointerUp={(e) => context.player.seek(Number((e.target as HTMLInputElement).value))}
          onKeyUp={(e) => {
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
              context.player.seek(Number((e.target as HTMLInputElement).value));
            }
          }}
        />
        <span className={measuring ? "measuring" : undefined}>
          {measuring ? "計測中…" : toTimeString(totalSec)}
        </span>
      </div>
    </div>
  );
}
