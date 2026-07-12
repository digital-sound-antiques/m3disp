import {
  Pause,
  PlayArrow,
  Repeat,
  RepeatOn,
  RepeatOneOn,
  SkipNext,
  SkipPrevious,
  Stop,
} from "@mui/icons-material";
import { useContext, useEffect, useState } from "react";
import { AudioPlayerState } from "webaudio-stream-player";
import { PlayerContext, RepeatMode } from "../contexts/PlayerContext";

const PREV_RESTART_SEC = 2;

/** Playback control buttons: play/pause · stop · prev · next · repeat. */
export function TransportButtons() {
  const context = useContext(PlayerContext);
  const [playState, setPlayState] = useState(context.player.state);
  const onStateChange = (ev: CustomEvent<AudioPlayerState>) => setPlayState(ev.detail);

  // Prev: if we're more than PREV_RESTART_SEC into the track (or on the first
  // track), restart from the top; otherwise go to the previous playlist entry.
  const onPrev = () => {
    const rate = context.audioContext?.sampleRate ?? 44100;
    const posSec =
      (context.player.seekBaseFrame + (context.player.progress?.renderer?.currentFrame ?? 0)) / rate;
    const idx = context.currentEntry ? context.entries.indexOf(context.currentEntry) : -1;
    if (idx < 0) return;
    if (posSec >= PREV_RESTART_SEC || idx <= 0) {
      context.player.seek(0);
    } else {
      context.reducer.prev();
    }
  };
  useEffect(() => {
    context.player.addEventListener("statechange", onStateChange);
    return () => context.player.removeEventListener("statechange", onStateChange);
  });

  const toggleRepeatMode = () => {
    const modes: RepeatMode[] = ["none", "all", "single"];
    const index = modes.indexOf(context.repeatMode);
    context.reducer.setRepeatMode(modes[(index + 1) % modes.length]);
  };
  const repeatModeIcon = {
    none: <Repeat />,
    all: <RepeatOn />,
    single: <RepeatOneOn />,
  }[context.repeatMode];

  const playing = playState == "playing";

  return (
    <div className="transport-buttons">
      <button className="tbtn" onClick={onPrev} title="Previous">
        <SkipPrevious />
      </button>
      <button
        className="tbtn play"
        onClick={async () => {
          if (playState == "playing") {
            context.reducer.pause();
          } else if (playState == "paused") {
            context.reducer.resume();
          } else {
            await context.unmute();
            context.reducer.play();
          }
        }}
        title={playing ? "Pause" : "Play"}
      >
        {playing ? <Pause /> : <PlayArrow />}
      </button>
      <button className="tbtn" onClick={() => context.reducer.stop()} title="Stop">
        <Stop />
      </button>
      <button className="tbtn" onClick={() => context.reducer.next()} title="Next">
        <SkipNext />
      </button>
      <button
        className={`tbtn${context.repeatMode !== "none" ? " active" : ""}`}
        onClick={toggleRepeatMode}
        title="Repeat"
      >
        {repeatModeIcon}
      </button>
    </div>
  );
}
