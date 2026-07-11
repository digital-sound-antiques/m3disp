import { useContext, useEffect, useState } from "react";

import { PlayerContext } from "../contexts/PlayerContext";
import { toTimeString, usePlaybackTime } from "./usePlaybackTime";

/** Red played region up to the head, light-gray keyframe-buffered region, dark
 *  unbuffered — as an inline linear-gradient behind the native range track. */
function seekBackground(current: number, buffered: number, max: number): string {
  const played = (Math.min(current, max) / Math.max(max, 1)) * 100;
  const buf = Math.max(played, (Math.min(buffered, max) / Math.max(max, 1)) * 100);
  return `linear-gradient(to right, var(--secondary) ${played}%, #6b7480 ${played}%, #6b7480 ${buf}%, #30363d ${buf}%)`;
}

export function TimeSlider() {
  const context = useContext(PlayerContext);
  const { currentSec, bufferedSec, totalSec, measuring, entry } = usePlaybackTime();
  const [seekingTo, setSeekingTo] = useState<number | null>(null);

  // drop the seek preview once playback catches up to (near) the seek target
  useEffect(() => {
    if (seekingTo != null && Math.abs(currentSec - seekingTo) < 1) setSeekingTo(null);
  }, [currentSec, seekingTo]);

  const displaySec = seekingTo ?? currentSec;
  const maxSec = Math.max(totalSec, displaySec, 1);

  return (
    <div className="transport-seek">
      <span className="seek-time">{toTimeString(displaySec)}</span>
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
      <span className={`seek-time${measuring ? " measuring" : ""}`}>
        {measuring ? "Measuring…" : toTimeString(totalSec)}
      </span>
    </div>
  );
}
