import { Box, Stack, SxProps, Theme, Typography, useTheme } from "@mui/material";
import { useContext, useEffect, useRef, useState } from "react";
import { ChannelId, ChannelStatus } from "./kss/channel-status";
import { PlayerContext } from "./PlayerContext";

type TrackInfoPanelProps = {
  title: string;
  targets: ChannelId[];
  sx?: SxProps<Theme> | null;
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
    const box = boxRef.current!;
    setSize({ width: box.clientWidth, height: box.clientHeight });
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
    context.fillStyle = "#333";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.beginPath();
    let v;
    if (props.keyKeepFrames != null) {
      const decayCycle = props.kcode != null ? 60 : 5;
      const elapsedCycle = Math.min(props.keyKeepFrames / 735, decayCycle);
      const att = (decayCycle - elapsedCycle) / decayCycle;
      v = Math.round(props.volume * att);
    } else {
      v = props.volume;
    }

    const cw = step / 3;

    for (let i = 1; i < 16; i++) {
      const dx = (i - 1) * step + cw;
      if (i == props.volume) {
        context.fillStyle = `${props.primaryColor}e0`;
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
        position: "absolute",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        mr: 1,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: size.width + "px",
          height: size.height - 2 + "px",
          border: "1px solid #333",
        }}
      />
    </Box>
  );
}

type WaveIndicatorProps = {
  wave: Uint8Array | ArrayLike<number> | number[];
  color: string;
};

export function WaveIndicator(props: WaveIndicatorProps) {
  const boxRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const updateSize = () => {
    const box = boxRef.current!;
    setSize({ width: box.clientWidth, height: box.clientHeight });
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

    const step = canvas.width / props.wave.length;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = props.color + "20";
    context.fillRect(0, 0, canvas.width, canvas.height);
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
        mr: 1,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: size.width + "px",
          height: size.height - 2 + "px",
          border: "1px solid #333",
        }}
      />
    </Box>
  );
}

export function TrackInfoPanel(props: TrackInfoPanelProps) {
  const theme = useTheme();
  const context = useContext(PlayerContext);

  const [status, setStatus] = useState<ChannelStatus>({ freq: 0, kcode: 0, vol: 0 });
  const rootRef = useRef(null);

  const renderFrame = () => {
    if (rootRef.current != null) {
      requestAnimationFrame(renderFrame);
      for (const target of props.targets) {
        const status = context.player.getTrackStatus(target);
        if (status.kcode != null) {
          setStatus(status);
        }
      }
    }
  };

  useEffect(() => {
    renderFrame();
  }, []);

  let voiceNode;
  let volHeight = "45%";
  let voiceHeight = "45%";

  if (typeof status.voice === "string") {
    voiceNode = (
      <Typography
        color="#ccc"
        variant="caption"
        textAlign="right"
        fontSize={{ md: "7px", lg: "10px" }}
      >
        {status.voice.toUpperCase()}
      </Typography>
    );
  } else if (status.voice instanceof Uint8Array) {
    voiceNode = <WaveIndicator wave={status.voice} color={theme.palette.primary.main} />;
    volHeight = "30%";
    voiceHeight = "70%";
  } else {
    voiceNode = null;
  }

  return (
    <Stack
      ref={rootRef}
      direction="row"
      sx={{
        minWidth: "128px",
        width: "20%",
        gap: 0,
        ...props.sx,
      }}
    >
      <Box
        sx={{
          position: "relative",
          p: { md: 0.5, lg: 1 },
          flex: 0,
          flexBasis: { md: "48px", lg: "64px" },
        }}
      >
        <Box
          sx={{
            display: "flex",
            height: "100%",
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "#333",
            borderRadius: "2px",
          }}
        >
          <Box
            sx={{
              color: theme.palette.primary.main,
              opacity: 0.66,
              fontWeight: "bold",
              fontSize: { md: "10px", lg: "13px" },
            }}
          >
            {props.title}
          </Box>
        </Box>
      </Box>
      <Box sx={{ position: "relative", py: { md: 0.5, lg: 1 }, flex: 1 }}>
        <Box sx={{ display: "flex", position: "relative", width: "100%", height: "100%" }}>
          <Box
            sx={{
              display: "flex",
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: volHeight,
              justifyContent: "stretch",
              alignItems: "stretch",
            }}
          >
            <VolumeIndicator
              volume={status.vol}
              kcode={status.kcode}
              keyKeepFrames={status.keyKeepFrames}
              primaryColor={theme.palette.primary.main}
              secondaryColor={theme.palette.secondary.main}
            />
          </Box>
          <Box
            sx={{
              display: "flex",
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: voiceHeight,
              justifyContent: "start",
              alignItems: "center",
            }}
          >
            {voiceNode}
          </Box>
        </Box>
      </Box>
    </Stack>
  );
}
