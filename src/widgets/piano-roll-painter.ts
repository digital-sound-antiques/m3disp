import * as Colors from "@mui/material/colors";
import type { PlayerContextState } from "../contexts/PlayerContext";
import { type ChannelId, type ChannelStatus, getStatusFromSnapshot } from "../kss/channel-status";
import { pianoRollHighlight } from "./piano-roll-highlight";
import type { KSSDecoderDeviceSnapshot } from "../kss/kss-decoder-worker";
import type { KSSChannelMask, KSSDeviceName } from "../kss/kss-device";

// OPLL rhythm channels (index 9-13) use reversed mute bits (BD=13 … HH=9); PSG
// tone channels 3-5 share bits 0-2 with 0-2; SCC and OPLL melody map 1:1.
export const opllBit = (i: number) => (i < 9 ? i : 22 - i);
export function isChannelMuted(mask: KSSChannelMask, id: ChannelId): boolean {
  switch (id.device) {
    case "opll":
      return (mask.opll & (1 << opllBit(id.index))) !== 0;
    case "psg":
      return (mask.psg & (1 << (id.index % 3))) !== 0;
    case "scc":
      return (mask.scc & (1 << id.index)) !== 0;
    default:
      return false;
  }
}

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
// leading gap (canvas px) for hard breaks (real key-on / note change)
const GAP = 2;

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

// Particle appearance. "off" disables them; the others pick the sprite shape.
export type PianoRollParticleType = "off" | "spark" | "star" | "heart";
export const particleTypeCycle: PianoRollParticleType[] = ["off", "spark", "star", "heart"];
type ParticleShape = "spark" | "star" | "heart";

type Particle = {
  x: number; y: number;
  vx: number; vy: number;
  life: number;
  size: number;
  color: string;
  shape: ParticleShape;
  grav: number; // downward accel (px/s²), scaled to the spawn unit; 0 for shapes
};

// ---- Particle system ----

const particles: Particle[] = [];
let lastRenderTime = 0;

// Trace a 5-point star / a heart into the current path, centered at the origin
// and bounded by radius R. Used to bake the shaped particle sprites.
function traceStar(g: CanvasRenderingContext2D, R: number) {
  const spikes = 5, inner = R * 0.42;
  g.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const rad = i % 2 === 0 ? R : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / spikes;
    const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
}
// The classic heart curve (x = 16sin³t, y = 13cos t − 5cos2t − 2cos3t − cos4t),
// sampled once and normalized to fit centered in a unit box. Its natural
// proportions give a clean, symmetric heart — nicer than a hand-tuned bezier.
const HEART_PATH: [number, number][] = (() => {
  const N = 96;
  const raw: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    raw.push([x, -y]); // canvas y is down, so negate to put the lobes on top
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of raw) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const half = Math.max(maxX - minX, maxY - minY) / 2;
  return raw.map(([x, y]): [number, number] => [(x - cx) / half, (y - cy) / half]);
})();

function traceHeart(g: CanvasRenderingContext2D, R: number) {
  g.beginPath();
  for (let i = 0; i < HEART_PATH.length; i++) {
    const [x, y] = HEART_PATH[i];
    if (i === 0) g.moveTo(x * R, y * R);
    else g.lineTo(x * R, y * R);
  }
  g.closePath();
}

// Pre-rendered glow sprite per (shape, color). Baking the blur/shape once makes
// drawing a particle just a (GPU) drawImage — far cheaper than per-particle
// shadowBlur, while still looking glowy. Keyed by "shape|color".
const particleSprites = new Map<string, HTMLCanvasElement>();
function getParticleSprite(color: string, shape: ParticleShape): HTMLCanvasElement {
  const key = `${shape}|${color}`;
  let s = particleSprites.get(key);
  if (!s) {
    const R = 16;
    s = document.createElement("canvas");
    s.width = s.height = R * 2;
    const g = s.getContext("2d")!;
    if (shape === "spark") {
      const grad = g.createRadialGradient(R, R, 0, R, R, R);
      grad.addColorStop(0, "#ffffff");    // hot white core
      grad.addColorStop(0.25, color);      // channel color
      grad.addColorStop(1, color + "00");  // fade to transparent
      g.fillStyle = grad;
      g.fillRect(0, 0, R * 2, R * 2);
    } else {
      // Crisp solid shape (normal compositing, no glow/highlight) so the
      // star/heart outline stays clean and readable.
      g.translate(R, R);
      if (shape === "star") traceStar(g, R * 0.92);
      else traceHeart(g, R * 0.92);
      g.fillStyle = color;
      g.fill();
    }
    particleSprites.set(key, s);
  }
  return s;
}

