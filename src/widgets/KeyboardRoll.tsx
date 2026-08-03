import { useContext, useEffect, useRef, useState } from "react";
import { PlayerContext } from "../contexts/PlayerContext";
import { AppContext } from "../contexts/AppContext";
import { rollFrameGov } from "./frame-governor";
import { channelIds, createParticleStore, defaultVoiceColors, paintCellRoll } from "./piano-roll-painter";

// single-color palette (Colorize off) — memoized so the array identity is stable
let monoCache = "";
let monoArr: string[] = [];
function monoColors(color: string): string[] {
  if (color !== monoCache) {
    monoCache = color;
    monoArr = channelIds.map(() => color);
  }
  return monoArr;
}
const CHANNEL_MODE = { opll: "channel", psg: "channel", scc: "channel" } as const;

/**
 * Compact per-channel piano roll shown beside a keyboard row when the Keyboard
 * view's Scope option is "roll". Reuses the same paintCellRoll as the Scope
 * grid; paced by the shared frame governor. Colorize follows the wave/roll
 * setting; otherwise a single `color`.
 */
export function KeyboardRoll(props: { channels: number[]; color: string }) {
  const player = useContext(PlayerContext);
  const app = useContext(AppContext);
  const playerRef = useRef(player);
  playerRef.current = player;
  const appRef = useRef(app);
  appRef.current = app;
  const propsRef = useRef(props);
  propsRef.current = props;
  const cellRef = useRef({ label: "", channels: props.channels });
  cellRef.current = { label: "", channels: props.channels };

  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const storeRef = useRef(createParticleStore());
  const lastRef = useRef(0);

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
      const c = canvasRef.current;
      if (c == null) return;
      rollFrameGov.forcedFps = appRef.current.scopeFps;
      if (!rollFrameGov.frame(t)) return;
      const t0 = performance.now();
      const ac = appRef.current;
      const dt = lastRef.current ? Math.min((t - lastRef.current) / 1000, 1 / 20) : 0;
      lastRef.current = t;
      // fixed single color (independent of the Scope view's Colorize setting)
      const colorConfig = {
        mode: CHANNEL_MODE,
        channelColors: monoColors(propsRef.current.color),
        voiceColors: defaultVoiceColors,
      };
      paintCellRoll(
        c,
        playerRef.current,
        ac.pianoRollRangeInSec,
        colorConfig,
        cellRef.current,
        ac.pianoRollParticleType,
        storeRef.current,
        dt,
        false, // no voice/instrument name in the keyboard-side roll
        ac.pianoRollPress
      );
      rollFrameGov.addCost(performance.now() - t0);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={boxRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minWidth: 0,
        overflow: "hidden",
        borderRadius: "2px",
        // inset frame (no layout space) so the roll stays flush top/bottom
        boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--primary) 25%, transparent)",
        // faint primary tint behind the (transparent) roll canvas — LED-monitor
        // look, matching the wave scope
        background: "color-mix(in srgb, var(--primary) 10%, transparent)",
      }}
    >
      <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0 }} />
    </div>
  );
}
