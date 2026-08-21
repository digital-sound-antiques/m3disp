import { useContext, useEffect, useRef, useState } from "react";
import { PlayerContext } from "../contexts/PlayerContext";
import { AppContext } from "../contexts/AppContext";
import {
  channelIds,
  isChannelMuted,
  lpos,
  paintPianoRoll,
  paintPianoRollBg,
  paintWhiteKeyboard,
  paintBlackKeyboard,
  paintWhiteHighlight,
  paintBlackHighlight,
  paintKeyboardEdgeLine,
  pressKeyboardOffset,
  defaultVoiceColors,
  monoColorConfig,
} from "./piano-roll-painter";
import { rollFrameGov } from "./frame-governor";
import { isChannelHidden } from "../views/channel-visibility";
import { useBeat } from "./useBeat";

// ---- Canvas utility components ----

function AutoSizeCanvas(props: {
  width: number;
  height: number;
  painter: (canvas: HTMLCanvasElement) => void;
  resX?: number;
  resY?: number;
  /** CSS px to shift the layer down by (the Press keyboard offset). */
  offsetY?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rx = props.resX ?? 1;
  const ry = props.resY ?? 1;

  useEffect(() => {
    const canvas = canvasRef.current!;
    // Backing store is boosted by the display scale so a CSS-scaled (3D) canvas
    // keeps device-pixel sharpness instead of being upscaled/coarse.
    canvas.width = Math.round(props.width * devicePixelRatio * rx);
    canvas.height = Math.round(props.height * devicePixelRatio * ry);
    canvas.style.width = `${props.width}px`;
    canvas.style.height = `${props.height}px`;
  }, [props.width, props.height, rx, ry]);

  useEffect(() => {
    props.painter(canvasRef.current!);
  }, [props.painter, props.width, props.height, rx, ry]);

  return <canvas ref={canvasRef} style={{ position: "absolute", top: props.offsetY ?? 0, left: 0 }} />;
}

function HighlightCanvas(props: {
  width: number;
  height: number;
  painter: (canvas: HTMLCanvasElement, keys: number[]) => void;
  resX?: number;
  resY?: number;
  /** CSS px to shift the layer down by (the Press keyboard offset). */
  offsetY?: number;
}) {
  const { player, channelMask } = useContext(PlayerContext);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const painterRef = useRef(props.painter);
  painterRef.current = props.painter;
  const maskRef = useRef(channelMask);
  maskRef.current = channelMask;
  const rx = props.resX ?? 1;
  const ry = props.resY ?? 1;

  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = Math.round(props.width * devicePixelRatio * rx);
    canvas.height = Math.round(props.height * devicePixelRatio * ry);
    canvas.style.width = `${props.width}px`;
    canvas.style.height = `${props.height}px`;
  }, [props.width, props.height, rx, ry]);

  useEffect(() => {
    const renderFrame = () => {
      const canvas = canvasRef.current;
      if (canvas != null) {
        requestAnimationFrame(renderFrame);
        const keys: number[] = [];
        for (let ch = 0; ch < channelIds.length; ch++) {
          const id = channelIds[ch];
          if (isChannelHidden(ch) || isChannelMuted(maskRef.current, id)) continue;
          const status = player.getChannelStatus(id);
          if (status?.kcode != null) keys.push(status.kcode);
        }
        painterRef.current(canvas, keys);
      }
    };
    renderFrame();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} style={{ position: "absolute", top: props.offsetY ?? 0, left: 0 }} />;
}

// ---- Main piano roll canvas ----

