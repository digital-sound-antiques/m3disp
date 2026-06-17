import * as Colors from "@mui/material/colors";
import type { PlayerContextState } from "../contexts/PlayerContext";
import { type ChannelId, type ChannelStatus, getStatusFromSnapshot } from "../kss/channel-status";
import type { KSSDecoderDeviceSnapshot } from "../kss/kss-decoder-worker";

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

// Default 16-color palette for the "by tone" (voice) coloring mode. Indexed by
// the channel's voice number (vnum % 16). Editable via the color settings dialog.
export const defaultVoiceColors: string[] = [
  "#00cccc", "#888888", "#3eb849", "#74d07d", "#5955e0", "#8076f1",
  "#b95e51", "#65dbef", "#db6559", "#ff897d", "#ccc35e", "#ded087",
  "#3aa241", "#b766b5", Colors.pink[700], Colors.brown[400],
];

// Default per-channel palette for the "by channel" coloring mode in "simple"
// style. One entry per channelIds[] slot (25 total). Generated in the OKLCH
// perceptual color space at fixed perceptual lightness/chroma (L=0.70, C=0.165,
// trimmed per-hue only where needed to stay in the sRGB gamut) so every color
// reads as equally bright and vivid — uniform perceptual L/C is what gives
// cohesion across the full hue range (plain HSL does not). The PSG noise
// channels are grouped into a red family on purpose; the remaining tonal
// channels take non-red hues spread by the golden angle so neighbours land far
// apart on the wheel.
export const defaultChannelColors: string[] = [
  // OPLL FM 1-9
  "#b99c1c", "#20ace5", "#47b95f", "#968efa", "#e18516",
  "#1fb3ba", "#dd72c2", "#9ca911", "#4fa1fb",
  // OPLL rhythm BD/SD/TOM/CYM/HH
  "#1db98d", "#b780ef", "#c8951c", "#22afd2", "#6eb441",
  // PSG tone 1-3 / noise 1-3 (noise = red)
  "#7f95fe", "#07b6ac", "#d176d6", "#e75f66", "#fb8370", "#e56636",
  // SCC 1-5
  "#b0a106", "#1aa9f4", "#1fbb6f", "#a388fb", "#d78c18",
];

const colorMap = [
  Colors.teal, Colors.teal, Colors.teal, Colors.teal, Colors.teal,
  Colors.teal, Colors.teal, Colors.teal, Colors.teal,
  Colors.pink, Colors.pink, Colors.pink, Colors.pink, Colors.pink,
  Colors.blue, Colors.blue, Colors.blue,
  Colors.red, Colors.red, Colors.red,
  Colors.yellow, Colors.yellow, Colors.yellow, Colors.yellow, Colors.yellow,
];

export type PianoRollColorMode = "voice" | "channel";

/** Per-render color configuration resolved by the caller from app settings. */
export type PianoRollColorConfig = {
  /** Coloring mode per device. A missing device defaults to "voice". */
  mode: { [device: string]: PianoRollColorMode };
  /** Resolved per-channel colors (length === channelIds.length). */
  channelColors: string[];
  /** Resolved 16-entry voice palette (indexed by vnum % 16). */
  voiceColors: string[];
};

const defaultColorConfig: PianoRollColorConfig = {
  mode: { opll: "voice", psg: "voice", scc: "voice" },
  channelColors: defaultChannelColors,
  voiceColors: defaultVoiceColors,
};

export const lpos = 0.25;

// ---- Types ----

type Seg = { note: number; start: number; end: number; color: string; gap: boolean };

// ---- Per-channel status cache, keyed by NTSC frame index ----
//
// Heavy register decoding (getStatusFromSnapshot) runs at most ONCE per NTSC
// frame; results are cached and reused across rAF frames.
//
// Source of truth is player._snapshots. play()/abort() assign a brand-new
// array, so we detect song changes purely by array identity — no dependency
// on decodermessage / statechange event ordering.
//
// IMPORTANT — on-demand, NOT a [0, length) scan:
// After a song switch, decodermessage callbacks still queued for the PREVIOUS
// song (recycleDecoder reuses the worker) can land in the NEW _snapshots array
// at large sparse indices, inflating .length. A length-based incremental scan
// would mark the real new-song frames as "already processed" and never evaluate
// them, leaving the roll permanently blank. We instead evaluate only the indices
// actually read for the visible window, so stray far-away writes are ignored.
// Undecoded frames are returned as null WITHOUT caching, so they fill in once
// the decoder produces them.

