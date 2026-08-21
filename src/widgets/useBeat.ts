import { useContext, useEffect, useSyncExternalStore } from "react";

import { PlayerContext } from "../contexts/PlayerContext";
import { getConfidentBeat, subscribeBeat, trackBeat, type BeatEstimate } from "../kss/beat-tracker";

/**
 * The playing track's beat, or null while there is none to show.
 *
 * Driven by the player's progress events — the same clock the time display runs
 * on — because that is when new look-ahead frames have arrived to fold in. The
 * tracker itself decides when the estimate is actually due, so this stays cheap.
 */
export function useBeat(): BeatEstimate | null {
  const context = useContext(PlayerContext);
  const beat = useSyncExternalStore(subscribeBeat, getConfidentBeat);

  useEffect(() => {
    const player = context.player;
    const onProgress = () => trackBeat(player._snapshots);
    player.addEventListener("progress", onProgress);
    return () => player.removeEventListener("progress", onProgress);
  }, [context.player]);

  // Drop the previous track's tempo as soon as the entry changes, rather than
  // showing it over the start of the new one until its own estimate lands.
  useEffect(() => {
    trackBeat(null);
  }, [context.currentEntry]);

  return beat;
}
