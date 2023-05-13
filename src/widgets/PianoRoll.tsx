import { ThreeDRotation } from "@mui/icons-material";
import { Box, Button, Card } from "@mui/material";
import * as Colors from "@mui/material/colors";
import { useContext, useEffect, useRef, useState } from "react";
import { PlayerContext, PlayerContextState } from "../contexts/PlayerContext";
import { ChannelId } from "../kss/channel-status";

const channelIds: ChannelId[] = [
  { device: "opll", index: 0 },
  { device: "opll", index: 1 },
  { device: "opll", index: 2 },
  { device: "opll", index: 3 },
  { device: "opll", index: 4 },
  { device: "opll", index: 5 },
  { device: "opll", index: 6 },
  { device: "opll", index: 7 },
  { device: "opll", index: 8 },
  { device: "opll", index: 9 },
  { device: "opll", index: 10 },
  { device: "opll", index: 11 },
  { device: "opll", index: 12 },
  { device: "opll", index: 13 },
  { device: "psg", index: 0 },
  { device: "psg", index: 1 },
  { device: "psg", index: 2 },
  { device: "psg", index: 3 },
  { device: "psg", index: 4 },
  { device: "psg", index: 5 },
  { device: "scc", index: 0 },
  { device: "scc", index: 1 },
  { device: "scc", index: 2 },
  { device: "scc", index: 3 },
  { device: "scc", index: 4 },
];

const colorMap = [
  Colors.teal,
  Colors.teal,
  Colors.teal,
  Colors.teal,
  Colors.teal,
  Colors.teal,
  Colors.teal,
  Colors.teal,
  Colors.teal,
  Colors.pink,
  Colors.pink,
  Colors.pink,
  Colors.pink,
  Colors.pink,
  Colors.blue,
  Colors.blue,
  Colors.blue,
  Colors.red,
  Colors.red,
  Colors.red,
  Colors.yellow,
  Colors.yellow,
  Colors.yellow,
  Colors.yellow,
  Colors.yellow,
  // Colors.red,
  // Colors.pink,
  // Colors.purple,
  // Colors.deepPurple,
  // Colors.indigo,
  // Colors.blue,
  // Colors.lightBlue,
  // Colors.cyan,
  // Colors.teal,
  // Colors.green,
  // Colors.lightGreen,
  // Colors.yellow,
  // Colors.lime,
  // Colors.amber,
  // Colors.orange,
  // Colors.deepOrange,
  // Colors.brown,
  // Colors.grey,
  // Colors.blueGrey,
];

const lpos = 0.25;

function paintBlackKeyboard(canvas: HTMLCanvasElement, flip: boolean) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  const dx = Math.floor(canvas.width * lpos - 32) + (flip ? 6 : 0);
  const kh = Math.ceil(canvas.height / 96);
  ctx.fillStyle = "#121212";
  for (let i = 0; i < 96; i++) {
    const k = i % 12;
    if (k == 1 || k == 3 || k == 6 || k == 8 || k == 10) {
      ctx.fillRect(dx, canvas.height * (1.0 - (i + 1) / 96), 22, kh);
    }
  }
}

function paintBlackHighlight(canvas: HTMLCanvasElement, keys: number[], flip: boolean) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  const dx = Math.floor(canvas.width * lpos - 32) + (flip ? 6 : 0);
  const kh = Math.ceil(canvas.height / 96);
  ctx.fillStyle = "#f0f0f0f0";
  for (const i of keys) {
    const k = i % 12;
    if (k == 1 || k == 3 || k == 6 || k == 8 || k == 10) {
      ctx.fillRect(dx, canvas.height * (1.0 - (i + 1) / 96), 22, kh);
    }
  }
}

function paintWhiteHighlight(canvas: HTMLCanvasElement, keys: number[]) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  const dx = Math.floor(canvas.width * lpos - 32);
  const kh = Math.ceil(canvas.height / 96);
  ctx.fillStyle = "#f0f0f0f0";
  for (const i of keys) {
    const k = i % 12;
    if (k == 1 || k == 3 || k == 6 || k == 8 || k == 10) {
    } else {
      ctx.fillRect(dx, canvas.height * (1.0 - (i + 1) / 96), 28, kh);
    }
  }
}

function paintWhiteKeyboard(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  const dx = Math.floor(canvas.width * lpos - 32);
  const kh = Math.ceil(canvas.height / 56);
  ctx.fillStyle = "#f0f0f060";
  for (let i = 0; i < 56; i++) {
    ctx.fillRect(dx, canvas.height * (1.0 - (i + 1) / 56), 28, kh);
  }
}

function paintPianoRollBg(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  const kh = Math.ceil(canvas.height / 96);
  for (let i = 0; i < 96; i++) {
    const k = i % 12;
    if (k == 1 || k == 3 || k == 6 || k == 8 || k == 10) {
      ctx.fillStyle = "#101010";
    } else {
      ctx.fillStyle = "#181818";
    }
    ctx.fillRect(0, canvas.height * (1.0 - (i + 1) / 96), canvas.width, kh);
  }
}

