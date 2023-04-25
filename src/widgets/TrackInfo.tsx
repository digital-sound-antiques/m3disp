import { Box, Divider, SxProps, Theme, Typography, useTheme } from "@mui/material";
import { useContext, useEffect, useRef, useState } from "react";
import { ChannelId, ChannelStatus } from "../kss/channel-status";
import { PlayerContext } from "../contexts/PlayerContext";

type TrackInfoPanelProps = {
  title: string;
  targets: ChannelId[];
  sx?: SxProps<Theme> | null;
  disabled: boolean;
};

type VolumeIndicatorProps = {
  volume: number;
  kcode?: number | null;
  keyKeepFrames?: number | null;
  primaryColor: string;
  secondaryColor: string;
  variant: "vertical" | "horizontal";
};

export function VolumeIndicator(props: VolumeIndicatorProps) {
  const boxRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const updateSize = () => {
    const box = boxRef.current;
    if (box != null) {
      setSize({ width: box.clientWidth, height: box.clientHeight });
    }
  };

  const resizeObserver = new ResizeObserver(updateSize);
  useEffect(() => {
    const canvas = canvasRef.current!;
    if (props.variant == "horizontal") {
      canvas.width = 128;
      canvas.height = 1;
    } else {
      canvas.width = 1;
      canvas.height = 128;
    }
    resizeObserver.observe(boxRef.current!);
    return () => {
      resizeObserver.disconnect();
    };
  }, [props.variant]);

  useEffect(() => {
    const context = canvasRef.current!.getContext("2d")!;
    const canvas = context.canvas;

    context.fillStyle = "#223";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.beginPath();

    let v;
    if (props.keyKeepFrames != null) {
      const decayCycle = props.kcode != null ? 90 : 30;
      const elapsedCycle = Math.min(props.keyKeepFrames / 735, decayCycle);
      const att = (decayCycle - elapsedCycle) / decayCycle;
      v = Math.round(props.volume * att);
    } else {
      v = props.volume;
    }

    if (props.variant == "horizontal") {
      const step = canvas.width / 15;
      const cw = step * 0.75;
      for (let i = 1; i < 16; i++) {
        const dx = (i - 1) * step;
        if (i == props.volume) {
          context.fillStyle = `${props.secondaryColor}e0`;
          context.fillRect(dx, 0, cw, canvas.height);
        } else if (i < v) {
          context.fillStyle = `${props.primaryColor}c0`;
          context.fillRect(dx, 0, cw, canvas.height);
        } else {
          context.fillStyle = `${props.primaryColor}60`;
          context.fillRect(dx, 0, cw, canvas.height);
        }
      }
    } else {
      const step = canvas.height / 15;
      const ch = step * 0.75;
      for (let i = 1; i < 16; i++) {
        const dy = canvas.height - (i - 1) * step - ch;
        if (i == props.volume) {
          context.fillStyle = `${props.secondaryColor}e0`;
          context.fillRect(0, dy, canvas.width, ch);
        } else if (i < v) {
          context.fillStyle = `${props.primaryColor}c0`;
          context.fillRect(0, dy, canvas.width, ch);
        } else {
          context.fillStyle = `${props.primaryColor}60`;
          context.fillRect(0, dy, canvas.width, ch);
        }
      }
    }
  }, [props.volume, props.keyKeepFrames, props.primaryColor, props.secondaryColor]);
  return (
    <Box
      ref={boxRef}
      sx={{
        position: "relative",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        width: "100%",
        height: "100%",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: size.width + "px",
          height: size.height + "px",
        }}
      />
    </Box>
  );
}

type WaveIndicatorProps = {
  wave?: Uint8Array | ArrayLike<number> | number[] | null;
  color: string;
  sx?: SxProps<Theme>;
};

export function WaveIndicator(props: WaveIndicatorProps) {
  const boxRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const updateSize = () => {
    const box = boxRef.current;
    if (box != null) {
      setSize({ width: box.clientWidth, height: box.clientHeight });
    }
  };
  const resizeObserver = new ResizeObserver(updateSize);
  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = 128;
    canvas.height = 256;
    resizeObserver.observe(boxRef.current!);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const context = canvasRef.current!.getContext("2d")!;
    const canvas = context.canvas;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (props.wave != null) {
      const step = canvas.width / props.wave.length;
      context.fillStyle = props.color;
      context.beginPath();
      for (let i = 0; i < props.wave.length; i++) {
        const a = props.wave[i];
        if (a < 128) {
          context.rect(i * step, 127 - a, step - 1, a);
        } else {
          context.rect(i * step, 127, step - 1, 255 - a + 1);
        }
      }
      context.fill();
    }
  }, [props.wave, props.color]);

  return (
    <Box
      ref={boxRef}
      sx={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        width: "100%",
        height: "100%",
        ...props.sx,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: size.width + "px",
          height: size.height + "px",
        }}
      />
    </Box>
  );
}

