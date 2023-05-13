import { useContext, useEffect, useRef, useState } from "react";
import { PlayerContext } from "../contexts/PlayerContext";
import { Box, Card, Stack, Typography, useTheme } from "@mui/material";
import { WaveThumbnail } from "../kss/kss-player";

function _drawWavePreview(
  canvas: HTMLCanvasElement,
  thumbnail: WaveThumbnail,
  total: number,
  color: string
) {
  const ctx = canvas.getContext("2d")!;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  if (thumbnail.length == 0) {
    return;
  }

  ctx.beginPath();
  const cy = Math.floor(canvas.height / 2);
  const step = 3;
  const { data, min, max } = thumbnail;
  const depth = Math.max(Math.abs(min), Math.abs(max));

  ctx.fillStyle = color;
  for (let i = 0; i < data.length; i++) {
    const x = Math.floor((canvas.width * i) / total);
    const dx = x - (x % step);
    const d = (data[i] ?? 0) / depth;
    if (d >= 0) {
      const h = Math.floor(d * cy);
      ctx.rect(dx, cy - h, step - 1, h);
    } else {
      const h = Math.floor(-d * cy);
      ctx.rect(dx, cy, step - 1, h);
    }
  }
  ctx.fill();
}

function _drawCursor(canvas: HTMLCanvasElement, current: number, total: number, color: string) {
  const ctx = canvas.getContext("2d")!;

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  const x = Math.round((canvas.width * current) / total);
  ctx.moveTo(x, 0);
  ctx.lineTo(x, canvas.height);
  ctx.stroke();
}

type CursorCanvasProps = {
  width: number;
  height: number;
  color: string;
};

function CursorCanvas(props: CursorCanvasProps) {
  const context = useContext(PlayerContext);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorRef = useRef(props.color);

  const pixelRatio = Math.min(devicePixelRatio, 2.0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = props.width * pixelRatio;
    canvas.height = props.height * pixelRatio;
    canvas.style.width = `${props.width}px`;
    canvas.style.height = `${props.height}px`;
    colorRef.current = props.color;
  }, [props.width, props.height, props.color]);

  useEffect(() => {
    const renderFrame = () => {
      const canvas = canvasRef.current;
      const { bufferedFrames, currentFrame } = context.player.progress.renderer;
      if (canvas != null) {
        requestAnimationFrame(renderFrame);
        _drawCursor(canvas, currentFrame, bufferedFrames, colorRef.current!);
      }
    };
    renderFrame();
  }, []);

  const seekToMousePos = (ev: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (canvas != null) {
      const rect = canvas.getBoundingClientRect();
      const dx = ev.clientX - rect.left;
      const ratio = dx / (canvas.width / pixelRatio);
      const pos = Math.round(context.player.progress.renderer.bufferedFrames * ratio);
      context.player.seekInFrame(pos);
      if (context.player.state == "paused" || context.player.state == "stopped") {
        context.reducer.resume();
      }
    }
  };

  const onMouseDown = (ev: React.MouseEvent) => {
    seekToMousePos(ev);
  };

  const onMouseMove = (ev: React.MouseEvent) => {
    if (ev.buttons != 0) {
      seekToMousePos(ev);
    }
  };

  return <canvas ref={canvasRef} onMouseDown={onMouseDown} onMouseMove={onMouseMove} />;
}

type WaveCanvasProps = {
  width: number;
  height: number;
  color: string;
};

function WaveCanvas(props: WaveCanvasProps) {
  const context = useContext(PlayerContext);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameCounterRef = useRef(0);
  const previewLengthRef = useRef(0);
  const colorRef = useRef(props.color);

  const pixelRatio = Math.min(devicePixelRatio, 2.0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = props.width * pixelRatio;
    canvas.height = props.height * pixelRatio;
    canvas.style.width = `${props.width}px`;
    canvas.style.height = `${props.height}px`;
    previewLengthRef.current = -1;
    colorRef.current = props.color;
  }, [props.width, props.height, props.color]);

  useEffect(() => {
    const renderFrame = () => {
      const canvas = canvasRef.current;
      const thumbnail = context.player.thumbnail;
      if (canvas != null) {
        requestAnimationFrame(renderFrame);
        frameCounterRef.current = frameCounterRef.current + 1;
        if (thumbnail.length != previewLengthRef.current) {
          if (frameCounterRef.current % 15 == 0) {
            const { bufferedFrames, isFulFilled } = context.player.progress.renderer;
            let total;
            if (isFulFilled) {
              total = bufferedFrames / 735;
            } else {
              total = Math.max(60 * 30, bufferedFrames / 735);
            }
            _drawWavePreview(canvas, thumbnail, total, colorRef.current);
            previewLengthRef.current = thumbnail.length;
          }
        }
      }
    };
    renderFrame();
  }, []);

  return <canvas ref={canvasRef} />;
}

type WavePreviewProps = {
  height?: string | number | undefined;
};

export function WavePreview(props: WavePreviewProps) {
  const theme = useTheme();
  const boxRef = useRef<HTMLElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const onResize = () => {
    setSize({
      width: boxRef.current!.clientWidth,
      height: boxRef.current!.clientHeight,
    });
  };
  const resizeObserver = new ResizeObserver(onResize);

  useEffect(() => {
    resizeObserver.observe(boxRef.current!);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <Box
      ref={boxRef}
      sx={{
        position: "relative",
        width: "100%",
        height: props.height ?? "48px",
      }}
    >
      <WaveCanvas width={size.width} height={size.height} color={theme.palette.primary.main} />
      <Box sx={{ position: "absolute", top: 0, height: `${size.height + 4}px` }}>
        <CursorCanvas
          width={size.width}
          height={size.height + 4}
          color={theme.palette.secondary.main}
        />
      </Box>
    </Box>
  );
}

function _toTimeString(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const mm = m < 10 ? `0${m}` : `${m}`;
  const ss = s < 10 ? `0${s}` : `${s}`;
  return `${mm}:${ss}`;
}

export function WaveSlider() {
  const context = useContext(PlayerContext);
  const [progress, setProgress] = useState({ currentTime: 0, bufferedTime: 0 });

  useEffect(() => {
    const timerId = setTimeout(() => {
      const progress = context.player.progress.renderer;
      setProgress(progress);
    }, 100);
    return () => {
      clearTimeout(timerId);
    };
  });

  return (
    <Box sx={{ display: "flex", flexDirection: "column", padding: 2 }}>
      <WavePreview />
      <Stack direction="row" justifyContent="space-between" sx={{ mt: 1 }}>
        <Typography variant="caption">{_toTimeString(Math.min(progress.currentTime, progress.bufferedTime))}</Typography>
        <Typography variant="caption">{_toTimeString(progress.bufferedTime)}</Typography>
      </Stack>
    </Box>
  );
}

export function WaveSliderCard() {
  return (
    <Card sx={{ height: "100px" }}>
      <WaveSlider />
    </Card>
  );
}