function PianoRollCanvas(props: { width: number; height: number; resX?: number; resY?: number; shape3d?: { sx: number; sy: number } | null }) {
  const appContext = useContext(AppContext);
  const playerContext = useContext(PlayerContext);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appContextRef = useRef(appContext);
  appContextRef.current = appContext;
  const shape3dRef = useRef(props.shape3d);
  shape3dRef.current = props.shape3d;
  // keep a live reference so the rAF loop sees the current channel mask (and
  // other state), not the value captured when the effect mounted
  const playerContextRef = useRef(playerContext);
  playerContextRef.current = playerContext;
  const rx = props.resX ?? 1;
  const ry = props.resY ?? 1;

  // Note: the status cache is synced inside paintPianoRoll (rAF). It detects
  // song changes via player._snapshots array identity, so no event listeners
  // are needed here for cache management.

  // Sync canvas size
  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = Math.round(props.width * devicePixelRatio * rx);
    canvas.height = Math.round(props.height * devicePixelRatio * ry);
    canvas.style.width = `${props.width}px`;
    canvas.style.height = `${props.height}px`;
  }, [props.width, props.height, rx, ry]);

  // rAF render loop
  useEffect(() => {
    const renderFrame = (t: number) => {
      const canvas = canvasRef.current;
      if (canvas == null) return; // unmounted → let the loop die
      requestAnimationFrame(renderFrame);
      const ac = appContextRef.current;
      // adaptive frame governor (shared with the scope grids); a non-auto FPS
      // setting pins an absolute target
      rollFrameGov.forcedFps = ac.scopeFps;
      if (!rollFrameGov.frame(t)) return;
      const t0 = performance.now();
      // Colorize OFF → every note in the primary color; ON → the usual
      // per-channel/voice palette.
      const colorConfig = ac.pianoRollColorize
        ? {
            mode: ac.pianoRollColorMode,
            channelColors: ac.pianoRollChannelColors,
            voiceColors: defaultVoiceColors,
          }
        : monoColorConfig(ac.theme.palette.primary.main);
      paintPianoRoll(
        canvas,
        playerContextRef.current,
        ac.pianoRollRangeInSec,
        ac.pianoRollLayered,
        ac.pianoRollParticleType,
        colorConfig,
        ac.pianoRollMode,
        shape3dRef.current,
        ac.pianoRollPress,
        ac.pianoRollBeatLines
      );
      rollFrameGov.addCost(performance.now() - t0);
    };
    requestAnimationFrame(renderFrame);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0 }} />;
}

// ---- Exported component ----