export function TrackInfoPanel(props: TrackInfoPanelProps) {
  const theme = useTheme();
  const context = useContext(PlayerContext);

  const [status, setStatus] = useState<ChannelStatus | null>(null);

  const rootRef = useRef(null);
  const disabledRef = useRef(props.disabled);

  const renderFrame = () => {
    if (rootRef.current != null) {
      requestAnimationFrame(renderFrame);
      if (
        !disabledRef.current &&
        (context.player.state == "playing" || context.player.state == "paused")
      ) {
        for (const target of props.targets) {
          const newStatus = context.player.getChannelStatus(target);
          if (newStatus != null) {
            setStatus(newStatus);
          }
        }
      } else {
        setStatus(null);
      }
    }
  };

  useEffect(() => {
    requestAnimationFrame(renderFrame);
    disabledRef.current = props.disabled;
  }, [props.disabled]);

  const voiceNameBoxRef = useRef<HTMLDivElement>(null);

  let voiceNode = null;

  if (props.targets[0].device != "scc") {
    if (typeof status?.voice == "string") {
      voiceNode = (
        <Box
          ref={voiceNameBoxRef}
          sx={{
            display: "flex",
            justifyContent: "start",
            alignItems: "center",
            position: "relative",
            color: "primary.main",
            height: "100%",
            whiteSpace: "nowrap",
          }}
        >
          <Typography
            sx={{
              fontSize: { sm: "8px", md: "9px", lg: "10px", xl: "11px" },
              fontWeight: "bold",
            }}
          >
            {status?.voice}
          </Typography>
        </Box>
      );
    }
  } else {
    if (status?.voice instanceof Uint8Array) {
      voiceNode = (
        <Box
          sx={{
            position: "relative",
            display: "flex",
            width: "100%",
            height: "100%",
          }}
        >
          <Box sx={{ position: "absolute", top: 6, bottom: 6, right: 4, left: 4 }}>
            <WaveIndicator wave={status?.voice} color={theme.palette.primary.main} sx={{
              opacity: 0.54
            }} />
          </Box>
        </Box>
      );
    }
  }

  return (
    <Box
      ref={rootRef}
      sx={{
        display: "flex",
        position: "relative",
        flexDirection: "column",
        justifyContent: "start",
        alignItems: "stretch",
        minWidth: { sm: "96px", lg: "128px" },
        width: { sm: "96px", lg: "128px" },
      }}
    >
      <Box
        sx={{
          flex: 1,
          display: "flex",
          position: "relative",
          flexDirection: "row",
          alignItems: "stretch",
          px: { md: 0.25, lg: 0.5 },
        }}
      >
        <Box
          sx={{ flex: 0, flexShrink: 0, display: "flex", alignItems: "center", flexBasis: "2em" }}
        >
          <Typography
            sx={{
              flexBasis: "64px",
              textAlign: "center",
              fontSize: { sm: "8px", md: "9px", lg: "10px", xl: "11px" },
              fontWeight: "bold",
              color: "text.secondary",
            }}
          >
            {props.title}
          </Typography>
        </Box>
        <Box
          sx={{
            position: "relative",
            flex: 0,
            flexGrow: 1,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
          }}
        >
          <Box sx={{ position: "relative", width: "100%", height: "100%" }}>{voiceNode}</Box>
        </Box>
      </Box>
      <Box
        sx={{ position: "relative", width: "100%", height: { sm: "1px", md: "2px", lg: "2px" } }}
      >
        <Box sx={{ position: "absolute", top: 0, bottom: 0, right: 8, left: 8 }}>
          <VolumeInfoPanel variant="horizontal" targets={props.targets} disabled={props.disabled} />
        </Box>
      </Box>
      <Box sx={{ height: { xs: "4px", lg: "6px" } }}></Box>
    </Box>
  );
}

type VolumeInfoPanelProps = {
  small?: boolean | null;
  targets: ChannelId[];
  sx?: SxProps<Theme>;
  disabled: boolean;
  variant: "horizontal" | "vertical";
};

export function VolumeInfoPanel(props: VolumeInfoPanelProps) {
  const theme = useTheme();
  const context = useContext(PlayerContext);

  const [status, setStatus] = useState<ChannelStatus | null>(null);
  const rootRef = useRef(null);
  const disabledRef = useRef(props.disabled);

  const renderFrame = () => {
    if (rootRef.current != null) {
      requestAnimationFrame(renderFrame);
      if (!disabledRef.current) {
        if (props.targets.length > 0) {
          let nextStatus: ChannelStatus;
          for (const target of props.targets) {
            nextStatus = { id: target, freq: 0, vol: 0 };
            const newStatus = context.player.getChannelStatus(target);
            if (newStatus != null) {
              if (nextStatus.vol < newStatus.vol) {
                nextStatus.vol = newStatus.vol;
              }
              if (
                nextStatus.keyKeepFrames == null ||
                nextStatus.keyKeepFrames > (newStatus.keyKeepFrames ?? 0)
              ) {
                nextStatus.keyKeepFrames = newStatus.keyKeepFrames ?? 0;
              }
            }
          }
          setStatus(nextStatus!);
        }
      } else {
        setStatus(null);
      }
    }
  };

  useEffect(() => {
    requestAnimationFrame(renderFrame);
    disabledRef.current = props.disabled;
  }, [props.disabled]);

  return (
    <Box
      ref={rootRef}
      sx={{
        display: "flex",
        width: "100%",
        height: "100%",
        justifyContent: "stretch",
        alignItems: "stretch",
        ...props.sx,
      }}
    >
      <VolumeIndicator
        volume={status?.vol ?? 0}
        kcode={status?.kcode}
        keyKeepFrames={status?.keyKeepFrames ?? 0}
        primaryColor={theme.palette.primary.main}
        secondaryColor={theme.palette.secondary.main}
        variant={props.variant}
      />
    </Box>
  );
}
