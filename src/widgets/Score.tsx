import { Box, Slider, Stack, Typography } from "@mui/material";
import { MusicNote } from "@mui/icons-material";
import { useContext, useEffect, useRef, useState } from "react";
import { PlayerContext } from "../contexts/PlayerContext";
import type { ChannelId } from "../kss/channel-status";
import type { KSSPlayer } from "../kss/kss-player";
import type { KSSDeviceName } from "../kss/kss-device";

const lpos = 0.25;
const RANGE_SEC = 4;
const ROW_HEIGHT = 96;

const CHROMA_TO_DIA = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
const IS_SHARP = [false, true, false, true, false, false, true, false, true, false, true, false];

function kcode2staff(kcode: number): number {
  const octave = Math.floor(kcode / 12) - 1;
  return CHROMA_TO_DIA[kcode % 12] + octave * 7 - 30;
}

// 音価の種別と属性
type NoteType = { name: string; filled: boolean; hasStem: boolean; flags: number };
const NOTE_TYPES: NoteType[] = [
  { name: "whole",       filled: false, hasStem: false, flags: 0 },
  { name: "half",        filled: false, hasStem: true,  flags: 0 },
  { name: "quarter",     filled: true,  hasStem: true,  flags: 0 },
  { name: "eighth",      filled: true,  hasStem: true,  flags: 1 },
  { name: "sixteenth",   filled: true,  hasStem: true,  flags: 2 },
  { name: "shorter",     filled: true,  hasStem: true,  flags: 2 },
];

function getNoteType(durationFrames: number, framesPerBeat: number): NoteType {
  const beats = durationFrames / framesPerBeat;
  if (beats >= 3.0)   return NOTE_TYPES[0]; // whole
  if (beats >= 1.5)   return NOTE_TYPES[1]; // half
  if (beats >= 0.75)  return NOTE_TYPES[2]; // quarter
  if (beats >= 0.375) return NOTE_TYPES[3]; // eighth
  if (beats >= 0.18)  return NOTE_TYPES[4]; // sixteenth
  return NOTE_TYPES[5];
}

// ---- 描画ユーティリティ ----

function drawNoteHead(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, rx: number, ry: number,
  type: NoteType, color: string, isPlaying: boolean
) {
  if (isPlaying) { ctx.shadowColor = "#ffffff"; ctx.shadowBlur = 6 * devicePixelRatio; }

  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, -0.22, 0, Math.PI * 2);

  if (type.filled) {
    ctx.fillStyle = isPlaying ? color + "ff" : color + "c0";
    ctx.fill();
  } else {
    // 白抜き音符 (half / whole): 外形を塗ってから内部を抜く
    ctx.fillStyle = isPlaying ? color + "ff" : color + "c0";
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, y, rx * 0.52, ry * 0.38, -0.22, 0, Math.PI * 2);
    ctx.fillStyle = "#00000000"; // 透明にしたいが背景が不定なので…
    // globalCompositeOperation で切り抜く
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "destination-out";
    ctx.fill();
    ctx.globalCompositeOperation = prev;
  }

  if (isPlaying) {
    ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, -0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }
}

function drawStem(
  ctx: CanvasRenderingContext2D,
  noteX: number, noteY: number, rx: number, ry: number,
  sp: number, lineSpacing: number, color: string, isPlaying: boolean
): { x: number; y: number; up: boolean } {
  const up = sp < 5;
  const sx = noteX + (up ? rx * 0.85 : -rx * 0.85);
  const sy0 = noteY + (up ? -ry * 0.4 : ry * 0.4);
  const sy1 = sy0 + (up ? -1 : 1) * 3.5 * lineSpacing;

  ctx.strokeStyle = isPlaying ? color + "ff" : color + "b0";
  ctx.lineWidth = Math.max(1, ry * 0.28);
  ctx.beginPath();
  ctx.moveTo(sx, sy0);
  ctx.lineTo(sx, sy1);
  ctx.stroke();

  return { x: sx, y: sy1, up };
}

