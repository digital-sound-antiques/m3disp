import * as Colors from "@mui/material/colors";
import type { PlayerContextState } from "../contexts/PlayerContext";
import { type ChannelId, type ChannelStatus, getStatusFromSnapshot } from "../kss/channel-status";
import { pianoRollHighlight } from "./piano-roll-highlight";
import type { KSSDecoderDeviceSnapshot } from "../kss/kss-decoder-worker";
import type { KSSChannelMask } from "../kss/kss-device";

// OPLL rhythm channels (index 9-13) use reversed mute bits (BD=13 … HH=9); PSG
// tone channels 3-5 share bits 0-2 with 0-2; SCC and OPLL melody map 1:1.
const opllBit = (i: number) => (i < 9 ? i : 22 - i);
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

// Vertical placement of a note on the roll: top y and height (device px).
function noteGeom(canvas: HTMLCanvasElement, kcode: number) {
  const slot = canvas.height / N_WHITE;
  const k = ((kcode % 12) + 12) % 12;
  const oct = Math.floor(kcode / 12);
  const wi = WHITE_INDEX[k];
  if (wi != null) {
    const s = wi + oct * 7; // white slot index from the bottom
    return { yTop: canvas.height * (1 - (s + 1) / N_WHITE), h: slot, black: false };
  }
  const s = BLACK_AFTER[k]! + oct * 7; // black key sits above white slot s
  const boundary = canvas.height * (1 - (s + 1) / N_WHITE);
  const h = slot * 0.6;
  return { yTop: boundary - h / 2, h, black: true };
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

  // When playback has ended or stopped, leave the roll empty rather than frozen
  // on the last frame. Keep the freeze-frame only while paused.
  const state = playerContext.player.state;
  if (state !== "playing" && state !== "paused") return;

  // Reset the status cache if the song changed (snapshot array replaced).
  resetCacheIfSongChanged(playerContext.player);

  // Compute latency-corrected current NTSC frame once, shared across channels.
  // The renderer reports frames relative to the current stream start; snapshots
  // are keyed by ABSOLUTE song frame, so add the stream's base (nonzero after a
  // seek) — otherwise the roll always paints from the song head.
  const audioFrame =
    playerContext.player.seekBaseFrame + (playerContext.player.progress?.renderer?.currentFrame ?? 0);
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

  const GAP = 2; // leading gap (canvas px) for hard breaks (real key-on / note change)

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
      // Diatonic vertical placement so notes line up with the keyboard.
      const ng = noteGeom(canvas, seg.note);
      const h = Math.max(1, ng.h - 2);
      const y = ng.yTop + (ng.h - h) / 2;
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

    if (showParticles) {
      const burst = d.noteAge < 16 ? Math.round((1 - d.noteAge / 16) ** 2 * 4) : 0;
      const trickle = Math.random() < 0.35 ? 1 : 0;
      const count = burst + trickle;
      // Scale particle size by channel volume: vol 0 → 50%, vol 15 → 100%.
      const sizeScale = 0.5 + 0.5 * (Math.max(0, Math.min(15, d.vol)) / 15);
      if (count > 0) spawnParticles(d.nowX, d.y + d.h / 2, d.color, count, sizeScale);
    }
  }

  drawParticles(ctx, dt);

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
