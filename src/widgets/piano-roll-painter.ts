import * as Colors from "@mui/material/colors";
import type { PlayerContextState } from "../contexts/PlayerContext";
import type { ChannelId } from "../kss/channel-status";
import type { BPMInfo } from "../kss/bpm-detector";

// ---- Channel definitions ----

export const channelIds: ChannelId[] = [
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
  "#00cccc", "#888888", "#3eb849", "#74d07d", "#5955e0", "#8076f1",
  "#b95e51", "#65dbef", "#db6559", "#ff897d", "#ccc35e", "#ded087",
  "#3aa241", "#b766b5", Colors.pink[700], Colors.brown[400],
];

const colorMap = [
  Colors.teal, Colors.teal, Colors.teal, Colors.teal, Colors.teal,
  Colors.teal, Colors.teal, Colors.teal, Colors.teal,
  Colors.pink, Colors.pink, Colors.pink, Colors.pink, Colors.pink,
  Colors.blue, Colors.blue, Colors.blue,
  Colors.red, Colors.red, Colors.red,
  Colors.yellow, Colors.yellow, Colors.yellow, Colors.yellow, Colors.yellow,
];

export const lpos = 0.25;

// ---- Types ----

type Seg = { note: number; start: number; end: number; color: string };

type Particle = {
  x: number; y: number;
  vx: number; vy: number;
  life: number;
  size: number;
  color: string;
};

// ---- Particle system ----

const particles: Particle[] = [];
let lastRenderTime = 0;

export function spawnParticles(x: number, y: number, color: string, count: number) {
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
    const speed = (60 + Math.random() * 140) * devicePixelRatio;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.8 + Math.random() * 0.2,
      size: (1.5 + Math.random() * 2.5) * devicePixelRatio,
      color,
    });
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, dt: number) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 250 * devicePixelRatio * dt;
    p.life -= dt * 2.5;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    ctx.shadowColor = p.color;
    ctx.shadowBlur = p.size * 3;
    ctx.globalAlpha = p.life * p.life;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1.0;
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
}

// ---- Keyboard / background ----

export function paintPianoRollBg(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const kh = Math.ceil(canvas.height / 96);
  for (let i = 0; i < 96; i++) {
    const k = i % 12;
    ctx.fillStyle = (k === 1 || k === 3 || k === 6 || k === 8 || k === 10) ? "#101010" : "#181818";
    ctx.fillRect(0, canvas.height * (1.0 - (i + 1) / 96), canvas.width, kh);
  }
}

export function paintWhiteKeyboard(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const dx = Math.floor(canvas.width * lpos - 32);
  const kh = Math.ceil(canvas.height / 56);
  ctx.fillStyle = "#f0f0f060";
  for (let i = 0; i < 56; i++) {
    ctx.fillRect(dx, canvas.height * (1.0 - (i + 1) / 56), 28, kh);
  }
}

export function paintBlackKeyboard(canvas: HTMLCanvasElement, flip: boolean) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const dx = Math.floor(canvas.width * lpos - 32) + (flip ? 6 : 0);
  const kh = Math.ceil(canvas.height / 96);
  ctx.fillStyle = "#121212";
  for (let i = 0; i < 96; i++) {
    const k = i % 12;
    if (k === 1 || k === 3 || k === 6 || k === 8 || k === 10)
      ctx.fillRect(dx, canvas.height * (1.0 - (i + 1) / 96), 22, kh);
  }
}

export function paintWhiteHighlight(canvas: HTMLCanvasElement, keys: number[]) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const dx = Math.floor(canvas.width * lpos - 32);
  const kh = Math.ceil(canvas.height / 96);
  ctx.fillStyle = "#f0f0f0f0";
  for (const i of keys) {
    const k = i % 12;
    if (k !== 1 && k !== 3 && k !== 6 && k !== 8 && k !== 10)
      ctx.fillRect(dx, canvas.height * (1.0 - (i + 1) / 96), 28, kh);
  }
}

export function paintBlackHighlight(canvas: HTMLCanvasElement, keys: number[], flip: boolean) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const dx = Math.floor(canvas.width * lpos - 32) + (flip ? 6 : 0);
  const kh = Math.ceil(canvas.height / 96);
  ctx.fillStyle = "#f0f0f0f0";
  for (const i of keys) {
    const k = i % 12;
    if (k === 1 || k === 3 || k === 6 || k === 8 || k === 10)
      ctx.fillRect(dx, canvas.height * (1.0 - (i + 1) / 96), 22, kh);
  }
}

export function paintKeyboardEdgeLine(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const x = Math.floor(canvas.width * lpos - 32) + 28;
  ctx.strokeStyle = "rgba(200,200,200,0.6)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, canvas.height);
  ctx.stroke();
}

