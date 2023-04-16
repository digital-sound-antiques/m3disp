import { Box, Card, IconButton, useMediaQuery, useTheme } from "@mui/material";
import {
  SkipPrevious,
  Replay,
  Pause,
  PlayArrow,
  Repeat,
  SkipNext,
  RepeatOne,
} from "@mui/icons-material";
import { PlayerContext, RepeatMode } from "./PlayerContext";
import { useContext, useEffect, useState } from "react";
import { AudioPlayerState } from "webaudio-stream-player";

export function PlayControl(props: { small: boolean }) {
  const context = useContext(PlayerContext);
  const [playState, setPlayState] = useState(context.player.state);
  const onStateChange = (ev: CustomEvent<AudioPlayerState>) => {
    setPlayState(ev.detail);
  };
  useEffect(() => {
    context.player.addEventListener("statechange", onStateChange);
    return () => {
      context.player.removeEventListener("statechange", onStateChange);
    };
  });

  const theme = useTheme();
  const withCircle = (child: React.ReactNode) => (
    <Box
      sx={{
        display: "flex",
        width: "56px",
        height: "56px",
        borderRadius: "28px",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: theme.palette.primary.main,
      }}
    >
      {child}
    </Box>
  );

  let playIcon = playState == "playing" ? <Pause /> : <PlayArrow />;

  if (!(props.small ?? false)) {
    playIcon = withCircle(playIcon);
  }

  return (
    <Box sx={{ display: "flex", justifyContent: "center" }}>
      <Box
        sx={{
          display: "flex",
          width: "100%",
          maxWidth: "480px",
          flexDirection: "row",
          justifyContent: "space-around",
          alignItems: "center",
        }}
      >
        <IconButton onClick={() => context.prev()}>
          <SkipPrevious />
        </IconButton>
        <IconButton
          onClick={() => {
            context.player.seekInTime(0);
            if (playState == "paused") {
              context.player.resume();
            }
          }}
        >
          <Replay />
        </IconButton>
        <IconButton
          sx={{ p: 0 }}
          onClick={() => {
            if (playState == "playing") {
              context.pause();
            } else if (playState == "paused") {
              context.resume();
            } else {
              context.play();
            }
          }}
        >
          {playIcon}
        </IconButton>
        <IconButton
          onClick={() => {
            context.setRepeatMode(getNextRepeatMode(context.repeatMode));
          }}
        >
          {getRepeatIcon(context.repeatMode)}
        </IconButton>
        <IconButton onClick={() => context.next()}>
          <SkipNext />
        </IconButton>
      </Box>
    </Box>
  );
}

export function PlayControlCard() {
  return (
    <Card
      sx={{
        flexShrink: 0,
        width: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "stretch",
        flexDirection: "column",
        height: "100px",
      }}
    >
      <PlayControl small={false} />
    </Card>
  );
}

function getRepeatIcon(mode: RepeatMode) {
  switch (mode) {
    case "all":
      return <Repeat />;
    case "single":
      return <RepeatOne />;
  }
}

function getNextRepeatMode(mode: RepeatMode) {
  switch (mode) {
    case "all":
      return "single";
    case "single":
      return "all";
  }
}
