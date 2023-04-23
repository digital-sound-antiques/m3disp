import { Box, Stack, SxProps, Theme, Typography, useTheme } from "@mui/material";
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
    canvas.width = 128;
    canvas.height = 1;
    resizeObserver.observe(boxRef.current!);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const context = canvasRef.current!.getContext("2d")!;
    const canvas = context.canvas;

    const step = canvas.width / 15;
    context.fillStyle = "#223";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.beginPath();

    let v;
    if (props.keyKeepFrames != null) {
      const decayCycle = props.kcode != null ? 90 : 15;
      const elapsedCycle = Math.min(props.keyKeepFrames / 735, decayCycle);
      const att = (decayCycle - elapsedCycle) / decayCycle;
      v = Math.round(props.volume * att);
    } else {
      v = props.volume;
    }

    const cw = step / 2;

    for (let i = 1; i < 16; i++) {
      const dx = (i - 1) * step + cw;
      if (i == props.volume) {
        context.fillStyle = `${props.secondaryColor}e0`;
        context.fillRect(dx, 0, cw, canvas.height);
      } else if (i < v) {
        context.fillStyle = `${props.primaryColor}d0`;
        context.fillRect(dx, 0, cw, canvas.height);
      } else {
        context.fillStyle = `${props.primaryColor}40`;
        context.fillRect(dx, 0, cw, canvas.height);
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
      context.fillStyle = props.color + "c0";
      context.beginPath();
      for (let i = 0; i < props.wave.length; i++) {
        const a = props.wave[i];
        if (a < 128) {
          context.rect(i * step, 127 - a, step - 2, a);
        } else {
          const xa = -(255 - a + 1);
          context.rect(i * step, 127, step - 2, -xa);
        }
      }
      context.fill();
    }
  }, [props.wave, props.color]);

  return (
    <Box
      ref={boxRef}
      sx={{
        position: "absolute",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
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
      if (!disabledRef.current) {
        for (const target of props.targets) {
          const status = context.player.getChannelStatus(target);
          if (status != null) {
            setStatus(status);
          }
        }
      } else {
        setStatus({ freq: 0, vol: 0 });
      }
    }
  };

  useEffect(() => {
    requestAnimationFrame(renderFrame);
    disabledRef.current = props.disabled;
  }, [props.disabled]);

  let voiceNode = null;

  if (props.targets[0].device != "scc") {
    if (typeof status?.voice == "string") {
      voiceNode = (
        <Typography
          color={theme.palette.primary.main + "c0"}
          fontSize={{ sm: "7px", md: "9px", lg: "12px", xl: "13px" }}
          fontWeight="bold"
        >
          {status.voice}
        </Typography>
      );
    }
  } else {
    if (status?.voice instanceof Uint8Array) {
      voiceNode = <WaveIndicator wave={status?.voice} color={theme.palette.primary.main} />;
    }
  }

  return (
    <Box ref={rootRef} sx={{ display: "flex", position: "relative", width: "15%" }}>
      <Box
        sx={{
          flex: 1,
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "start",
          p: { sm: 0.5, xl: 1 },
        }}
      >
        <Box
          sx={{
            fontSize: { sm: "6px", lg: "8px", xl: "10px" },
            fontWeight: "bold",
            color: "#c0c0c0",
          }}
        >
          {props.title}
        </Box>
        <Box
          sx={{
            display: "flex",
            position: "relative",
            width: "100%",
            height: "100%",
            justifyContent: "start",
            alignItems: "start",
          }}
        >
          {voiceNode}
        </Box>
      </Box>
    </Box>
  );
}

type VolumeInfoPanelProps = {
  small?: boolean | null;
  targets: ChannelId[];
  sx?: SxProps<Theme> | null;
  disabled: boolean;
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
        let nextStatus: ChannelStatus = { freq: 0, vol: 0 };
        for (const target of props.targets) {
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
        setStatus(nextStatus);
      } else {
        setStatus({ freq: 0, vol: 0 });
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
        position: "releative",
        width: props.small ? "32px" : "64px",
        height: "100%",
        justifyContent: "stretch",
        alignItems: "stretch",
      }}
    >
      <VolumeIndicator
        volume={status?.vol ?? 0}
        kcode={status?.kcode}
        keyKeepFrames={status?.keyKeepFrames ?? 0}
        primaryColor={theme.palette.primary.main}
        secondaryColor={theme.palette.secondary.main}
      />
    </Box>
  );
}
