import { useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ChevronRight, ExpandMore } from "@mui/icons-material";
import { DragDropContext, Draggable, Droppable, DropResult } from "@hello-pangea/dnd";
import { PerChLayout } from "libkss-js";
import { PlayerContext } from "../contexts/PlayerContext";
import { AppContext } from "../contexts/AppContext";
import { channelIds, colorMap, defaultChannelColors, defaultVoiceColors, isChannelMuted, opllBit } from "./piano-roll-painter";
import { getStatusFromSnapshot } from "../kss/channel-status";
import { toggleSolo } from "../kss/channel-solo";
import { DEVICE_CARDS } from "./KeyboardList";
import { rollFrameGov } from "./frame-governor";
import {
  areChannelsHidden,
  getHiddenChannels,
  subscribeChannelVisibility,
} from "../views/channel-visibility";
import {
  getCollapsedSections,
  getSectionOrder,
  setSectionOrder,
  subscribeSectionOrder,
  toggleSectionCollapsed,
} from "../views/channel-section-order";
import type { KSSDeviceName } from "../kss/kss-device";

// samples shown per cell is user-selectable (waveWindowSize: 128/256/512/1024);
// 2× that many are read so a trigger point can be found before the shown window.
const MAX_WINDOW = 1024;

// Waterfall mode: how many past traces recede into the depth, and how many
// points each is decimated to when drawn (the stacked look needs far less
// per-sample fidelity than the locked line, so we cap it for perf).
const WATERFALL_DEPTH = 12;
const WATERFALL_DRAW_PTS = 128;
// Trace cadence, expressed as a frame count at 60fps (higher = slower flow), but
// applied as a wall-clock interval so the flow speed is the SAME at 30/60fps
// (the FPS setting must not halve it). 4 → 15 traces/s → DEPTH (12) ≈ 0.8s.
const WATERFALL_STRIDE = 3;
const WATERFALL_PUSH_MS = (WATERFALL_STRIDE * 1000) / 60;

/**
 * Draw a receding "waterfall" of the last WATERFALL_DEPTH trigger-aligned
 * traces. History lives entirely on the display side (the `hist` ring + its
 * refs) — the caller just hands in this frame's aligned, DC-removed window, so
 * the effect is agnostic to where the samples came from.
 *
 * Depth cues: back→front the trace grows in width (perspective), amplitude and
 * brightness. Hidden-line removal is painter's-algorithm: draw oldest (back,
 * top) first; each slice fills down to the floor with the opaque page bg before
 * stroking its crest, so nearer mountains occlude farther ones — a filled-body,
 * bright-contour "等高線" look.
 */