function drawFlags(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, up: boolean, count: number,
  lineSpacing: number, color: string, isPlaying: boolean
) {
  const dir = up ? 1 : -1;
  const fw = lineSpacing * 1.3;
  const fh = lineSpacing * 1.0;
  ctx.strokeStyle = isPlaying ? color + "ff" : color + "b0";
  ctx.lineWidth = Math.max(1, lineSpacing * 0.13);
  for (let f = 0; f < count; f++) {
    const y0 = sy + dir * f * lineSpacing * 0.75;
    ctx.beginPath();
    ctx.moveTo(sx, y0);
    ctx.bezierCurveTo(
      sx + fw,      y0 + dir * fh * 0.25,
      sx + fw * 0.8, y0 + dir * fh * 0.75,
      sx,            y0 + dir * fh
    );
    ctx.stroke();
  }
}

function drawRest(
  ctx: CanvasRenderingContext2D,
  x: number, staffBottom: number, step2: number,
  type: NoteType, lineSpacing: number, color: string
) {
  ctx.fillStyle = color + "70";
  const w = lineSpacing * 0.7;
  const h = step2 * 0.6;
  if (!type.hasStem) {
    // 全休符: 第4線からぶら下がる
    ctx.fillRect(x - w / 2, staffBottom - 7 * step2, w, h);
  } else if (!type.filled) {
    // 二分休符: 第3線の上に座る
    ctx.fillRect(x - w / 2, staffBottom - 5 * step2 - h, w, h);
  } else {
    // 四分以下休符: 細い縦棒
    ctx.fillRect(x - w * 0.15, staffBottom - 7 * step2, w * 0.3, step2 * 2.5);
    if (type.flags > 0) {
      // 旗付き休符: 小さなフラグ
      for (let f = 0; f < type.flags; f++) {
        const fy = staffBottom - (7 - f) * step2;
        ctx.fillRect(x, fy, lineSpacing * 0.6, step2 * 0.5);
      }
    }
  }
}

