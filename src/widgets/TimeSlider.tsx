import React, { useContext, useEffect, useRef, useState } from "react";

import { Box, Slider, Typography } from "@mui/material";
import { AudioPlayerProgress } from "webaudio-stream-player";
import { PlayerContext } from "../contexts/PlayerContext";

const DEFAULT_FADE_MS = 5000;

function toTimeString(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TimeSlider() {
  const context = useContext(PlayerContext);
  const [currentSec, setCurrentSec] = useState(0);
  const [bufferedSec, setBufferedSec] = useState(0);
  // while dragging / just after a seek, show the target until playback catches up
  const [seekingTo, setSeekingTo] = useState<number | null>(null);
  const seekingRef = useRef<number | null>(null);
  seekingRef.current = seekingTo;

  const rate = context.audioContext?.sampleRate ?? 44100;

  useEffect(() => {
    const handleProgress = (ev: CustomEvent<AudioPlayerProgress>) => {
      const player = context.player;
      const absSec = (player.seekBaseFrame + (ev.detail.renderer.currentFrame ?? 0)) / rate;
      setCurrentSec(absSec);
      setBufferedSec(player.bufferedFrame / rate);
      // the new stream has reached the seek target: release the held thumb
      if (seekingRef.current != null && Math.abs(absSec - seekingRef.current) < 1) {
        setSeekingTo(null);
      }
    };
    context.player.addEventListener("progress", handleProgress);
    return () => context.player.removeEventListener("progress", handleProgress);
  }, [context.player, rate]);

  // total playback length (ms) known up front (KSS has no intrinsic length):
  // per-entry duration + fade, else the global default cap.
  const entry = context.currentEntry;
  const totalMs =
    entry?.duration != null
      ? entry.duration + (entry.fadeDuration ?? DEFAULT_FADE_MS)
      : context.defaultDuration;
  const totalSec = totalMs / 1000;

  const displaySec = seekingTo ?? currentSec;
  const maxSec = Math.max(totalSec, displaySec, 1);
  const bufPct = Math.min(1, bufferedSec / maxSec) * 100;

  const onChange = (_: Event, v: number | number[]) => {
    setSeekingTo(v as number);
  };
  const onCommit = (_: React.SyntheticEvent | Event, v: number | number[]) => {
    const sec = v as number;
    setSeekingTo(sec);
    context.player.seek(sec);
  };

  return (
    <Box sx={{ px: 1.5, py: 0.5 }}>
      <Slider
        size="small"
        color="secondary"
        min={0}
        max={maxSec}
        step={0.05}
        value={Math.min(displaySec, maxSec)}
        onChange={onChange}
        onChangeCommitted={onCommit}
        sx={{
          py: 1,
          "& .MuiSlider-rail": {
            opacity: 1,
            background: `linear-gradient(to right, #6b7480 ${bufPct}%, #30363d ${bufPct}%)`,
          },
          "& .MuiSlider-thumb": { transition: "none" },
          "& .MuiSlider-track": { transition: "none" },
        }}
      />
      <Box sx={{ display: "flex", justifyContent: "space-between", mt: -0.5 }}>
        <Typography variant="caption" color="text.secondary">
          {toTimeString(displaySec)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {toTimeString(totalSec)}
        </Typography>
      </Box>
    </Box>
  );
}