function paintPianoRoll(canvas: HTMLCanvasElement, playerContext: PlayerContextState) {
  const ctx = canvas.getContext("2d")!;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();

  const frames = 240;
  const step = canvas.width / frames;
  const kh = canvas.height / 96;

  for (let ch = 0; ch < channelIds.length; ch++) {
    const id = channelIds[ch];
    const palette = colorMap[ch];
    const color = palette["A200"];
    ctx.fillStyle = color + "c0";
    const statuses = playerContext.player.getChannelStatusArray(
      id,
      Math.floor(735 * frames * lpos),
      Math.floor(735 * frames * (1.0 - lpos))
    );

    for (let i = 0; i < statuses.length; i++) {
      const { kcode, vol, keyKeepFrames } = statuses[i] ?? {};
      if (kcode != null && vol != null) {
        let edge = (keyKeepFrames ?? 0) == 0;
        ctx.fillRect(step * i + (edge ? 1 : 0), canvas.height * (1.0 - (kcode + 1) / 96), step, kh);
      }
    }
  }
}

function PianoRollCanvas(props: { width: number; height: number }) {
  const playerContext = useContext(PlayerContext);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = props.width * devicePixelRatio;
    canvas.height = props.height * devicePixelRatio;
    canvas.style.width = `${props.width}px`;
    canvas.style.height = `${props.height}px`;
  }, [props.width, props.height]);

  useEffect(() => {
    const renderFrame = () => {
      const canvas = canvasRef.current!;
      if (canvas != null) {
        requestAnimationFrame(renderFrame);
        paintPianoRoll(canvas, playerContext);
      }
    };
    renderFrame();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
      }}
    ></canvas>
  );
}

function AutoSizeCanvas(props: {
  width: number;
  height: number;
  painter: (canvas: HTMLCanvasElement) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = props.width * devicePixelRatio;
    canvas.height = props.height * devicePixelRatio;
    canvas.style.width = `${props.width}px`;
    canvas.style.height = `${props.height}px`;
  }, [props.width, props.height]);

  useEffect(() => {
    props.painter(canvasRef.current!);
  }, [props.painter, props.width, props.height]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
      }}
    ></canvas>
  );
}

function HighlightCanvas(props: {
  width: number;
  height: number;
  painter: (canvas: HTMLCanvasElement, keys: number[]) => void;
}) {
  const playerContext = useContext(PlayerContext);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = props.width * devicePixelRatio;
    canvas.height = props.height * devicePixelRatio;
    canvas.style.width = `${props.width}px`;
    canvas.style.height = `${props.height}px`;
  }, [props.width, props.height]);

  useEffect(() => {
    const renderFrame = () => {
      const canvas = canvasRef.current!;
      if (canvas != null) {
        requestAnimationFrame(renderFrame);
        const keys: number[] = [];
        for (const id of channelIds) {
          const status = playerContext.player.getChannelStatus(id);
          if (status?.kcode != null) {
            keys.push(status.kcode);
          }
        }
        props.painter(canvas, keys);
      }
    };
    renderFrame();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
      }}
    ></canvas>
  );
}

export function PianoRoll() {
  const boxRef = useRef<HTMLDivElement | null>(null);
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

  const [mode, setMode] = useState("2d");
  const onModeChange = () => {
    if (mode == "2d") {
      setMode("3d");
    } else {
      setMode("2d");
    }
  };

  const transform = () => {
    if (mode == "3d") {
      return "scaleY(1.2) translateY(-20%) perspective(900px) rotateX(-130deg) rotateZ(90deg) rotateY(0deg)";
    } else {
      return "none";
    }
  };

  return (
    <Card sx={{ position: "relative", backgroundColor: "#121212", backgroundImage: "none" }}>
      <Box sx={{ display: "flex", zIndex: 2, position: "absolute", top: 8, right: 8, gap: 1 }}>
        <Button variant="outlined" sx={{ minWidth: 0, p: 0.5 }} onClick={onModeChange}>
          <ThreeDRotation fontSize="small" />
        </Button>
      </Box>
      <Box
        ref={boxRef}
        sx={{
          position: "relative",
          aspectRatio: "4/3",
          width: "100%",
          transformOrigin: "center",
          transformStyle: "preserve-3d",
          transform: transform,
          transition: "transform 1s ease",
        }}
      >
        <AutoSizeCanvas painter={paintPianoRollBg} width={size.width} height={size.height} />
        <PianoRollCanvas width={size.width} height={size.height} />
        <AutoSizeCanvas painter={paintWhiteKeyboard} width={size.width} height={size.height} />
        <HighlightCanvas painter={paintWhiteHighlight} width={size.width} height={size.height} />
        <AutoSizeCanvas
          painter={(canvas) => paintBlackKeyboard(canvas, mode == "3d")}
          width={size.width}
          height={size.height}
        />
        <HighlightCanvas
          painter={(canvas, keys) => paintBlackHighlight(canvas, keys, mode == "3d")}
          width={size.width}
          height={size.height}
        />
      </Box>
    </Card>
  );
}
