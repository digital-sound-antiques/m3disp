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
import { Marquee } from "../widgets/Marquee";
import { toTimeString, usePlaybackTime } from "../widgets/usePlaybackTime";

const PREV_RESTART_SEC = 2;

export function PlayControl() {
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
  const { currentSec, totalSec, measuring } = usePlaybackTime();

  return (
    <div className="transport-controls">
      <div className="transport-title">
        <Marquee play={true}>
          <span>{context.currentEntry?.title ?? "-"}</span>
        </Marquee>
      </div>
      <div className="transport-buttons">
        <button className="tbtn" onClick={onPrev} title="Previous">
          <SkipPrevious />
        </button>
        <button
          className={`tbtn${context.repeatMode !== "none" ? " active" : ""}`}
          onClick={toggleRepeatMode}
          title="Repeat"
        >
          {repeatModeIcon}
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
      </div>
      <div className="transport-time">
        {toTimeString(currentSec)} /{" "}
        <span className={measuring ? "measuring" : undefined}>
          {measuring ? "Measuring…" : toTimeString(totalSec)}
        </span>
      </div>
    </div>
  );
}