// Hard cap on live particles: bounds worst-case additive overdraw (SPARK's main
// cost) on dense chords without changing how it looks in normal playback.
const MAX_PARTICLES = 1000;

// Particle size/speed scale with the roll height so they keep their proportions
// as the window grows/shrinks (like notes and keys do). `unit` ≈ this at a
// reference roll height, and also folds in devicePixelRatio (canvas height is in
// backing pixels).
const PARTICLE_REF_H = 400;

// A per-canvas particle store; the grid uses one per cell so many small canvases
// don't share (and fight over) a single global array.
export type ParticleStore = { list: Particle[]; last: number };
export const createParticleStore = (): ParticleStore => ({ list: [], last: 0 });
const defaultStore: ParticleStore = { list: particles, last: 0 };

export function spawnParticles(
  x: number, y: number, color: string, count: number, sizeScale = 1, shape: ParticleShape = "spark",
  unit = devicePixelRatio, store: ParticleStore = defaultStore,
) {
  const isShape = shape !== "spark";
  const list = store.list;
  if (list.length >= MAX_PARTICLES) return;
  count = Math.min(count, MAX_PARTICLES - list.length);
  // spark falls like a fountain; scale gravity to the spawn unit so it matches
  // the particle's size/speed (the grid uses a much smaller unit than the roll)
  const grav = isShape ? 0 : 250 * unit;
  for (let i = 0; i < count; i++) {
    // star/heart: size random 1–4×, and much more varied launch angle & distance
    // (and a longer life) so they scatter and read as shapes. spark: tight fan.
    const angle = isShape
      ? Math.random() * Math.PI * 2 // star/heart scatter evenly in all directions
      : -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
    const speed = isShape
      ? (15 + Math.random() * 130) * unit
      : (30 + Math.random() * 70) * unit;
    const size = isShape
      ? (0.25 + Math.random() * 2.75) * (shape === "star" ? 1.25 : 1.0) * unit * sizeScale
      : (0.6 + Math.random() * 1.0) * unit * sizeScale;
    list.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: isShape ? 1.2 + Math.random() * 0.9 : 0.8 + Math.random() * 0.2,
      size,
      color,
      shape,
      grav,
    });
  }
}

// Draw via baked glow sprites with additive ("lighter") compositing: no
// per-particle shadowBlur (the expensive part), yet dense bursts add up to a
// bright flash. Lifetime is short (~0.4s) so the live count stays naturally
// bounded without a hard cap.
function drawParticles(
  ctx: CanvasRenderingContext2D, dt: number, is3d = false, shape3d: { sx: number; sy: number } | null = null,
  store: ParticleStore = defaultStore,
) {
  const particles = store.list;
  // advance + cull
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.grav * dt; // spark falls like a fountain; shapes have grav 0
    p.life -= dt * 2.5;
    if (p.life <= 0) particles.splice(i, 1);
  }
  if (particles.length === 0) return;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    // spark glows (additive); star/heart draw as solid shapes so they stay crisp
    ctx.globalCompositeOperation = p.shape === "spark" ? "lighter" : "source-over";
    ctx.globalAlpha = p.life * p.life;
    // size already carries the star/heart size boost (see spawnParticles)
    const r = p.size * 2.5;
    const sprite = getParticleSprite(p.color, p.shape);
    if (is3d && p.shape !== "spark" && shape3d) {
      // Pre-distort shaped sprites by the inverse of the 3D transform's
      // non-uniform scale + 90° swap, so they render upright and undistorted
      // (otherwise the star/heart look squashed on the tilted surface).
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.transform(0, shape3d.sx, -shape3d.sy, 0, 0, 0);
      ctx.drawImage(sprite, -r, -r, r * 2, r * 2);
      ctx.restore();
    } else {
      ctx.drawImage(sprite, p.x - r, p.y - r, r * 2, r * 2);
    }
  }
  ctx.globalAlpha = 1.0;
  ctx.globalCompositeOperation = "source-over";
}