// ---- Beat lines ----

export function paintBeatLines(
  canvas: HTMLCanvasElement,
  playerContext: PlayerContextState,
  rangeInSec: number,
  bpmInfo: BPMInfo,
  measureFrameOffset: number
) {
  const ctx = canvas.getContext("2d")!;
  const frames = Math.round(60 * rangeInSec);
  const step = canvas.width / frames;
  const nowIdx = Math.floor(frames * lpos);

  const audioFrame = playerContext.player.progress?.renderer?.currentFrame ?? 0;
  const latencySamples = (playerContext.player.outputLatency ?? 0)
    * (playerContext.player.audioContext?.sampleRate ?? 44100);
  const currentNtsc = Math.floor(Math.max(0, audioFrame - latencySamples) / 735);

  const { beatFrames } = bpmInfo;
  const winStart = currentNtsc - nowIdx;
  const winEnd   = currentNtsc + (frames - nowIdx);

  let startK = 0;
  while (startK < beatFrames.length - 1 && beatFrames[startK] < winStart) startK++;

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  for (let k = startK; k < beatFrames.length; k++) {
    const bf = beatFrames[k];
    if (bf > winEnd) break;
    const i = Math.round(nowIdx + (bf - currentNtsc + measureFrameOffset));
    if (i < 0 || i >= frames) continue;
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step, canvas.height);
    ctx.stroke();
  }
  ctx.restore();
}

// ---- Main piano roll drawing ----

export function paintPianoRoll(
  canvas: HTMLCanvasElement,
  playerContext: PlayerContextState,
  rangeInSec: number,
  layered: boolean,
  bpmInfo: BPMInfo | null,
  measureFrameOffset: number,
  showParticles: boolean
) {
  const now = performance.now();
  const dt = Math.min((now - lastRenderTime) / 1000, 1 / 20);
  lastRenderTime = now;

  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (bpmInfo) paintBeatLines(canvas, playerContext, rangeInSec, bpmInfo, measureFrameOffset);

  for (let ch = 0; ch < channelIds.length; ch++) {
    const kh = canvas.height / 96;
    const h = kh - 2;
    const frames = Math.round(60 * rangeInSec) + (layered ? ch * 8 : 0);
    const step = canvas.width / frames;
    const nowIdx = Math.floor(frames * lpos);
    const nowX = nowIdx * step;
    const id = channelIds[ch];
    const baseColor: string = (colorMap[ch] as any)["A200"];

    const pastSpanInFrames = Math.floor(735 * frames * lpos);
    const futureSpanInFrames = Math.floor(735 * frames * (1.0 - lpos));
    const statuses = playerContext.player.getChannelStatusArray(id, pastSpanInFrames, futureSpanInFrames);

    // Build segments (split on key-on edge even for the same note)
    const segments: Seg[] = [];
    let cur: Seg | null = null;
    for (let i = 0; i < statuses.length; i++) {
      const s = statuses[i];
      const note = s?.kcode ?? null;
      const isAttack = (s?.keyKeepFrames ?? Infinity) === 0;
      if (note != null && note >= 0 && note < 96) {
        const color = s?.vnum != null ? voiceColorMap[s.vnum % 16] : baseColor;
        if (cur === null || cur.note !== note || isAttack) {
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

    // Draw segments
    const gap = 2;
    for (const seg of segments) {
      const isPlaying = seg.start <= nowIdx && nowIdx <= seg.end;
      const x = seg.start * step + gap;
      const w = Math.max(1, (seg.end - seg.start + 1) * step - gap);
      const y = canvas.height * (1.0 - (seg.note + 1) / 96) + (kh - h) / 2;

      ctx.fillStyle = isPlaying ? seg.color + "ff" : seg.color + "90";
      ctx.fillRect(x, y, w, h);

      if (isPlaying && showParticles) {
        const noteAge = nowIdx - seg.start;
        const burst = noteAge < 16 ? Math.round((1 - noteAge / 16) ** 2 * 4) : 0;
        const trickle = Math.random() < 0.35 ? 1 : 0;
        const count = burst + trickle;
        if (count > 0) spawnParticles(nowX, y + h / 2, seg.color, count);
      }
    }
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
  }

  drawParticles(ctx, dt);

  if (bpmInfo) {
    const fontSize = Math.max(10, 11 * devicePixelRatio);
    ctx.font = `${fontSize}px monospace`;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillText(`♩=${Math.round(bpmInfo.bpm)}`, canvas.width - 6 * devicePixelRatio, 4 * devicePixelRatio);
  }
}
