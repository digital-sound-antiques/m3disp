import { Box, Card } from "@mui/material";
import { useContext, useEffect, useRef, useState } from "react";
import { PlayerContext } from "../contexts/PlayerContext";
import { AppContext } from "../contexts/AppContext";
import { detectBPM, type BPMInfo } from "../kss/bpm-detector";
import {
  channelIds,
  lpos,
  paintPianoRoll,
  paintPianoRollBg,
  paintWhiteKeyboard,
  paintBlackKeyboard,
  paintWhiteHighlight,
  paintBlackHighlight,
  paintKeyboardEdgeLine,
} from "./piano-roll-painter";

// ---- Canvas utility components ----

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

  return <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0 }} />;
}

function HighlightCanvas(props: {
  width: number;
  height: number;
  painter: (canvas: HTMLCanvasElement, keys: number[]) => void;
}) {
  const { player } = useContext(PlayerContext);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const painterRef = useRef(props.painter);
  painterRef.current = props.painter;

  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = props.width * devicePixelRatio;
    canvas.height = props.height * devicePixelRatio;
    canvas.style.width = `${props.width}px`;
    canvas.style.height = `${props.height}px`;
  }, [props.width, props.height]);

  useEffect(() => {
    const renderFrame = () => {
      const canvas = canvasRef.current;
      if (canvas != null) {
        requestAnimationFrame(renderFrame);
        const keys: number[] = [];
        for (const id of channelIds) {
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

// ---- Main piano roll canvas (manages BPM detection and key input) ----

function PianoRollCanvas(props: { width: number; height: number }) {
  const appContext = useContext(AppContext);
  const playerContext = useContext(PlayerContext);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appContextRef = useRef(appContext);
  appContextRef.current = appContext;

  const bpmInfoRef = useRef<BPMInfo | null>(null);
  const measureFrameOffsetRef = useRef(0.0);

  // Note: the status cache is synced inside paintPianoRoll (rAF). It detects
  // song changes via player._snapshots array identity, so no event listeners
  // are needed here for cache management.

  // Sync canvas size
  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = props.width * devicePixelRatio;
    canvas.height = props.height * devicePixelRatio;
    canvas.style.width = `${props.width}px`;
    canvas.style.height = `${props.height}px`;
  }, [props.width, props.height]);

  // Re-analyze BPM every 8 beats
  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout>;
    const run = () => {
      const info = detectBPM(playerContext.player);
      if (info) bpmInfoRef.current = info;
      const bpm = bpmInfoRef.current?.bpm ?? 120;
      timerId = setTimeout(run, Math.round(8 * 60000 / bpm));
    };
    run();
    return () => clearTimeout(timerId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Adjust beat line offset by 1/32 beat with left/right arrow keys
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "ArrowLeft" && e.code !== "ArrowRight") return;
      e.preventDefault();
      const fpb = bpmInfoRef.current ? 3600.0 / bpmInfoRef.current.bpm : 30;
      measureFrameOffsetRef.current += e.code === "ArrowRight" ? fpb / 32 : -fpb / 32;
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // rAF render loop
  useEffect(() => {
    const renderFrame = () => {
      const canvas = canvasRef.current;
      if (canvas != null) {
        requestAnimationFrame(renderFrame);
        paintPianoRoll(
          canvas,
          playerContext,
          appContextRef.current.pianoRollRangeInSec,
          appContextRef.current.pianoRollLayered,
          bpmInfoRef.current,
          measureFrameOffsetRef.current,
          appContextRef.current.pianoRollShowParticles
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

  const transform = props.mode === "3d"
    ? "scaleY(1.2) translateY(-20%) perspective(900px) rotateX(-130deg) rotateZ(90deg) rotateY(0deg)"
    : "none";

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
          transform,
          transition: "transform 1s ease",
        }}
      >
        <AutoSizeCanvas painter={paintPianoRollBg} width={size.width} height={size.height} />
        <PianoRollCanvas width={size.width} height={size.height} />

        {appContext.pianoRollShowKeyboard ? <>
          <AutoSizeCanvas painter={paintWhiteKeyboard} width={size.width} height={size.height} />
          <HighlightCanvas painter={paintWhiteHighlight} width={size.width} height={size.height} />
          <AutoSizeCanvas
            painter={(c) => paintBlackKeyboard(c, props.mode === "3d")}
            width={size.width} height={size.height}
          />
          <HighlightCanvas
            painter={(c, keys) => paintBlackHighlight(c, keys, props.mode === "3d")}
            width={size.width} height={size.height}
          />
        </> : (
          <AutoSizeCanvas painter={paintKeyboardEdgeLine} width={size.width} height={size.height} />
        )}
      </Box>
    </Card>
  );
}
