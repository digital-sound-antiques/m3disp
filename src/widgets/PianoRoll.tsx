import { useContext, useEffect, useRef, useState } from "react";
import { PlayerContext } from "../contexts/PlayerContext";
import { AppContext } from "../contexts/AppContext";
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
  defaultVoiceColors,
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

// ---- Main piano roll canvas ----

function PianoRollCanvas(props: { width: number; height: number }) {
  const appContext = useContext(AppContext);
  const playerContext = useContext(PlayerContext);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appContextRef = useRef(appContext);
  appContextRef.current = appContext;

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

  // rAF render loop
  useEffect(() => {
    const renderFrame = () => {
      const canvas = canvasRef.current;
      if (canvas != null) {
        requestAnimationFrame(renderFrame);
        const ac = appContextRef.current;
        paintPianoRoll(
          canvas,
          playerContext,
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

  const transform = props.mode === "3d"
    ? "scaleY(1.2) translateY(-20%) perspective(900px) rotateX(-130deg) rotateZ(90deg) rotateY(0deg)"
    : "none";

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
      </div>
    </div>
  );
}