let cachedSnapshotsRef: (KSSDecoderDeviceSnapshot | undefined)[] | null = null;
let statusCaches: (ChannelStatus | null)[][] = channelIds.map(() => []);

/** Reset the cache when the snapshot array is replaced (song change / stop). */
function resetCacheIfSongChanged(player: PlayerContextState["player"]) {
  if (player._snapshots !== cachedSnapshotsRef) {
    cachedSnapshotsRef = player._snapshots;
    statusCaches = channelIds.map(() => []);
  }
}

/**
 * Cached status for (channel, ntsc), computed on first access.
 * Undecoded frames (no snapshot yet) return null and are NOT cached.
 */
function getStatusCached(
  player: PlayerContextState["player"],
  ch: number,
  ntsc: number
): ChannelStatus | null {
  if (ntsc < 0) return null;
  const snap = player._snapshots[ntsc];
  if (!snap) return null; // not decoded yet — do not cache
  const cache = statusCaches[ch];
  let v = cache[ntsc];
  if (v === undefined) {
    v = getStatusFromSnapshot(snap, channelIds[ch]);
    cache[ntsc] = v;
  }
  return v;
}

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

// Pre-rendered radial-gradient glow sprite per color. The blur is baked once,
// so drawing a particle is just a (GPU) drawImage — far cheaper than setting
// shadowBlur per particle, while still looking glowy.
const glowSprites = new Map<string, HTMLCanvasElement>();
function getGlowSprite(color: string): HTMLCanvasElement {
  let s = glowSprites.get(color);
  if (!s) {
    const R = 16;
    s = document.createElement("canvas");
    s.width = s.height = R * 2;
    const g = s.getContext("2d")!;
    const grad = g.createRadialGradient(R, R, 0, R, R, R);
    grad.addColorStop(0, "#ffffff");      // hot white core
    grad.addColorStop(0.25, color);        // channel color
    grad.addColorStop(1, color + "00");    // fade to transparent
    g.fillStyle = grad;
    g.fillRect(0, 0, R * 2, R * 2);
    glowSprites.set(color, s);
  }
  return s;
}

export function spawnParticles(x: number, y: number, color: string, count: number, sizeScale = 1) {
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
    const speed = (60 + Math.random() * 140) * devicePixelRatio;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.8 + Math.random() * 0.2,
      size: (0.8 + Math.random() * 1.6) * devicePixelRatio * sizeScale,
      color,
    });
  }
}