export function PianoRoll(props: { mode: string }) {
  const appContext = useContext(AppContext);
  const beat = useBeat();
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      setSize({ width: boxRef.current!.clientWidth, height: boxRef.current!.clientHeight });
    });
    observer.observe(boxRef.current!);
    return () => observer.disconnect();
  }, []);

  // In 3D the now-line (keyboard) is placed exactly 25% up from the bottom of
  // the drawing area. Its projected vertical position depends on the box size,
  // so translateY is computed from the measured width/height rather than being a
  // fixed percentage. Transform order (applied last→first): scaleY, translateY,
  // perspective, rotateX, rotateZ — so translateY/scaleY act in projected space.
  // Perspective distance scales with the roll width. The 3D geometry (yc/zKb) is
  // proportional to width, so a FIXED perspective made kbFactor blow up as the
  // window widened (zKb approaching PERSP) → extreme magnification. Tying PERSP
  // to width keeps zKb/PERSP constant, so the view scales proportionally instead.
  const PERSP_RATIO = 1.1;
  const SCALE_Y = 1.2;
  const NOW_FROM_BOTTOM = 0.25; // keyboard sits 25% up from the bottom
  const KB_WIDTH_FRAC = 0.8; // keyboard spans ~80% of the display width
  const RES_CAP = 2; // cap the backing-store boost so memory stays bounded
  let transform = "none";
  let resX = 1;
  let resY = 1;
  // Non-uniform-scale correction for shaped particles (star/heart): the 3D
  // transform squashes them, so they're pre-distorted by its inverse to render
  // upright and undistorted (billboard-like). null in 2D.
  let shape3d: { sx: number; sy: number } | null = null;
  if (props.mode === "3d") {
    const w = size.width;
    const h = size.height;
    const PERSP = w * PERSP_RATIO;
    const rotXDeg = -130; // fixed tilt
    const rotX = (rotXDeg * Math.PI) / 180;
    // After rotateZ(90deg): the now-line (keyboard) is a single horizontal line
    // whose whole length sits at one depth. yc is its centered rotated-y; the
    // keyboard's pitch axis (canvas height h) maps to the screen's horizontal.
    const yc = (lpos - 0.5) * w;
    const zKb = yc * Math.sin(rotX); // keyboard depth after rotateX
    const kbFactor = PERSP / (PERSP - zKb); // perspective magnification at that depth
    const yProj = yc * Math.cos(rotX) * kbFactor;
    // Projected (pre-scaleY) vertical position of a point at time-fraction t
    // along the roll. rotateZ swaps axes, so the depth (time) plane's on-screen
    // length is tied to the WIDTH; a tall box leaves the future (far) edge short
    // of the top → black band. Raise the now-line just enough to bring that far
    // edge up to the top — no extra data drawn. Clamp so the past (below the
    // now-line) doesn't in turn run short and open a gap at the bottom.
    const projAt = (t: number) => {
      const y = (t - 0.5) * w;
      return y * Math.cos(rotX) * (PERSP / (PERSP - y * Math.sin(rotX)));
    };
    const futureSpan = SCALE_Y * (yProj - projAt(1)); // px from now-line to far edge
    const nowFromBottom =
      h > 0
        ? Math.min(0.45, Math.max(NOW_FROM_BOTTOM, 1 - futureSpan / h))
        : NOW_FROM_BOTTOM;
    // translateY so the now-line lands nowFromBottom up from the bottom
    const ty = ((0.5 - nowFromBottom) * h) / SCALE_Y - yProj;
    // scaleX so the keyboard (projected width = h * kbFactor) fills ~90% of w
    const scaleX = h > 0 ? (KB_WIDTH_FRAC * w) / (h * kbFactor) : 1;
    transform = `scaleY(${SCALE_Y}) scaleX(${scaleX}) translateY(${ty}px) perspective(${PERSP}px) rotateX(${rotXDeg}deg) rotateZ(90deg)`;
    // Boost canvas backing store to the actual on-screen magnification so the
    // CSS-scaled 3D view stays sharp (no more than the displayed device pixels).
    // rotateZ(90deg) swaps axes: canvas width → screen-y (scaleY), canvas height
    // → screen-x (scaleX). Include the keyboard's perspective magnification.
    resX = Math.min(RES_CAP, Math.max(1, SCALE_Y * kbFactor));
    resY = Math.min(RES_CAP, Math.max(1, scaleX * kbFactor));
    // Aspect scales for un-squishing shaped particles: canvas x maps to screen-y
    // at ~cos(tilt)·scaleY, canvas y maps to screen-x at ~scaleX. Normalize to be
    // area-preserving so only the aspect (not the size) is corrected.
    const c = Math.abs(Math.cos(rotX));
    const norm = Math.sqrt(scaleX * c * SCALE_Y);
    shape3d = { sx: norm / scaleX, sy: norm / (c * SCALE_Y) };
  }
  // With Press on, the 2D keyboard is drawn shifted down by the sink distance so
  // a sounding note stays on its own key. `top` (not a transform) keeps it inside
  // the box's own coordinate space, so the 3D transform composes as before.
  const kbOffset = pressKeyboardOffset(size.height, appContext.pianoRollPress, props.mode === "3d");

  return (
    <div className="pianoroll-wrap">
      <div
        ref={boxRef}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          transformOrigin: "center",
          transformStyle: "preserve-3d",
          transform,
        }}
      >
        <AutoSizeCanvas
          painter={(c) =>
            // Octave lines are always drawn — even with the keyboard off — so a
            // stopped/empty roll still shows the pitch grid instead of looking
            // broken; with Press on they shift down with the keyboard. The key rows
            // go away there (they would disagree with the shifted keys).
            paintPianoRollBg(
              c,
              appContext.theme.palette.primary.main,
              appContext.pianoRollPress,
              props.mode === "3d"
            )
          }
          width={size.width} height={size.height} resX={resX} resY={resY}
        />
        {/* now-line drawn BEHIND the notes in "line" mode */}
        {appContext.pianoRollKeyboard === "line" && (
          <AutoSizeCanvas painter={paintKeyboardEdgeLine} width={size.width} height={size.height} resX={resX} resY={resY} />
        )}
        <PianoRollCanvas width={size.width} height={size.height} resX={resX} resY={resY} shape3d={shape3d} />

        {appContext.pianoRollKeyboard === "on" && <>
          <AutoSizeCanvas
            painter={(c) => paintWhiteKeyboard(c, props.mode === "3d")}
            width={size.width} height={size.height} resX={resX} resY={resY} offsetY={kbOffset}
          />
          <HighlightCanvas
            painter={(c, keys) => paintWhiteHighlight(c, keys, props.mode === "3d")}
            width={size.width} height={size.height} resX={resX} resY={resY} offsetY={kbOffset}
          />
          <AutoSizeCanvas
            painter={(c) => paintBlackKeyboard(c, props.mode === "3d")}
            width={size.width} height={size.height} resX={resX} resY={resY} offsetY={kbOffset}
          />
          <HighlightCanvas
            painter={(c, keys) => paintBlackHighlight(c, keys, props.mode === "3d")}
            width={size.width} height={size.height} resX={resX} resY={resY} offsetY={kbOffset}
          />
        </>}
      </div>
      {/* The tempo is estimated from the notes, so it belongs with them rather
          than with the transport's file-derived numbers. Shown under the same
          switch as the beat rules: one estimate, one thing to turn off. */}
      {appContext.pianoRollBeatLines && beat != null && (
        <div className="pianoroll-bpm">{Math.round(beat.bpm)} BPM</div>
      )}
    </div>
  );
}
