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

export function PlayControl() {
  const context = useContext(PlayerContext);
  const [playState, setPlayState] = useState(context.player.state);
  const onStateChange = (ev: CustomEvent<AudioPlayerState>) => setPlayState(ev.detail);
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
    <div className="transport-controls">
      <div className="transport-title">
        <Marquee play={true}>
          <span>{context.currentEntry?.title ?? "-"}</span>
        </Marquee>
      </div>
      <div className="transport-buttons">
        <button className="tbtn" onClick={() => context.reducer.prev()} title="Previous">
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
    </div>
  );
}
