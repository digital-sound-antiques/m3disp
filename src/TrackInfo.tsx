import { Box, Card, Stack, SxProps, Theme, Typography, useTheme } from "@mui/material";
import { forwardRef, useContext, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ChannelId, ChannelStatus } from "./kss/channel-status";
import { PlayerContext } from "./PlayerContext";

type TrackInfoPanelProps = {
  title: string;
  targets: ChannelId[];
  sx?: SxProps<Theme> | null;
};

type ExpandedCanvasProps = {
  style?: React.CSSProperties | null;
};

export const ExpandedCanvas = forwardRef<HTMLCanvasElement, ExpandedCanvasProps>(
  (props: ExpandedCanvasProps, ref) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const updateCanvasSize = () => {
      const canvas = canvasRef.current!;
      const { offsetWidth, offsetHeight, clientWidth, clientHeight } = canvas;
      console.log(`offsetSize=${offsetWidth}x${offsetHeight}`);
      console.log(`clientSize=${clientWidth}x${clientHeight}`);

      const width = canvas.clientWidth * devicePixelRatio;
      const height = canvas.clientHeight * devicePixelRatio;
      if (canvas.width != width || canvas.height != height) {
        console.log("update*");
        canvas.width = width;
        canvas.height = height;
      }
    };
    const resizeObserver = new ResizeObserver(updateCanvasSize);
    useEffect(() => {
      updateCanvasSize();
      resizeObserver.observe(canvasRef.current!);
      return () => {
        resizeObserver.disconnect();
      };
    }, []);
    return (
      <canvas
        ref={(node: HTMLCanvasElement) => {
          canvasRef.current = node;
          if (typeof ref === "function") {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
          ref;
        }}
        style={{ ...props.style }}
      ></canvas>
    );
  }
);

type VolumeIndicatorProps = {
  volume: number;
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
    canvas.height = 4;
    resizeObserver.observe(boxRef.current!);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const context = canvasRef.current!.getContext("2d")!;
    const canvas = context.canvas;

    const step = canvas.width / 15;
    context.fillStyle = "#222";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.beginPath();
    let v;
    if (props.keyKeepFrames != null) {
      const decayCycle = 60;
      const elapsedCycle = Math.min(props.keyKeepFrames / 735, decayCycle);
      const att = (decayCycle - elapsedCycle) / decayCycle;
      v = Math.round(props.volume * att);
    } else {
      v = props.volume;
    }

    for (let i = 1; i < 15; i++) {
      const dx = (i - 1) * step;
      if (i == props.volume) {
        context.fillStyle = `${props.secondaryColor}e0`;
        context.fillRect(dx, 0, step / 3, canvas.height);
      } else if (i < v) {
        context.fillStyle = `${props.primaryColor}d0`;
        context.fillRect(dx, 0, step / 3, canvas.height);
      } else {
        context.fillStyle = `${props.primaryColor}40`;
        context.fillRect(dx, 0, step / 3, canvas.height);
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
          border: "1px solid #222",
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
      <Box sx={{ position: "relative", p: 1, flex: 0, flexBasis: "64px" }}>
        <Box
          sx={{
            display: "flex",
            borderRadius: "1px",
            height: "100%",
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "#333",
          }}
        >
          <Box
            sx={{
              color: theme.palette.primary.main,
              opacity: 0.66,
              fontWeight: "bold",
              fontSize: "10px",
            }}
          >
            {props.title}
          </Box>
        </Box>
      </Box>
      <Box sx={{ position: "relative", py: 1, flex: 1 }}>
        <Box sx={{ display: "flex", position: "relative", width: "100%", height: "100%" }}>
          <Box
            sx={{
              display: "flex",
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              bottom: "50%",
              justifyContent: "stretch",
              alignItems: "stretch",
            }}
          >
            <VolumeIndicator
              volume={status.vol}
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
              top: "60%",
              bottom: 0,
              justifyContent: "start",
            }}
          >
            <Typography
              color="#ccc"
              variant="caption"
              textAlign="right"
              fontSize="7px"
              lineHeight="7px"
            >
              {status.voice?.toString().toUpperCase()}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Stack>
  );
}