// ---- Keyboard / background ----

export function paintPianoRollBg(canvas: HTMLCanvasElement, primary = "#ffffff", showLanes = true) {
  const ctx = canvas.getContext("2d")!;
  // transparent background (no dark fill) so the roll composites over whatever is
  // behind it; white-key rows get a faint primary-colour tint (black-key rows are
  // left blank), plus faint per-octave lines to hint the pitch lanes. The key
  // lanes are hidden when the keyboard overlay is off.
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // when the keyboard overlay is off, the roll background stays fully blank
  if (!showLanes) return;
  const px = Math.max(1, Math.floor(devicePixelRatio));
  const rowH = Math.ceil(canvas.height / 96);
  ctx.globalAlpha = 0.03;
  ctx.fillStyle = primary;
  for (let i = 0; i < 96; i++) {
    const k = i % 12;
    const isBlack = k === 1 || k === 3 || k === 6 || k === 8 || k === 10;
    if (isBlack) continue; // black-key rows: nothing
    ctx.fillRect(0, canvas.height * (1 - (i + 1) / 96), canvas.width, rowH);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  for (let o = 1; o < 8; o++) {
    const gy = canvas.height * (1 - (o * 12) / 96);
    ctx.fillRect(0, Math.round(gy), canvas.width, px);
  }
}

// The on-roll keyboard sits just left of the "now" line. Its key widths and
// offset scale with the canvas height (matching the key height = height/56) so
// the keyboard keeps its proportions as the roll is enlarged, instead of the
// widths staying a fixed pixel size (which looked pinched on a large canvas).
// Ratios (28/22/32/6) reproduce the previous look at ~840px canvas height.
function kbGeom(canvas: HTMLCanvasElement) {
  const kw = Math.max(2, Math.round(canvas.height / 24)); // white key length (longer)
  const bw = Math.max(2, Math.round(canvas.height / 38)); // black key length (shorter)
  const gap = 4; // gap between the white keys' right edge and the now line
  const off = kw + gap; // left edge offset from the now line
  // In 3D the surface is flipped over (rotateX(-130deg)), so the "back" edge of
  // the keyboard swaps sides. Right-anchor the black keys (share the white keys'
  // far edge) so they still read as the raised keys at the back, not centered.
  const flip = kw - bw;
  const dx = Math.floor(canvas.width * lpos - off);
  return { kw, bw, off, flip, dx };
}

// Diatonic keyboard layout, matching the standalone Keyboard tab: 56 evenly
// spaced white keys (8 octaves × 7), with black keys centered on the boundary
// between two white keys. Notes map to the same layout so they line up with the
// keys (white notes on a key slot; black notes on the boundary between slots).
const N_WHITE = 56;
// kcode%12 -> white-key index within the octave (0..6), null for a black note
const WHITE_INDEX: (number | null)[] = [0, null, 1, null, 2, 3, null, 4, null, 5, null, 6];
// kcode%12 -> the white-key index a black note sits just above, null otherwise
const BLACK_AFTER: (number | null)[] = [null, 0, null, 1, null, null, 3, null, 4, null, 5, null];

// Vertical placement of a note on a roll of the given height: top y and height
// (device px). Parameterized by height so the per-channel grid cells can reuse
// the same diatonic layout at any cell size.
function noteGeomIn(height: number, kcode: number) {
  const slot = height / N_WHITE;
  const k = ((kcode % 12) + 12) % 12;
  const oct = Math.floor(kcode / 12);
  const wi = WHITE_INDEX[k];
  if (wi != null) {
    const s = wi + oct * 7; // white slot index from the bottom
    return { yTop: height * (1 - (s + 1) / N_WHITE), h: slot, black: false };
  }
  const s = BLACK_AFTER[k]! + oct * 7; // black key sits above white slot s
  const boundary = height * (1 - (s + 1) / N_WHITE);
  const h = slot * 0.6;
  return { yTop: boundary - h / 2, h, black: true };
}
function noteGeom(canvas: HTMLCanvasElement, kcode: number) {
  return noteGeomIn(canvas.height, kcode);
}

export function paintWhiteKeyboard(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const { kw, dx } = kbGeom(canvas);
  const slot = canvas.height / N_WHITE;
  const gap = Math.max(1, Math.round(slot * 0.12));
  const kh = Math.max(1, Math.ceil(slot) - gap);
  ctx.fillStyle = "#f0f0f060";
  for (let i = 0; i < N_WHITE; i++) {
    ctx.fillRect(dx, canvas.height * (1.0 - (i + 1) / N_WHITE), kw, kh);
  }
}

export function paintBlackKeyboard(canvas: HTMLCanvasElement, flip: boolean) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const g = kbGeom(canvas);
  const dx = g.dx + (flip ? g.flip : 0);
  const slot = canvas.height / N_WHITE;
  const bkh = Math.max(1, Math.round(slot * 0.6));
  ctx.fillStyle = "#121212";
  // A black key sits centered on the boundary above each white key, except after
  // E (i%7===2) and B (i%7===6) where two white keys are adjacent.
  for (let i = 0; i < N_WHITE; i++) {
    if (i % 7 === 2 || i % 7 === 6) continue;
    const boundary = canvas.height * (1.0 - (i + 1) / N_WHITE);
    ctx.fillRect(dx, boundary - bkh / 2, g.bw, bkh);
  }
}

