import { useContext, useEffect, useRef, useState } from "react";

import { PlayerContext } from "../contexts/PlayerContext";
import { toTimeString, usePlaybackTime } from "./usePlaybackTime";

/** Red played region up to the head, light-gray keyframe-buffered region, dark
 *  unbuffered — as an inline linear-gradient behind the native range track. */
function seekBackground(current: number, buffered: number, max: number): string {
  const denom = Math.max(max, 1e-6);
  const played = (Math.min(current, max) / denom) * 100;
  const buf = Math.max(played, (Math.min(buffered, max) / denom) * 100);
  return `linear-gradient(to right, var(--seek-color, var(--secondary)) ${played}%, #6b7480 ${played}%, #6b7480 ${buf}%, #30363d ${buf}%)`;
}

export function TimeSlider() {
  const context = useContext(PlayerContext);
  const { currentSec, bufferedSec, totalSec, measuring, entry } = usePlaybackTime();
  const [seekingTo, setSeekingTo] = useState<number | null>(null);

  // drop the seek preview once playback catches up to (near) the seek target
  useEffect(() => {
    if (seekingTo != null && Math.abs(currentSec - seekingTo) < 1) setSeekingTo(null);
  }, [currentSec, seekingTo]);

  // a stale preview must not survive a track change
  useEffect(() => {
    setSeekingTo(null);
  }, [entry]);

  // While the real length is still being measured, a target beyond the scanned
  // (buffered) region may lie past the actual end of the track; such a seek is
  // rejected (mirroring KSSPlayer.seek), so snap the thumb back instead of
  // pinning the preview on a position playback will never reach.
  const commitSeek = (sec: number) => {
    if (measuring && sec > bufferedSec) {
      setSeekingTo(null);
      return;
    }
    const target = Math.min(sec, totalSec);
    setSeekingTo(target);
    context.player.seek(target);
  };

  // Commit on release. iOS Safari doesn't reliably fire `pointerup` on a range
  // input, so we also listen for touchend/mouseup; a value guard (re-armed on
  // each drag via onChange) collapses the duplicate events into one seek. Without
  // this, a missed commit leaves the preview (and thus the time display) frozen
  // at the drag/tap position while playback keeps running from the old spot.
  const lastCommitted = useRef<number | null>(null);
  const handleRelease = (el: HTMLInputElement) => {
    const v = Number(el.value);
    if (lastCommitted.current === v) return;
    lastCommitted.current = v;
    commitSeek(v);
  };

  const displaySec = seekingTo ?? currentSec;
  // Axis extent = the real total (or the seek preview if it runs past it).
  // Don't floor it to 1s: a sub-second track would then leave the buffered
  // region stuck partway across a 1s axis after it stops.
  const maxSec = Math.max(totalSec, displaySec, 1e-6);

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
        onChange={(e) => {
          setSeekingTo(Number(e.target.value));
          lastCommitted.current = null; // re-arm the release guard for this drag
        }}
        onPointerUp={(e) => handleRelease(e.target as HTMLInputElement)}
        onTouchEnd={(e) => handleRelease(e.target as HTMLInputElement)}
        onMouseUp={(e) => handleRelease(e.target as HTMLInputElement)}
        onKeyUp={(e) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
            commitSeek(Number((e.target as HTMLInputElement).value));
          }
        }}
      />
      <span className={`seek-time${measuring ? " measuring" : ""}`}>
        {measuring ? "Measuring…" : toTimeString(totalSec)}
      </span>
    </div>
  );
}