function paintScore(
  canvas: HTMLCanvasElement,
  player: KSSPlayer,
  id: ChannelId,
  color: string,
  bpm: number,
  beatsPerMeasure: number
) {
  const ctx = canvas.getContext("2d")!;
  const cw = canvas.width;
  const ch = canvas.height;
  ctx.clearRect(0, 0, cw, ch);

  // 五線の座標
  // 五線の上下に加線2本分ずつの余白を確保
  // lineSpacing = ch/8 なら: 上余白 = 2*lineSpacing, 下余白 = 2*lineSpacing
  const lineSpacing = ch / 8;
  const staffBottom = ch * 0.75;
  const step2 = lineSpacing / 2;
  const framesPerBeat = (60 / bpm) * 60; // 60fps前提

  const frames = Math.round(60 * RANGE_SEC);
  const pxPerFrame = cw / frames;
  const nowIdx = Math.floor(frames * lpos);
  const nowX = nowIdx * pxPerFrame;

  // 五線
  ctx.strokeStyle = "rgba(170,170,170,0.4)";
  ctx.lineWidth = Math.max(1, ch * 0.014);
  for (let i = 0; i < 5; i++) {
    const y = staffBottom - (i * 2) * step2;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke();
  }

  // 小節線（BPM から等間隔に）
  const framesPerMeasure = framesPerBeat * beatsPerMeasure;
  const pxPerMeasure = framesPerMeasure * pxPerFrame;
  // now に最も近い小節線を基準に描画
  const baseOffset = nowX % pxPerMeasure;
  ctx.strokeStyle = "rgba(200,200,200,0.25)";
  ctx.lineWidth = Math.max(1, ch * 0.014);
  for (let bx = baseOffset; bx < cw; bx += pxPerMeasure) {
    ctx.beginPath();
    ctx.moveTo(bx, staffBottom - 8 * step2);
    ctx.lineTo(bx, staffBottom);
    ctx.stroke();
  }
  for (let bx = baseOffset - pxPerMeasure; bx >= 0; bx -= pxPerMeasure) {
    ctx.beginPath();
    ctx.moveTo(bx, staffBottom - 8 * step2);
    ctx.lineTo(bx, staffBottom);
    ctx.stroke();
  }

  // now ライン
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3 * devicePixelRatio, 3 * devicePixelRatio]);
  ctx.beginPath(); ctx.moveTo(nowX, 0); ctx.lineTo(nowX, ch); ctx.stroke();
  ctx.setLineDash([]);

  // ノートデータ取得
  const past = Math.floor(735 * frames * lpos);
  const future = Math.floor(735 * frames * (1 - lpos));
  const statuses = player.getChannelStatusArray(id, past, future);

  // セグメント構築
  type Seg = { sp: number; sharp: boolean; start: number; end: number };
  const segs: Seg[] = [];
  let cur: Seg | null = null;
  for (let i = 0; i < statuses.length; i++) {
    const kc = statuses[i]?.kcode ?? null;
    if (kc != null && kc >= 12 && kc < 108) {
      const sp = kcode2staff(kc);
      const sharp = IS_SHARP[kc % 12];
      if (cur === null || cur.sp !== sp) {
        cur = { sp, sharp, start: i, end: i };
        segs.push(cur);
      } else {
        cur.end = i;
      }
    } else {
      cur = null;
    }
  }

  // 音符・休符を描画
  const noteRx = step2 * 1.05;
  const noteRy = step2 * 0.72;
  const lw = Math.max(1, ch * 0.014);

  // まず休符（音符の下に描く）
  let prevEnd = 0;
  for (const seg of segs) {
    if (seg.start > prevEnd + 2) {
      // 休符
      const restStart = prevEnd;
      const restEnd = seg.start - 1;
      const restMid = (restStart + restEnd) / 2;
      const restDur = restEnd - restStart + 1;
      const restType = getNoteType(restDur, framesPerBeat);
      drawRest(ctx, restMid * pxPerFrame, staffBottom, step2, restType, lineSpacing, color);
    }
    prevEnd = seg.end + 1;
  }
  // 最後の休符（末尾 ～ 右端）
  if (prevEnd < frames - 2 && segs.length > 0) {
    const restMid = (prevEnd + frames) / 2;
    const restDur = frames - prevEnd;
    drawRest(ctx, restMid * pxPerFrame, staffBottom, step2, getNoteType(restDur, framesPerBeat), lineSpacing, color);
  }

  // 音符
  for (const seg of segs) {
    const isPlaying = seg.start <= nowIdx && nowIdx <= seg.end;
    const noteX = seg.start * pxPerFrame + noteRx;
    const noteY = staffBottom - seg.sp * step2;
    const dur = seg.end - seg.start + 1;
    const type = getNoteType(dur, framesPerBeat);

    // 加線
    const lx1 = noteX - noteRx * 1.5;
    const lx2 = noteX + noteRx * 1.5;
    ctx.strokeStyle = isPlaying ? "rgba(255,255,255,0.4)" : "rgba(170,170,170,0.35)";
    ctx.lineWidth = lw;
    if (seg.sp < 0) {
      const lowest = Math.ceil(seg.sp / 2) * 2;
      for (let p = -2; p >= lowest; p -= 2) {
        const ly = staffBottom - p * step2;
        ctx.beginPath(); ctx.moveTo(lx1, ly); ctx.lineTo(lx2, ly); ctx.stroke();
      }
    }
    if (seg.sp > 8) {
      const highest = Math.floor(seg.sp / 2) * 2;
      if (highest > 8) {
        for (let p = 10; p <= highest; p += 2) {
          const ly = staffBottom - p * step2;
          ctx.beginPath(); ctx.moveTo(lx1, ly); ctx.lineTo(lx2, ly); ctx.stroke();
        }
      }
    }

    // 音符頭
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
    drawNoteHead(ctx, noteX, noteY, noteRx, noteRy, type, color, isPlaying);

    // 符幹 + 旗
    if (type.hasStem) {
      const stem = drawStem(ctx, noteX, noteY, noteRx, noteRy, seg.sp, lineSpacing, color, isPlaying);
      if (type.flags > 0) {
        drawFlags(ctx, stem.x, stem.y, stem.up, type.flags, lineSpacing, color, isPlaying);
      }
    }

    // シャープ記号
    if (seg.sharp) {
      ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
      ctx.fillStyle = isPlaying ? "rgba(255,255,255,0.8)" : color + "90";
      ctx.font = `bold ${Math.round(step2 * 2.4)}px serif`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "right";
      ctx.fillText("♯", noteX - noteRx * 1.3, noteY - step2 * 0.1);
    }
    ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
  }
}