export function paintWhiteHighlight(canvas: HTMLCanvasElement, keys: number[]) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const { kw, dx } = kbGeom(canvas);
  ctx.fillStyle = "#f0f0f0f0";
  for (const kc of keys) {
    const ng = noteGeom(canvas, kc);
    if (ng.black) continue;
    ctx.fillRect(dx, ng.yTop, kw, ng.h);
  }
}

export function paintBlackHighlight(canvas: HTMLCanvasElement, keys: number[], flip: boolean) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const g = kbGeom(canvas);
  const dx = g.dx + (flip ? g.flip : 0);
  ctx.fillStyle = "#f0f0f0f0";
  for (const kc of keys) {
    const ng = noteGeom(canvas, kc);
    if (!ng.black) continue;
    ctx.fillRect(dx, ng.yTop, g.bw, ng.h);
  }
}

export function paintKeyboardEdgeLine(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const { kw, dx } = kbGeom(canvas);
  const x = dx + kw;
  ctx.strokeStyle = "rgba(140,140,140,0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, canvas.height);
  ctx.stroke();
}

// Latency-corrected current NTSC frame (absolute song frame / 735), clamped to
// the decoded snapshot range. Shared by the main roll and the per-channel grid.
function currentNtscFrame(playerContext: PlayerContextState): number {
  const audioFrame =
    playerContext.player.seekBaseFrame + (playerContext.player.progress?.renderer?.currentFrame ?? 0);
  const latencySamples =
    (playerContext.player.outputLatency ?? 0) * (playerContext.player.audioContext?.sampleRate ?? 44100);
  let ntsc = Math.floor(Math.max(0, audioFrame - latencySamples) / 735);
  const decodedLen = playerContext.player._snapshots.length;
  if (decodedLen > 0 && ntsc >= decodedLen) ntsc = decodedLen - 1;
  return ntsc;
}

// Note segments of one channel over [windowStart, windowStart+frames). Statuses
// are read on demand (cached per NTSC frame). Segments split on key-on edges
// (hard break with a leading gap) and on mid-note timbre changes (soft break,
// no gap). Shared by the main roll and the grid.
function buildSegments(
  player: PlayerContextState["player"],
  ch: number,
  windowStart: number,
  frames: number,
  channelMode: PianoRollColorMode,
  colorConfig: PianoRollColorConfig
): Seg[] {
  const baseColor: string = (colorMap[ch] as any)["A200"];
  const segments: Seg[] = [];
  let cur: Seg | null = null;
  for (let i = 0; i < frames; i++) {
    const s = getStatusCached(player, ch, windowStart + i);
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
        cur = { note, start: i, end: i, color, gap: true };
        segments.push(cur);
      } else if (cur.color !== color) {
        cur = { note, start: i, end: i, color, gap: false };
        segments.push(cur);
      } else {
        cur.end = i;
      }
    } else {
      cur = null;
    }
  }
  return segments;
}

// ---- Main piano roll drawing ----

