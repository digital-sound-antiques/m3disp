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
  defaultVoiceColors,
} from "./piano-roll-painter";

// ---- Canvas utility components ----

function AutoSizeCanvas(props: {
  width: number;
  height: number;
  painter: (canvas: HTMLCanvasElement) => void;
  resX?: number;
  resY?: number;
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

  return <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0 }} />;
}

function HighlightCanvas(props: {
  width: number;
  height: number;
  painter: (canvas: HTMLCanvasElement, keys: number[]) => void;
  resX?: number;
  resY?: number;
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
        for (const id of channelIds) {
          if (isChannelMuted(maskRef.current, id)) continue;
          const status = player.getChannelStatus(id);
          if (status?.kcode != null) keys.push(status.kcode);
        }
        painterRef.current(canvas, keys);
      }
    };
    renderFrame();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0 }} />;
}

// ---- Main piano roll canvas ----

function PianoRollCanvas(props: { width: number; height: number; resX?: number; resY?: number }) {
  const appContext = useContext(AppContext);
  const playerContext = useContext(PlayerContext);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appContextRef = useRef(appContext);
  appContextRef.current = appContext;
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
    const renderFrame = () => {
      const canvas = canvasRef.current;
      if (canvas != null) {
        requestAnimationFrame(renderFrame);
        const ac = appContextRef.current;
        paintPianoRoll(
          canvas,
          playerContextRef.current,
          ac.pianoRollRangeInSec,
          ac.pianoRollLayered,
          ac.pianoRollShowParticles,
          {
            mode: ac.pianoRollColorMode,
            channelColors: ac.pianoRollChannelColors,
            voiceColors: defaultVoiceColors,
          }
        );
      }
    };
    renderFrame();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0 }} />;
}

// ---- Exported component ----

export function PianoRoll(props: { mode: string }) {
  const appContext = useContext(AppContext);
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
  const PERSP = 900;
  const SCALE_Y = 1.2;
  const NOW_FROM_BOTTOM = 0.25; // keyboard sits 25% up from the bottom
  const KB_WIDTH_FRAC = 0.8; // keyboard spans ~80% of the display width
  const RES_CAP = 2; // cap the backing-store boost so memory stays bounded
  let transform = "none";
  let resX = 1;
  let resY = 1;
  if (props.mode === "3d") {
    const w = size.width;
    const h = size.height;
    const rotXDeg = -130; // fixed tilt
    const rotX = (rotXDeg * Math.PI) / 180;
    // After rotateZ(90deg): the now-line (keyboard) is a single horizontal line
    // whose whole length sits at one depth. yc is its centered rotated-y; the
    // keyboard's pitch axis (canvas height h) maps to the screen's horizontal.
    const yc = (lpos - 0.5) * w;
    const zKb = yc * Math.sin(rotX); // keyboard depth after rotateX
    const kbFactor = PERSP / (PERSP - zKb); // perspective magnification at that depth
    const yProj = yc * Math.cos(rotX) * kbFactor;
    // translateY so the now-line lands NOW_FROM_BOTTOM up from the bottom
    const ty = ((0.5 - NOW_FROM_BOTTOM) * h) / SCALE_Y - yProj;
    // scaleX so the keyboard (projected width = h * kbFactor) fills ~90% of w
    const scaleX = h > 0 ? (KB_WIDTH_FRAC * w) / (h * kbFactor) : 1;
    transform = `scaleY(${SCALE_Y}) scaleX(${scaleX}) translateY(${ty}px) perspective(${PERSP}px) rotateX(${rotXDeg}deg) rotateZ(90deg)`;
    // Boost canvas backing store to the actual on-screen magnification so the
    // CSS-scaled 3D view stays sharp (no more than the displayed device pixels).
    // rotateZ(90deg) swaps axes: canvas width → screen-y (scaleY), canvas height
    // → screen-x (scaleX). Include the keyboard's perspective magnification.
    resX = Math.min(RES_CAP, Math.max(1, SCALE_Y * kbFactor));
    resY = Math.min(RES_CAP, Math.max(1, scaleX * kbFactor));
  }

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
        <AutoSizeCanvas painter={paintPianoRollBg} width={size.width} height={size.height} resX={resX} resY={resY} />
        <PianoRollCanvas width={size.width} height={size.height} resX={resX} resY={resY} />

        {appContext.pianoRollShowKeyboard ? <>
          <AutoSizeCanvas painter={paintWhiteKeyboard} width={size.width} height={size.height} resX={resX} resY={resY} />
          <HighlightCanvas painter={paintWhiteHighlight} width={size.width} height={size.height} resX={resX} resY={resY} />
          <AutoSizeCanvas
            painter={(c) => paintBlackKeyboard(c, props.mode === "3d")}
            width={size.width} height={size.height} resX={resX} resY={resY}
          />
          <HighlightCanvas
            painter={(c, keys) => paintBlackHighlight(c, keys, props.mode === "3d")}
            width={size.width} height={size.height} resX={resX} resY={resY}
          />
        </> : (
          <AutoSizeCanvas painter={paintKeyboardEdgeLine} width={size.width} height={size.height} resX={resX} resY={resY} />
        )}
      </div>
    </div>
  );
}