// ---- コンポーネント ----

type ScoreRowProps = {
  label: string;
  channelId: ChannelId;
  color: string;
  bpm: number;
  beatsPerMeasure: number;
};

function ScoreRow({ label, channelId, color, bpm, beatsPerMeasure }: ScoreRowProps) {
  const { player } = useContext(PlayerContext);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const stateRef = useRef({ bpm, beatsPerMeasure });
  stateRef.current = { bpm, beatsPerMeasure };

  useEffect(() => {
    const observer = new ResizeObserver(() => setWidth(boxRef.current?.clientWidth ?? 0));
    observer.observe(boxRef.current!);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = width * devicePixelRatio;
    canvas.height = ROW_HEIGHT * devicePixelRatio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${ROW_HEIGHT}px`;
  }, [width]);

  useEffect(() => {
    const renderFrame = () => {
      if (canvasRef.current && width > 0) {
        requestAnimationFrame(renderFrame);
        paintScore(canvasRef.current, player, channelId, color, stateRef.current.bpm, stateRef.current.beatsPerMeasure);
      }
    };
    renderFrame();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  return (
    <Stack direction="row" sx={{ alignItems: "center", mb: "1px" }}>
      <Typography sx={{
        width: "48px", flexShrink: 0, fontSize: "9px",
        color: "text.secondary", textAlign: "right", pr: "4px",
        lineHeight: 1, userSelect: "none",
      }}>
        {label}
      </Typography>
      <Box ref={boxRef} sx={{ position: "relative", height: `${ROW_HEIGHT}px`, flex: 1, maxWidth: "640px" }}>
        <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0 }} />
      </Box>
    </Stack>
  );
}

// BPM コントロール（タブヘッダ右側に置く用）
export function ScoreControl({ bpm, onChange }: { bpm: number; onChange: (v: number) => void }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
      <MusicNote sx={{ fontSize: 16 }} />
      <Slider
        min={40} max={240} value={bpm}
        onChange={(_e, v) => onChange(v as number)}
        sx={{ ml: 0.5, mr: 0.5, width: "80px", color: "#999" }}
        size="small"
        valueLabelFormat={(v) => `${v} BPM`}
        valueLabelDisplay="auto"
      />
    </Box>
  );
}

type DeviceSection = { device: KSSDeviceName; rows: Array<{ label: string; index: number }>; color: string };

export function ScoreList({ bpm, beatsPerMeasure }: { bpm: number; beatsPerMeasure?: number }) {
  const bpMeasure = beatsPerMeasure ?? 4;
  const sections: DeviceSection[] = [
    {
      device: "opll", color: "#00cccc",
      rows: Array.from({ length: 9 }, (_, i) => ({ label: `OPLL ${i + 1}`, index: i })),
    },
    {
      device: "psg", color: "#5588ff",
      rows: [
        { label: "PSG A", index: 0 },
        { label: "PSG B", index: 1 },
        { label: "PSG C", index: 2 },
      ],
    },
    {
      device: "scc", color: "#cccc22",
      rows: Array.from({ length: 5 }, (_, i) => ({ label: `SCC ${i + 1}`, index: i })),
    },
  ];

  return (
    <Stack sx={{ width: "100%", overflowY: "auto", overflowX: "hidden", py: "4px", pl: "4px" }}>
      {sections.map((sec) =>
        sec.rows.map((row) => (
          <ScoreRow
            key={`${sec.device}-${row.index}`}
            label={row.label}
            channelId={{ device: sec.device, index: row.index }}
            color={sec.color}
            bpm={bpm}
            beatsPerMeasure={bpMeasure}
          />
        ))
      )}
    </Stack>
  );
}