function drawWaterfall(
  ctx: CanvasRenderingContext2D,
  cur: Float32Array,
  WINDOW: number,
  W: number,
  H: number,
  dpr: number,
  colors: string[],
  curColor: string,
  bg: string,
  hist: Float32Array,
  countRef: { current: number },
  windowRef: { current: number },
  push: boolean
) {
  const D = WATERFALL_DEPTH;
  // stored slices are fixed-length; a window-size change invalidates the ring
  if (windowRef.current !== WINDOW) {
    windowRef.current = WINDOW;
    countRef.current = 0;
    hist.fill(0);
  }
  // advance the history only when the caller says a push is due (wall-clock
  // cadence); in-between frames just redraw the existing ring. Each slice keeps
  // the color it had when captured (colors ring), so a voice/channel change tints
  // only new traces and rides back through the depth, not the whole stack.
  if (push) {
    const slot = countRef.current % D;
    hist.set(cur.subarray(0, WINDOW), slot * MAX_WINDOW);
    colors[slot] = curColor;
    countRef.current++;
  }

  const filled = Math.min(countRef.current, D);
  const base = countRef.current - filled; // ring index of the oldest live slice
  const PTS = Math.min(WINDOW, WATERFALL_DRAW_PTS);
  const yFront = H * 0.66;
  const rise = H * .5; // total vertical recede, back→front (smaller = gentler slope, more head-on)
  const baseScale = H / 2 / 3000;

  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  for (let s = 0; s < filled; s++) {
    const t = filled === 1 ? 1 : s / (filled - 1); // 0 = oldest/back, 1 = newest/front
    const depth = 1 - t; // 0 = front, 1 = back
    const slot = (base + s) % D;
    const off = slot * MAX_WINDOW;
    const yBase = yFront - depth * rise;
    const halfW = 0.5 * W * (0.55 + 0.45 * t); // perspective: back is narrower
    const x0 = W / 2 - halfW; // centered (straight vertical stack, no tilt)
    const amp = baseScale * (0.5 + 0.65 * t); // taller overall, punchier at the front
    const px = (k: number) => x0 + (k / (PTS - 1)) * (2 * halfW);
    const py = (k: number) => {
      const src = Math.round((k * (WINDOW - 1)) / (PTS - 1));
      let y = yBase - hist[off + src] * amp;
      if (y < 0) y = 0;
      else if (y > H) y = H;
      return y;
    };

    // opaque fill from the crest down to the floor → hides farther slices below
    ctx.beginPath();
    for (let k = 0; k < PTS; k++) k === 0 ? ctx.moveTo(px(k), py(k)) : ctx.lineTo(px(k), py(k));
    ctx.lineTo(x0 + 2 * halfW, H);
    ctx.lineTo(x0, H);
    ctx.closePath();
    ctx.globalAlpha = 1;
    ctx.fillStyle = bg;
    ctx.fill();

    // bright contour crest, dimmer toward the back; each slice keeps its captured color
    ctx.globalAlpha = 0.15 + 0.85 * t;
    ctx.strokeStyle = colors[slot] || curColor;
    ctx.lineWidth = Math.max(1 * dpr, H / 185) * (0.6 + 0.4 * t);
    ctx.beginPath();
    for (let k = 0; k < PTS; k++) k === 0 ? ctx.moveTo(px(k), py(k)) : ctx.lineTo(px(k), py(k));
    if (s === filled - 1) {
      ctx.shadowColor = colors[slot] || curColor;
      ctx.shadowBlur = 6 * dpr;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}

const flatIndex = (device: KSSDeviceName, index: number) =>
  channelIds.findIndex((c) => c.device === device && c.index === index);

// a category cell's flat channelIds indices; the cell is hidden when all are
const cellChannels = (device: KSSDeviceName, t: number[] | number) =>
  (typeof t === "number" ? [t] : t).map((e) => flatIndex(device, e));
const isCardHidden = (device: KSSDeviceName, targets: Array<number[] | number>) =>
  targets.every((t) => areChannelsHidden(cellChannels(device, t)));

// OPLL rhythm channels are ordered differently in emu2413's ch_out (the per-ch
// wave buffer) than in m3disp's channelIds convention. Map channelIds rhythm
// index → ch_out index. ch_out: 9=BD 10=HH 11=SD 12=TOM 13=CYM; channelIds:
// 9=BD 10=SD 11=TOM 12=CYM 13=HH. (Physically CH8=HH+SD, CH9=TOM+CYM.)
const OPLL_RHYTHM_WAVE: Record<number, number> = { 9: 9, 10: 11, 11: 12, 12: 13, 13: 10 };

// per-channel wave-buffer int16 offset for a device-local channel index
const waveOffset = (device: KSSDeviceName, index: number) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const base = (PerChLayout as any)[device].offset as number;
  if (device === "opll" && index >= 9) return base + OPLL_RHYTHM_WAVE[index];
  // emu2149 has 3 physical PSG channels; m3disp splits each into a tone (0-2)
  // and a noise (3-5) lane, but ch_out already mixes tone+noise per channel.
  if (device === "psg") return base + (index % 3);
  return base + index;
};

// Phase lock by correlation: within the 2×WINDOW read buffer, pick the display
// offset o ∈ [0, WINDOW] whose window best matches the previously displayed
// (detrended) slice `prev`. Locking to the previous frame pins the phase, so
// the same portion of the waveform is shown every frame — the thing that stops
// the trace / waterfall ridges from batting around. DC-invariant (each
// candidate's mean, from `prefix`, is removed before comparing).
//
// Coarse-to-fine to stay cheap across every grid cell at 60fps: scan the whole
// range at a coarse step, then refine ±1 step around the winner. That's roughly
// (WINDOW/step + 2·step) candidates instead of WINDOW/2, yet lands on the exact
// sample (better than the old fixed 2-step). Comparison is decimated to CMP pts.
function correlationOffset(
  buf: Int32Array,
  prefix: Float64Array,
  WINDOW: number,
  prev: Float32Array
): number {
  const CMP = Math.min(WINDOW, 64); // decimated comparison points
  const cmpStep = WINDOW / CMP;
  const sadAt = (o: number) => {
    const dc = (prefix[o + WINDOW] - prefix[o]) / WINDOW;
    let sad = 0;
    for (let c = 0; c < CMP; c++) {
      const j = (c * cmpStep) | 0;
      const diff = buf[o + j] - dc - prev[j];
      sad += diff < 0 ? -diff : diff;
    }
    return sad;
  };
  const step = Math.max(2, WINDOW >> 6); // ~16 @1024, 8 @512, 4 @256, 2 @128
  let best = 0;
  let bestSad = Infinity;
  for (let o = 0; o <= WINDOW; o += step) {
    const sad = sadAt(o);
    if (sad < bestSad) {
      bestSad = sad;
      best = o;
    }
  }
  // refine within one coarse step either side of the winner, sample by sample
  const lo = Math.max(0, best - step + 1);
  const hi = Math.min(WINDOW, best + step - 1);
  for (let o = lo; o <= hi; o++) {
    if (o === best) continue;
    const sad = sadAt(o);
    if (sad < bestSad) {
      bestSad = sad;
      best = o;
    }
  }
  return best;
}

// One channel-cell: an oscilloscope of that channel's raw output at the play
// head. Tap to mute (same bit mapping as the other views).
function WaveCell(props: {
  label: string;
  channels: number[];
  offsets: number[];
  device: KSSDeviceName;
  targets: number[];
  row: number;
}) {
  const app = useContext(AppContext);
  const player = useContext(PlayerContext);
  const appRef = useRef(app);
  appRef.current = app;
  const playerRef = useRef(player);
  playerRef.current = player;
  const propsRef = useRef(props);
  propsRef.current = props;

  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // sized for the largest window; only the first 2×WINDOW entries are used
  const bufRef = useRef(new Int32Array(MAX_WINDOW * 2));
  // this frame's trigger-aligned, DC-removed window (scratch, reused each frame)
  const curRef = useRef(new Float32Array(MAX_WINDOW));
  // waterfall depth history (display-side): D slices × MAX_WINDOW, ring-keyed,
  // plus a parallel ring of the color each slice was captured with
  const histRef = useRef(new Float32Array(WATERFALL_DEPTH * MAX_WINDOW));
  const histColorRef = useRef<string[]>(new Array(WATERFALL_DEPTH).fill(""));
  const histCountRef = useRef(0);
  const histWindowRef = useRef(0);
  // wall-clock push cadence (fps-independent): accumulate elapsed ms, push one
  // trace per WATERFALL_PUSH_MS. lastT is the previous rendered-frame timestamp.
  const histAccRef = useRef(0);
  const histLastTRef = useRef(0);
  // phase-lock state: prefix sums (per frame), the last displayed slice used as
  // the correlation reference, and the window size it was captured at
  const prefixRef = useRef(new Float64Array(MAX_WINDOW * 2 + 1));
  const prevRef = useRef(new Float32Array(MAX_WINDOW));
  const hasPrevRef = useRef(false);
  const prevWindowRef = useRef(0);

  useEffect(() => {
    const ro = new ResizeObserver(() =>
      setSize({ w: boxRef.current!.clientWidth, h: boxRef.current!.clientHeight })
    );
    ro.observe(boxRef.current!);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvasRef.current!;
    c.width = Math.round(size.w * devicePixelRatio);
    c.height = Math.round(size.h * devicePixelRatio);
    c.style.width = `${size.w}px`;
    c.style.height = `${size.h}px`;
  }, [size.w, size.h]);

  useEffect(() => {
    let raf = 0;
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const canvas = canvasRef.current;
      if (canvas == null) return;
      // adaptive frame governor (shared with the roll grids); a non-auto FPS
      // setting pins an absolute target
      rollFrameGov.forcedFps = appRef.current.scopeFps;
      if (!rollFrameGov.frame(t)) return;
      const t0 = performance.now();
      const p = playerRef.current;
      const pl = p.player;
      const ac = appRef.current;
      const cell = propsRef.current;
      const ctx = canvas.getContext("2d")!;
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const dpr = devicePixelRatio;

      // center line (line mode only; a waterfall has no single baseline)
      if (ac.waveStyle !== "waterfall") {
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(0, Math.round(H / 2), W, 1);
      }

      // heard position (latency-corrected), like the piano roll
      const rate = pl.audioContext?.sampleRate ?? 44100;
      const latency = (pl.outputLatencyOverride ?? pl.outputLatency ?? 0) * rate;
      const heard = Math.floor(pl.seekBaseFrame + (pl.progress?.renderer?.currentFrame ?? 0) - latency);

      const WINDOW = Math.min(MAX_WINDOW, ac.waveWindowSize || MAX_WINDOW);
      const total = WINDOW * 2; // read 2×WINDOW so a trigger can be found
      const buf = bufRef.current;
      buf.fill(0, 0, total);
      let ok = false;
      for (const off of cell.offsets) {
        if (pl.readWaveChannel(heard, total, off, buf)) ok = true;
      }

      // waveform color: Colorize OFF = a single primary color; ON = the same
      // per-channel/voice colors as the piano roll.
      const ch0 = cell.channels[0];
      let color: string;
      if (!ac.waveColorize) {
        color = ac.theme.palette.primary.main;
      } else {
        // per-device voice/channel mode, read straight from the heard snapshot
        // (same source as the roll) so shared-voice channels (e.g. all PSG
        // tones) get one color instead of falling back per-channel.
        const channelMode =
          (ac.pianoRollColorMode as Record<string, "voice" | "channel">)[cell.device] ?? "voice";
        if (channelMode === "channel") {
          color = ac.pianoRollChannelColors[ch0] ?? defaultChannelColors[ch0] ?? "#4fa1fb";
        } else {
          // voice mode: color by the current voice; fall back to the per-device
          // base color (like the roll) so voice-less channels (e.g. PSG tone)
          // share one color instead of splitting per channel.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const baseColor = (colorMap[ch0] as any)["A200"] as string;
          const ntsc = Math.floor(Math.max(0, heard) / 735);
          const snap = pl._snapshots[ntsc];
          const vnum = snap ? getStatusFromSnapshot(snap, channelIds[ch0])?.vnum : null;
          color = vnum != null ? defaultVoiceColors[vnum % 16] : baseColor;
        }
      }
      if (ok) {
        // prefix sums of the read buffer → any candidate window's DC in O(1)
        const prefix = prefixRef.current;
        prefix[0] = 0;
        for (let i = 0; i < total; i++) prefix[i + 1] = prefix[i] + buf[i];

        // Phase lock by correlation to the previously displayed slice: pins the
        // phase directly (so the same portion of the waveform shows every frame)
        // and self-heals. On the first frame / after a window-size change there's
        // nothing to match yet, so start at 0 and let the next frame lock on.
        const WINDOW_N = WINDOW;
        let trig = 0;
        if (hasPrevRef.current && prevWindowRef.current === WINDOW_N) {
          trig = correlationOffset(buf, prefix, WINDOW_N, prevRef.current);
        }

        // Detrend the displayed window: remove the least-squares line (mean AND
        // slope), not just the mean. The raw per-channel ch_out isn't DC-blocked
        // like the mixed output, so after a key-on it carries a slowly-decaying
        // offset that reads as a baseline ramp growing with time from the trigger
        // (and, since it's not amplitude-scaled, shoves quiet channels off-centre
        // — "small amplitude drifts up"). Subtracting the fitted line flattens
        // both. For a tone spanning whole periods the slope is ~0, so it's inert.
        const mean = (prefix[trig + WINDOW_N] - prefix[trig]) / WINDOW_N;
        const mid = (WINDOW_N - 1) / 2;
        let sxy = 0;
        for (let i = 0; i < WINDOW_N; i++) sxy += (i - mid) * (buf[trig + i] - mean);
        const sxx = (WINDOW_N * (WINDOW_N * WINDOW_N - 1)) / 12; // Σ(i-mid)²
        const slope = sxx > 0 ? sxy / sxx : 0;
        const cur = curRef.current;
        for (let i = 0; i < WINDOW_N; i++) cur[i] = buf[trig + i] - mean - slope * (i - mid);

        // this detrended slice becomes next frame's correlation reference
        prevRef.current.set(cur.subarray(0, WINDOW_N));
        hasPrevRef.current = true;
        prevWindowRef.current = WINDOW_N;

        if (ac.waveStyle === "waterfall") {
          // wall-clock push cadence: seed a push on the first frame, then one
          // trace per WATERFALL_PUSH_MS regardless of render fps (so 30fps flows
          // at the same speed as 60fps). Clamp dt so a stall/tab-switch can't
          // dump a burst of identical traces.
          const dt = histLastTRef.current ? Math.min(t - histLastTRef.current, 100) : WATERFALL_PUSH_MS;
          histLastTRef.current = t;
          histAccRef.current += dt;
          let push = false;
          if (histAccRef.current >= WATERFALL_PUSH_MS) {
            push = true;
            histAccRef.current = Math.min(histAccRef.current - WATERFALL_PUSH_MS, WATERFALL_PUSH_MS);
          }
          drawWaterfall(
            ctx, cur, WINDOW, W, H, dpr, histColorRef.current, color,
            ac.theme.palette.background.default,
            histRef.current, histCountRef, histWindowRef, push
          );
        } else {
          histCountRef.current = 0; // drop stale history so re-entry starts fresh
          histLastTRef.current = 0; // reset cadence so re-entry to waterfall seeds
          histAccRef.current = 0;
          // fixed vertical scale; raw ch_out is well under int16 full-scale
          const scale = (H / 2) / 3000;
          ctx.strokeStyle = color;
          // line thickens with the cell size (H is in backing px, so this scales
          // with the drawn height and stays dpr-correct)
          ctx.lineWidth = Math.max(1.5 * dpr, H / 110);
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.beginPath();
          for (let i = 0; i < WINDOW; i++) {
            const x = (i / (WINDOW - 1)) * W;
            let y = H / 2 - cur[i] * scale;
            if (y < 0) y = 0;
            else if (y > H) y = H;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          // glow pass, then a crisp core over the same path
          ctx.shadowColor = color;
          ctx.shadowBlur = 6 * dpr;
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.stroke();
        }
      }

      // label: CH number, plus the current voice/instrument name for OPLL
      // (Piano/Violin/… for melody, B.D./S.D. & H.H/… for rhythm), read from the
      // heard snapshot like the roll's colors.
      const labelPx = Math.max(9 * dpr, Math.min(H * 0.16, 14 * dpr));
      const pad = Math.round(labelPx * 0.4);
      ctx.font = `500 ${Math.round(labelPx * 0.82)}px Roboto, system-ui, sans-serif`;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(200,200,200,0.75)";
      ctx.fillText(cell.label, pad, pad);
      if (cell.device === "opll") {
        const ntsc = Math.floor(Math.max(0, heard) / 735);
        const snap = pl._snapshots[ntsc];
        const voice = snap ? getStatusFromSnapshot(snap, channelIds[ch0])?.voice : null;
        if (typeof voice === "string") {
          const w = ctx.measureText(cell.label + "  ").width;
          ctx.fillStyle = "rgba(200,200,200,0.5)";
          ctx.fillText(voice, pad + w, pad);
        }
      }
      rollFrameGov.addCost(performance.now() - t0);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const cellBits = () => (props.device === "opll" ? props.targets.map(opllBit) : [props.row]);
  const apply = (mask: ReturnType<typeof toggleSolo>) => {
    const ctx = playerRef.current;
    ctx.player.setChannelMask(mask);
    ctx.reducer.setChannelMaskLive(mask);
  };

  const onClick = () => {
    const ctx = playerRef.current;
    const cur = ctx.channelMask[props.device];
    const bits = cellBits();
    const willMute = (cur & (1 << bits[0])) === 0;
    let next = cur;
    for (const b of bits) next = willMute ? next | (1 << b) : next & ~(1 << b);
    apply({ ...ctx.channelMask, [props.device]: next });
  };

  // double-click = solo (same as the channel list's S button)
  const onDoubleClick = () => apply(toggleSolo(playerRef.current.channelMask, props.device, cellBits()));

  const muted = props.channels.every((ch) => isChannelMuted(player.channelMask, channelIds[ch]));
  return (
    <div
      className={`pr-grid-cell${muted ? " muted" : ""}`}
      ref={boxRef}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title="Click: mute · Double-click: solo"
    >
      <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, opacity: muted ? 0.33 : 1 }} />
    </div>
  );
}

/** Per-channel oscilloscope grid (same layout & sections as the piano-roll
 *  Grid). Enables per-channel wave capture in the decoder while mounted. */
export function WaveGrid() {
  const player = useContext(PlayerContext);
  const order = useSyncExternalStore(subscribeSectionOrder, getSectionOrder);
  const collapsed = useSyncExternalStore(subscribeSectionOrder, getCollapsedSections);
  const hiddenSnapshot = useSyncExternalStore(subscribeChannelVisibility, getHiddenChannels);

  // enable capture only while mounted. Depend on the stable player instance (not
  // the context value, which changes on every volume/state update and would
  // otherwise toggle capture off→on — clearing the ring — and flicker the scope).
  const playerInst = player.player;
  useEffect(() => {
    playerInst.setWaveEnabled(true);
    return () => playerInst.setWaveEnabled(false);
  }, [playerInst]);

  // categories with at least one visible cell; fully-hidden ones drop out
  // (header + body). Filtering keeps the Draggable indices contiguous.
  const visibleKeys = useMemo(
    () =>
      order.filter((key) => {
        const card = DEVICE_CARDS[key];
        return card != null && !isCardHidden(card.device, card.targets);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [order, hiddenSnapshot]
  );

  // reorder by key (indices are into the filtered list, so map back through the
  // full order and drop the moved key next to the destination category)
  const onDragEnd = (result: DropResult) => {
    const { source, destination } = result;
    if (!destination || destination.index === source.index) return;
    const movedKey = visibleKeys[source.index];
    const destKey = visibleKeys[destination.index];
    const next = [...getSectionOrder()];
    next.splice(next.indexOf(movedKey), 1);
    const at = next.indexOf(destKey);
    next.splice(destination.index > source.index ? at + 1 : at, 0, movedKey);
    setSectionOrder(next);
  };

  return (
    <div className="pr-grid">
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="wave-sections">
          {(dp) => (
            <div className="pr-grid-list" ref={dp.innerRef} {...dp.droppableProps}>
              {visibleKeys.map((key, index) => {
                const card = DEVICE_CARDS[key]!;
                const isCollapsed = collapsed.includes(key);
                const rows = Math.ceil(card.targets.length / 3);
                return (
                  <Draggable key={key} draggableId={key} index={index}>
                    {(p) => (
                      <div
                        className="kbd-section pr-grid-section"
                        ref={p.innerRef}
                        {...p.draggableProps}
                        style={{ ...p.draggableProps.style, flexGrow: isCollapsed ? 0 : rows }}
                      >
                        <div
                          className="kbd-section-head"
                          onClick={() => toggleSectionCollapsed(key)}
                          title={isCollapsed ? "Expand" : "Collapse"}
                        >
                          <span className="kbd-section-collapse">
                            {isCollapsed ? (
                              <ChevronRight sx={{ fontSize: "1.2em" }} />
                            ) : (
                              <ExpandMore sx={{ fontSize: "1.2em" }} />
                            )}
                          </span>
                          <span className="kbd-section-name" {...p.dragHandleProps}>
                            {card.name}
                          </span>
                        </div>
                        {!isCollapsed && (
                          <div className="pr-grid-body">
                            {card.targets.map((t, i) => {
                              const targets = typeof t === "number" ? [t] : t;
                              const channels = targets.map((e) => flatIndex(card.device, e));
                              if (areChannelsHidden(channels)) return null; // hidden cell
                              return (
                                <WaveCell
                                  key={i}
                                  label={`CH${i + 1}`}
                                  channels={channels}
                                  offsets={[...new Set(targets.map((e) => waveOffset(card.device, e)))]}
                                  device={card.device}
                                  targets={targets}
                                  row={i}
                                />
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </Draggable>
                );
              })}
              {dp.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}
