import { ThreeDRotation } from "@mui/icons-material";
import { Box, Button, Card } from "@mui/material";
import * as Colors from "@mui/material/colors";
import { useContext, useEffect, useRef, useState } from "react";
import { PlayerContext, PlayerContextState } from "../contexts/PlayerContext";
import { ChannelId } from "../kss/channel-status";
import { AppContext } from "../contexts/AppContext";

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

const voiceColorMap = [
  "#00cccc",
  "#888888",
  "#3eb849",
  "#74d07d",
  "#5955e0",
  "#8076f1",
  "#b95e51",
  "#65dbef",
  "#db6559",
  "#ff897d",
  "#ccc35e",
  "#ded087",
  "#3aa241",
  "#b766b5",
  Colors.pink[700],
  Colors.brown[400],
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

type Seg = { note: number; start: number; end: number; color: string };

// --- パーティクルシステム ---
type Particle = {
  x: number; y: number;
  vx: number; vy: number;
  life: number;   // 1.0 → 0.0
  size: number;
  color: string;
};

const _particles: Particle[] = [];
let _lastRenderTime = 0;

function _spawnParticles(x: number, y: number, color: string, count: number) {
  for (let i = 0; i < count; i++) {
    // 上方向を中心に扇状に広がる
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
    const speed = (60 + Math.random() * 140) * devicePixelRatio;
    _particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.8 + Math.random() * 0.2,
      size: (1.5 + Math.random() * 2.5) * devicePixelRatio,
      color,
    });
  }
}

function _drawParticles(ctx: CanvasRenderingContext2D, dt: number) {
  for (let i = _particles.length - 1; i >= 0; i--) {
    const p = _particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 250 * devicePixelRatio * dt; // 重力
    p.life -= dt * 2.5;
    if (p.life <= 0) { _particles.splice(i, 1); continue; }

    const alpha = p.life * p.life;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = p.size * 3;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1.0;
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
}

function paintPianoRoll(
  canvas: HTMLCanvasElement,
  playerContext: PlayerContextState,
  rangeInSec: number,
  layered: boolean
) {
  const now = performance.now();
  const dt = Math.min((now - _lastRenderTime) / 1000, 1 / 20);
  _lastRenderTime = now;

  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let ch = 0; ch < channelIds.length; ch++) {
    const kh = canvas.height / 96;
    const h = kh - 2;
    const frames = Math.round(60 * rangeInSec) + (layered ? ch * 8 : 0);
    const step = canvas.width / frames;
    const nowIdx = Math.floor(frames * lpos);
    const nowX = nowIdx * step;
    const id = channelIds[ch];
    const baseColor: string = colorMap[ch]["A200"];

    const pastSpanInFrames = Math.floor(735 * frames * lpos);
    const futureSpanInFrames = Math.floor(735 * frames * (1.0 - lpos));
    const statuses = playerContext.player.getChannelStatusArray(
      id,
      pastSpanInFrames,
      futureSpanInFrames,
    );

    // ノートごとにセグメントを構築
    const segments: Seg[] = [];
    let cur: Seg | null = null;
    for (let i = 0; i < statuses.length; i++) {
      const s = statuses[i];
      const note = s?.kcode ?? null;
      if (note != null && note >= 0 && note < 96) {
        const color = s?.vnum != null ? voiceColorMap[s.vnum % 16] : baseColor;
        if (cur === null || cur.note !== note) {
          cur = { note, start: i, end: i, color };
          segments.push(cur);
        } else {
          cur.end = i;
          cur.color = color;
        }
      } else {
        cur = null;
      }
    }

    // セグメントを描画 + キーオン直後にパーティクルを生成
    for (const seg of segments) {
      const isPlaying = seg.start <= nowIdx && nowIdx <= seg.end;
      const x = seg.start * step;
      const w = Math.max(step, (seg.end - seg.start + 1) * step);
      const y = canvas.height * (1.0 - (seg.note + 1) / 96) + (kh - h) / 2;

      if (isPlaying) {
        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur = 8 * devicePixelRatio;
        ctx.fillStyle = seg.color + "ff";
        ctx.fillRect(x, y, w, h);
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#ffffff60";

        // キーオン直後（nowIdx との距離が近い）ほど多くパーティクルを出す
        const noteAge = nowIdx - seg.start; // フレーム数
        if (noteAge < 12) {
          const rate = 1 - noteAge / 12;
          const count = Math.round(rate * rate * 5);
          if (count > 0) {
            _spawnParticles(nowX, y + h / 2, seg.color, count);
          }
        }
      } else {
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.fillStyle = seg.color + "e0";
      }
      ctx.fillRect(x, y, w, h);
    }
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
  }

  // パーティクルを最前面に描画
  _drawParticles(ctx, dt);
}

function PianoRollCanvas(props: { width: number; height: number }) {
  const appContext = useContext(AppContext);
  const playerContext = useContext(PlayerContext);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appContextRef = useRef(appContext);
  appContextRef.current = appContext;

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
        paintPianoRoll(
          canvas,
          playerContext,
          appContextRef.current.pianoRollRangeInSec,
          appContextRef.current.pianoRollLayered
        );
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
  const painterRef = useRef(props.painter);

  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = props.width * devicePixelRatio;
    canvas.height = props.height * devicePixelRatio;
    canvas.style.width = `${props.width}px`;
    canvas.style.height = `${props.height}px`;
  }, [props.width, props.height]);

  useEffect(() => {
    painterRef.current = props.painter;
  }, [props.painter]);

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
        painterRef.current(canvas, keys);
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

export function PianoRoll(props: { mode: string }) {
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

  const transform = () => {
    if (props.mode == "3d") {
      return "scaleY(1.2) translateY(-20%) perspective(900px) rotateX(-130deg) rotateZ(90deg) rotateY(0deg)";
    } else {
      return "none";
    }
  };

  return (
    <Card sx={{ position: "relative", backgroundColor: "#121212", backgroundImage: "none" }}>
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
          painter={(canvas) => paintBlackKeyboard(canvas, props.mode == "3d")}
          width={size.width}
          height={size.height}
        />
        <HighlightCanvas
          painter={(canvas, keys) => paintBlackHighlight(canvas, keys, props.mode == "3d")}
          width={size.width}
          height={size.height}
        />
       
      </Box>
    </Card>
  );
}
