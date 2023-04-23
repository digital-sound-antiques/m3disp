import { Box, Card, IconButton, Typography, useMediaQuery, useTheme } from "@mui/material";
import {
  SkipPrevious,
  Replay,
  Pause,
  PlayArrow,
  Repeat,
  SkipNext,
  RepeatOne,
  Stop,
} from "@mui/icons-material";
import { PlayerContext, RepeatMode } from "../contexts/PlayerContext";
import { useContext, useEffect, useState } from "react";
import { AudioPlayerState } from "webaudio-stream-player";
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
            {context.entries[context.selectedIndex].title}
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
            context.stop();
          }}
        >
          <Stop />
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
      }}
    >
      <PlayControl small={false} />
    </Card>
  );
}
