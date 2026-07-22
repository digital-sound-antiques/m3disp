import { useContext, useEffect, useState } from "react";

import { AudioPlayerProgress } from "webaudio-stream-player";
import { PlayerContext } from "../contexts/PlayerContext";

const DEFAULT_FADE_MS = 5000;

export function toTimeString(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Tracks the current/total playback time from the player's progress events.
 *  `totalSec` prefers the real length the decoder found (intro + loops + fade);
 *  until that is known, `measuring` is true and we fall back to the estimate. */
export function usePlaybackTime() {
  const context = useContext(PlayerContext);
  const [currentSec, setCurrentSec] = useState(0);
  const [bufferedSec, setBufferedSec] = useState(0);

  const rate = context.audioContext?.sampleRate ?? 44100;

  useEffect(() => {
    const handleProgress = (ev: CustomEvent<AudioPlayerProgress>) => {
      const player = context.player;
      const absSec = (player.seekBaseFrame + (ev.detail.renderer.currentFrame ?? 0)) / rate;
      setCurrentSec(absSec);
      setBufferedSec(player.bufferedFrame / rate);
    };
    context.player.addEventListener("progress", handleProgress);
    return () => context.player.removeEventListener("progress", handleProgress);
  }, [context.player, rate]);

  // During an auto-advance gap the player is idle, so tick a local clock to
  // drive the negative countdown (-0:03, -0:02, -0:01) until audio starts.
  const gapUntil = context.gapUntil;
  const [, tick] = useState(0);
  useEffect(() => {
    if (gapUntil == null) return;
    const id = setInterval(() => tick((n) => n + 1), 200);
    return () => clearInterval(id);
  }, [gapUntil]);
  const gapRemainingSec =
    gapUntil != null ? Math.ceil((gapUntil - Date.now()) / 1000) : 0;
  const inGap = gapUntil != null && gapRemainingSec > 0;

  const entry = context.currentEntry;
  const capMs =
    entry?.duration != null
      ? entry.duration + (entry.fadeDuration ?? DEFAULT_FADE_MS)
      : context.defaultDuration;
  const reportedSec = context.player.totalFrame > 0 ? context.player.totalFrame / rate : 0;
  const measuring = entry != null && reportedSec <= 0;
  const totalSec = reportedSec > 0 ? reportedSec : capMs / 1000;

  return {
    currentSec,
    bufferedSec,
    totalSec,
    measuring,
    entry,
    /** seconds remaining in the auto-advance gap, or null when not in a gap */
    gapRemainingSec: inGap ? gapRemainingSec : null,
  };
}