// Draw via baked glow sprites with additive ("lighter") compositing: no
// per-particle shadowBlur (the expensive part), yet dense bursts add up to a
// bright flash. Lifetime is short (~0.4s) so the live count stays naturally
// bounded without a hard cap.
function drawParticles(ctx: CanvasRenderingContext2D, dt: number) {
  // advance + cull
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 250 * devicePixelRatio * dt;
    p.life -= dt * 2.5;
    if (p.life <= 0) particles.splice(i, 1);
  }
  if (particles.length === 0) return;

  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    ctx.globalAlpha = p.life * p.life;
    const r = p.size * 2.5; // glow radius (wider than the core)
    ctx.drawImage(getGlowSprite(p.color), p.x - r, p.y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1.0;
  ctx.globalCompositeOperation = "source-over";
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

// ---- Main piano roll drawing ----

export function paintPianoRoll(
  canvas: HTMLCanvasElement,
  playerContext: PlayerContextState,
  rangeInSec: number,
  layered: boolean,
  showParticles: boolean,
  colorConfig: PianoRollColorConfig = defaultColorConfig
) {
  const now = performance.now();
  const dt = Math.min((now - lastRenderTime) / 1000, 1 / 20);
  lastRenderTime = now;

  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Reset the status cache if the song changed (snapshot array replaced).
  resetCacheIfSongChanged(playerContext.player);

  // Compute latency-corrected current NTSC frame once, shared across channels
  const audioFrame = playerContext.player.progress?.renderer?.currentFrame ?? 0;
  const latencySamples = (playerContext.player.outputLatency ?? 0)
    * (playerContext.player.audioContext?.sampleRate ?? 44100);
  let currentNtsc = Math.floor(Math.max(0, audioFrame - latencySamples) / 735);

  // During a song switch the renderer's currentFrame can briefly still point at
  // the previous song's (later) position while the new song's _snapshots only
  // holds a few decoded frames. Reading that undecoded future range would render
  // blank. Clamp to the decoded range so the latest available data is shown until
  // currentFrame catches up.
  const decodedLen = playerContext.player._snapshots.length;
  if (decodedLen > 0 && currentNtsc >= decodedLen) currentNtsc = decodedLen - 1;

  const kh = canvas.height / 96;
  const h = kh - 2;
  const GAP = 2; // leading gap (canvas px) for hard breaks (real key-on / note change)

  // Deferred draws for currently-playing segments so they always sit on top,
  // giving a stable z-order regardless of channel index.
  type Draw = { x: number; y: number; w: number; color: string; nowX: number; noteAge: number; vol: number };
  const playingDraws: Draw[] = [];

  // Pass 1: build segments per channel, draw non-playing ones immediately
  for (let ch = 0; ch < channelIds.length; ch++) {
    const frames = Math.round(60 * rangeInSec) + (layered ? ch * 8 : 0);
    const step = canvas.width / frames;
    const nowIdx = Math.floor(frames * lpos);
    const nowX = nowIdx * step;
    const baseColor: string = (colorMap[ch] as any)["A200"];
    const channelMode = colorConfig.mode[channelIds[ch].device] ?? "voice";

    // Read statuses on demand (computed once per NTSC frame, then cached)
    const windowStart = currentNtsc - Math.floor(frames * lpos);

    // Build segments (split on key-on edge even for the same note)
    const segments: Seg[] = [];
    let cur: Seg | null = null;
    for (let i = 0; i < frames; i++) {
      const idx = windowStart + i;
      const s = getStatusCached(playerContext.player, ch, idx);
      const note = s?.kcode ?? null;
      const isAttack = (s?.keyKeepFrames ?? Infinity) === 0;
      if (note != null && note >= 0 && note < 96) {
        const color =
          channelMode === "channel"
            ? colorConfig.channelColors[ch] ?? baseColor
            : s?.vnum != null
              ? colorConfig.voiceColors[s.vnum % 16] ?? baseColor
              : baseColor;
        if (cur === null || cur.note !== note || isAttack) {
          // Real key-on / note change → hard break (new block with a leading gap)
          cur = { note, start: i, end: i, color, gap: true };
          segments.push(cur);
        } else if (cur.color !== color) {
          // Timbre (vnum) change mid-note → soft break: split for the new color
          // but with no gap, so the blocks stay visually contiguous.
          cur = { note, start: i, end: i, color, gap: false };
          segments.push(cur);
        } else {
          cur.end = i;
        }
      } else {
        cur = null;
      }
    }

    for (const seg of segments) {
      const g = seg.gap ? GAP : 0;
      const x = seg.start * step + g;
      const w = Math.max(1, (seg.end - seg.start + 1) * step - g);
      const y = canvas.height * (1.0 - (seg.note + 1) / 96) + (kh - h) / 2;
      const isPlaying = seg.start <= nowIdx && nowIdx <= seg.end;

      if (isPlaying) {
        // Volume at the play head (0-15); windowStart + nowIdx === currentNtsc.
        const vol = getStatusCached(playerContext.player, ch, windowStart + nowIdx)?.vol ?? 15;
        playingDraws.push({ x, y, w, color: seg.color, nowX, noteAge: nowIdx - seg.start, vol });
      } else {
        ctx.fillStyle = seg.color + "99"; // dimmer when not sounding
        ctx.fillRect(x, y, w, h);
      }
    }
  }

  // Pass 2: draw playing segments on top, with a glow + particles
  for (const d of playingDraws) {
    ctx.save();
    // Outer halo: a wide, additive bloom around the note.
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = d.color;
    ctx.shadowBlur = 10 * devicePixelRatio;
    ctx.fillStyle = d.color + "ff";
    ctx.fillRect(d.x, d.y, d.w, h);
    // Second additive pass tightens the glow into a brighter core.
    ctx.shadowBlur = 3 * devicePixelRatio;
    ctx.fillRect(d.x, d.y, d.w, h);
    ctx.restore();

    // Solid body on top so the note color stays true at its center.
    ctx.save();
    ctx.fillStyle = d.color + "ff";
    ctx.fillRect(d.x, d.y, d.w, h);
    ctx.restore();

    if (showParticles) {
      const burst = d.noteAge < 16 ? Math.round((1 - d.noteAge / 16) ** 2 * 4) : 0;
      const trickle = Math.random() < 0.35 ? 1 : 0;
      const count = burst + trickle;
      // Scale particle size by channel volume: vol 0 → 50%, vol 15 → 100%.
      const sizeScale = 0.5 + 0.5 * (Math.max(0, Math.min(15, d.vol)) / 15);
      if (count > 0) spawnParticles(d.nowX, d.y + h / 2, d.color, count, sizeScale);
    }
  }

  drawParticles(ctx, dt);
}
