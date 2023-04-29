import {
  Pause,
  PlayArrow,
  Repeat,
  RepeatOn,
  RepeatOneOn,
  SkipNext,
  SkipPrevious,
  Stop
} from "@mui/icons-material";
import { Box, Card, IconButton, Typography, useTheme } from "@mui/material";
import { useContext, useEffect, useState } from "react";
import { AudioPlayerState } from "webaudio-stream-player";
import { PlayerContext, RepeatMode } from "../contexts/PlayerContext";
import { Marquee } from "../widgets/Marquee";

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

  const toggleRepeatMode = () => {
    const modes: RepeatMode[] = ["none", "all", "single"];
    const index = modes.indexOf(context.repeatMode);
    const next = modes[(index + 1) % modes.length];
    context.reducer.setRepeatMode(next);
  };

  const repeatModeIcon = {
    none: <Repeat />,
    all: <RepeatOn />,
    single: <RepeatOneOn />,
  }[context.repeatMode];

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        ...(props.small ? undefined : { p: 2, gap: 2 }),
      }}
    >
      {props.small ? null : (
        <Marquee play={true}>
          <Typography
            sx={{
              fontWeight: "bold",
              fontSize: "0.9rem",
            }}
            noWrap={true}
          >
            {context.currentEntry?.title ?? "-"}
          </Typography>
        </Marquee>
      )}
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
        <IconButton onClick={() => context.reducer.prev()}>
          <SkipPrevious />
        </IconButton>
        <IconButton onClick={toggleRepeatMode}>{repeatModeIcon}</IconButton>
        {/* <IconButton
          onClick={() => {
            context.player.seekInTime(0);
            if (playState == "paused") {
              context.player.resume();
            }
          }}
        >
          <Replay />
        </IconButton> */}
        <IconButton
          sx={{ p: 0 }}
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
        >
          {playIcon}
        </IconButton>
        <IconButton
          onClick={() => {
            context.reducer.stop();
          }}
        >
          <Stop />
        </IconButton>
        <IconButton onClick={() => context.reducer.next()}>
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
      }}
    >
      <PlayControl small={false} />
    </Card>
  );
}