export function paintPianoRoll(
  canvas: HTMLCanvasElement,
  playerContext: PlayerContextState,
  rangeInSec: number,
  layered: boolean,
  particleType: PianoRollParticleType,
  colorConfig: PianoRollColorConfig = defaultColorConfig,
  mode: string = "2d",
  shape3d: { sx: number; sy: number } | null = null
) {
  const now = performance.now();
  const dt = Math.min((now - lastRenderTime) / 1000, 1 / 20);
  lastRenderTime = now;

  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // When playback has ended or stopped, leave the roll empty rather than frozen
  // on the last frame. Keep the freeze-frame only while paused.
  const state = playerContext.player.state;
  if (state !== "playing" && state !== "paused") return;

  // Reset the status cache if the song changed (snapshot array replaced).
  resetCacheIfSongChanged(playerContext.player);

  // latency-corrected current NTSC frame, shared across channels
  const currentNtsc = currentNtscFrame(playerContext);

  // Deferred draws for currently-playing segments so they always sit on top,
  // giving a stable z-order regardless of channel index.
  type Draw = { x: number; y: number; w: number; h: number; color: string; nowX: number; noteAge: number; vol: number };
  const playingDraws: Draw[] = [];

  // Channel spotlight (set on solo-button hover): outline every note of the
  // hovered channel with a bright frame, drawn frontmost. This works even for a
  // muted channel — the fill is hidden but the frame is still shown.
  const hi = pianoRollHighlight.channels;
  const hiActive = hi != null && hi.size > 0;
  const hiStroke = "#ffffff";
  const hiLineWidth = Math.max(1, Math.round(1.5 * devicePixelRatio));
  const frameDraws: { x: number; y: number; w: number; h: number }[] = [];

  // Pass 1: build segments per channel, draw non-playing ones immediately
  const mask = playerContext.channelMask;
  for (let ch = 0; ch < channelIds.length; ch++) {
    const hilite = hiActive && hi!.has(ch);
    // Muted channels are hidden from the roll — unless the channel is spotlighted,
    // in which case its note frames are still drawn (no fill).
    const muted = isChannelMuted(mask, channelIds[ch]);
    if (muted && !hilite) continue;
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
      // Diatonic vertical placement so notes line up with the keyboard. Render
      // every note at a uniform thickness (midway between the white-key slot and
      // the narrower black-key height) centered on its own slot/boundary center,
      // so black and white notes read as the same weight.
      const ng = noteGeom(canvas, seg.note);
      const noteH = (canvas.height / N_WHITE) * 0.7;
      const h = Math.max(1, noteH - 2);
      const y = ng.yTop + ng.h / 2 - h / 2;
      const isPlaying = seg.start <= nowIdx && nowIdx <= seg.end;

      // Spotlight frames are collected and drawn last (frontmost), regardless of
      // whether the channel's fill is drawn (muted channels skip the fill).
      if (hilite) frameDraws.push({ x, y, w, h });

      if (muted) continue; // spotlighted-but-muted: frame only, no fill

      if (isPlaying) {
        // Volume at the play head (0-15); windowStart + nowIdx === currentNtsc.
        const vol = getStatusCached(playerContext.player, ch, windowStart + nowIdx)?.vol ?? 15;
        playingDraws.push({ x, y, w, h, color: seg.color, nowX, noteAge: nowIdx - seg.start, vol });
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
    ctx.fillRect(d.x, d.y, d.w, d.h);
    // Second additive pass tightens the glow into a brighter core.
    ctx.shadowBlur = 3 * devicePixelRatio;
    ctx.fillRect(d.x, d.y, d.w, d.h);
    ctx.restore();

    // Solid body on top so the note color stays true at its center.
    ctx.save();
    ctx.fillStyle = d.color + "ff";
    ctx.fillRect(d.x, d.y, d.w, d.h);
    ctx.restore();

    if (particleType !== "off") {
      let count: number;
      if (particleType === "spark") {
        const burst = d.noteAge < 16 ? Math.round((1 - d.noteAge / 16) ** 2 * 2) : 0;
        count = burst + (Math.random() < 0.15 ? 1 : 0);
      } else {
        // star/heart are big — emit them very sparingly
        const onset = d.noteAge < 4 && Math.random() < 0.06 ? 1 : 0;
        count = onset + (Math.random() < 0.003 ? 1 : 0);
      }
      // guarantee at least one particle at the note's attack (the frame it
      // crosses the now line, noteAge === 0)
      if (d.noteAge === 0) count = Math.max(1, count);
      // Scale particle size by channel volume: vol 0 → 50%, vol 15 → 100%.
      const sizeScale = 0.5 + 0.5 * (Math.max(0, Math.min(15, d.vol)) / 15);
      if (count > 0) {
        spawnParticles(d.nowX, d.y + d.h / 2, d.color, count, sizeScale, particleType, canvas.height / PARTICLE_REF_H);
      }
    }
  }

  drawParticles(ctx, dt, mode === "3d", shape3d);

  // Frontmost pass: spotlight frames over everything (notes, glows, particles).
  if (frameDraws.length > 0) {
    ctx.save();
    ctx.strokeStyle = hiStroke;
    ctx.lineWidth = hiLineWidth;
    for (const f of frameDraws) {
      ctx.strokeRect(f.x + 0.5, f.y + 0.5, Math.max(1, f.w - 1), Math.max(1, f.h - 1));
    }
    ctx.restore();
  }
}


// ---- Per-channel grid cell ----
//
// One small piano roll per channel, each drawn into its OWN canvas so the grid
// can be a DOM section list (collapsible / reorderable like the Keyboard view).
// Rhythm-sharing OPLL slots and PSG tone+noise pairs render into a single cell.

export type GridCell = {
  /** cell label, e.g. "OPLL 7" */
  label: string;
  /** flat channelIds[] indices rendered in this cell */
  channels: number[];
};

// Scientific pitch name for a roll key code (kcode 48 = C4).
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const noteName = (kcode: number) => NOTE_NAMES[kcode % 12] + Math.floor(kcode / 12);

/** Paint one cell's mini piano roll filling its own canvas. `store` is the
 *  cell's own particle store; `dt` is the cell's own frame delta (seconds). */
export function paintCellRoll(
  canvas: HTMLCanvasElement,
  playerContext: PlayerContextState,
  rangeInSec: number,
  colorConfig: PianoRollColorConfig,
  cell: GridCell,
  particleType: PianoRollParticleType,
  store: ParticleStore,
  dt: number,
) {
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const dpr = devicePixelRatio;
  const px = Math.max(1, Math.floor(dpr));

  const state = playerContext.player.state;
  const active = state === "playing" || state === "paused";
  const frames = Math.round(60 * rangeInSec);
  const nowIdx = Math.floor(frames * lpos);
  let windowStart = 0;
  if (active) {
    resetCacheIfSongChanged(playerContext.player);
    windowStart = currentNtscFrame(playerContext) - nowIdx;
  }

  const mask = playerContext.channelMask;
  const hi = pianoRollHighlight.channels;
  const hiActive = hi != null && hi.size > 0;
  const labelPx = Math.max(9 * dpr, Math.min(H * 0.16, 14 * dpr));
  const labelFont = `500 ${Math.round(labelPx)}px Roboto, system-ui, sans-serif`;
  const labelPad = Math.round(labelPx * 0.4);

  // chrome: octave guides + now line
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  for (let o = 1; o < 8; o++) {
    const gy = H * (1 - (o * 7) / N_WHITE);
    ctx.fillRect(0, Math.round(gy), W, px);
  }
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(Math.round(W * lpos), 0, px, H);

  if (active) {
    const step = W / frames;
    const slot = H / N_WHITE;
    // note thickness scales with the cell's aspect ratio: 2× a pitch slot when
    // wider than 2:1, 1× when taller than 16:9, linearly interpolated between.
    // (uniform across white/black keys; noteGeomIn returns a shorter height for
    // black keys, which would otherwise look thinner)
    const ratio = H > 0 ? W / H : 2;
    const thickFactor = Math.max(1, Math.min(2, 1 + (ratio - 16 / 9) / (2 - 16 / 9)));
    const noteH = Math.max(2, slot * thickFactor - Math.min(2, slot * 0.25));
    type Draw = { x: number; y: number; w: number; h: number; color: string };
    const playingDraws: Draw[] = [];
    const noteLabels: { text: string; color: string }[] = [];
    for (const ch of cell.channels) {
      const chMuted = isChannelMuted(mask, channelIds[ch]);
      const channelMode = colorConfig.mode[channelIds[ch].device] ?? "voice";
      // pitch name at the play head (skip noise/rhythm and muted channels)
      const now = chMuted ? null : getStatusCached(playerContext.player, ch, windowStart + nowIdx);
      if (now?.kcode != null && now.mode == null && now.kcode >= 0 && now.kcode < 96) {
        const baseColor: string = (colorMap[ch] as any)["A200"];
        const color =
          channelMode === "channel"
            ? colorConfig.channelColors[ch] ?? baseColor
            : now.vnum != null
              ? colorConfig.voiceColors[now.vnum % 16] ?? baseColor
              : baseColor;
        noteLabels.push({ text: noteName(now.kcode), color });
      }
      const segments = buildSegments(playerContext.player, ch, windowStart, frames, channelMode, colorConfig);
      for (const seg of segments) {
        const g = seg.gap ? GAP : 0;
        const x = seg.start * step + g;
        const w = Math.max(1, (seg.end - seg.start + 1) * step - g);
        const ng = noteGeomIn(H, seg.note);
        const h = noteH; // uniform thickness, centered on the note's slot
        const y = ng.yTop + ng.h / 2 - h / 2;
        if (chMuted) {
          ctx.fillStyle = seg.color + "40";
          ctx.fillRect(x, y, w, h);
        } else if (seg.start <= nowIdx && nowIdx <= seg.end) {
          playingDraws.push({ x, y, w, h, color: seg.color });
          if (particleType !== "off") {
            const noteAge = nowIdx - seg.start;
            let count =
              particleType === "spark"
                ? (noteAge < 16 ? Math.round((1 - noteAge / 16) ** 2 * 1.5) : 0) + (Math.random() < 0.1 ? 1 : 0)
                : noteAge < 4 && Math.random() < 0.06
                  ? 1
                  : 0;
            if (noteAge === 0) count = Math.max(1, count); // ≥1 at attack
            if (count > 0) spawnParticles(nowIdx * step, y + h / 2, seg.color, count, 1, particleType, H / 140, store);
          }
        } else {
          ctx.fillStyle = seg.color + "99";
          ctx.fillRect(x, y, w, h);
        }
      }
    }
    // playing segments on top, with a compact glow
    for (const d of playingDraws) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.shadowColor = d.color;
      ctx.shadowBlur = 6 * dpr;
      ctx.fillStyle = d.color + "ff";
      ctx.fillRect(d.x, d.y, d.w, d.h);
      ctx.restore();
      ctx.fillStyle = d.color + "ff";
      ctx.fillRect(d.x, d.y, d.w, d.h);
    }
    // sounding pitch names, right-aligned in the top-right corner
    if (noteLabels.length > 0) {
      ctx.font = labelFont;
      ctx.textBaseline = "top";
      ctx.textAlign = "right";
      let tx = W - labelPad;
      for (let i = noteLabels.length - 1; i >= 0; i--) {
        ctx.fillStyle = noteLabels[i].color;
        ctx.fillText(noteLabels[i].text, tx, labelPad);
        tx -= ctx.measureText(noteLabels[i].text).width + labelPad * 1.5;
      }
      ctx.textAlign = "left";
    }
  }

  // cell label (top-left); a touch smaller than the note names; dimmed if muted
  ctx.font = `500 ${Math.round(labelPx * 0.82)}px Roboto, system-ui, sans-serif`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(200,200,200,0.75)";
  ctx.fillText(cell.label, labelPad, labelPad);

  // (a fully-muted cell is dimmed via the canvas element's CSS opacity, not a
  // scrim — see PianoRollGrid)

  // The resting / muted border is a CSS border on the cell (crisp, no canvas
  // edge-clipping). Only the solo-hover spotlight frame is drawn on the canvas,
  // inset by its line width so it stays fully inside.
  const hilite = hiActive && cell.channels.some((ch) => hi!.has(ch));
  if (hilite) {
    const lw = Math.max(1, Math.round(1.5 * dpr));
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.roundRect(lw, lw, Math.max(1, W - lw * 2), Math.max(1, H - lw * 2), 4 * dpr);
    ctx.stroke();
  }

  drawParticles(ctx, dt, false, null, store);
}
