import { useContext, useEffect, useRef, useState } from "react";
import { PlayerContext } from "../contexts/PlayerContext";
import { AppContext } from "../contexts/AppContext";
import { rollFrameGov } from "./frame-governor";
import { correlationOffset } from "./scope-dsp";

// window size follows the shared waveWindowSize (128..1024); buffers are sized
// for the largest, and 2× the window is read so the trigger can search first.
const MAX = 1024;
const MAX_TOTAL = MAX * 2;

/**
 * Compact per-channel oscilloscope shown at the right of a keyboard row when the
 * Keyboard view's Scope option is on. Reads the player's per-channel wave ring
 * (the same source as the Scope grid), phase-locked (correlation) + detrended so
 * it stays put. Paced by the shared frame governor like the other scopes.
 */
export function KeyboardScope(props: { offsets: number[]; color: string }) {
  const player = useContext(PlayerContext);
  const app = useContext(AppContext);
  const playerRef = useRef(player);
  playerRef.current = player;
  const appRef = useRef(app);
  appRef.current = app;
  const propsRef = useRef(props);
  propsRef.current = props;

  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const bufRef = useRef(new Int32Array(MAX_TOTAL));
  const curRef = useRef(new Float32Array(MAX));
  const prefixRef = useRef(new Float64Array(MAX_TOTAL + 1));
  const prevRef = useRef(new Float32Array(MAX));
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
      rollFrameGov.forcedFps = appRef.current.scopeFps;
      if (!rollFrameGov.frame(t)) return;
      const t0 = performance.now();
      const pl = playerRef.current.player;
      const ctx = canvas.getContext("2d")!;
      const W = canvas.width;
      const H = canvas.height;
      const dpr = devicePixelRatio;
      ctx.clearRect(0, 0, W, H);

      // faint primary-tinted panel for an LED-monitor look
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = appRef.current.theme.palette.primary.main;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;

      // faint center line
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(0, Math.round(H / 2), W, 1);

      const WINDOW = Math.min(MAX, appRef.current.waveWindowSize || MAX);
      const total = WINDOW * 2;
      // a window-size change invalidates the stored correlation reference
      if (prevWindowRef.current !== WINDOW) {
        prevWindowRef.current = WINDOW;
        hasPrevRef.current = false;
      }

      const rate = pl.audioContext?.sampleRate ?? 44100;
      const latency = (pl.outputLatencyOverride ?? pl.outputLatency ?? 0) * rate;
      const heard = Math.floor(pl.seekBaseFrame + (pl.progress?.renderer?.currentFrame ?? 0) - latency);

      // draw only while playing/paused: a stopped player reads silence and would
      // paint a flat line at the center — stopped should show no waveform (paused
      // keeps the last frame since `heard` is frozen).
      const active = pl.state === "playing" || pl.state === "paused";
      const buf = bufRef.current;
      buf.fill(0, 0, total);
      let ok = false;
      if (active) {
        for (const off of propsRef.current.offsets) {
          if (pl.readWaveChannel(heard, total, off, buf)) ok = true;
        }
      } else {
        hasPrevRef.current = false; // re-seed the phase lock on the next play
      }

      if (ok) {
        const prefix = prefixRef.current;
        prefix[0] = 0;
        for (let i = 0; i < total; i++) prefix[i + 1] = prefix[i] + buf[i];

        // phase lock to the previous frame (seed at 0 on the first frame)
        let trig = 0;
        if (hasPrevRef.current) trig = correlationOffset(buf, prefix, WINDOW, prevRef.current);

        // detrend (remove mean + slope) so the un-DC-blocked ch_out sits centered
        const mean = (prefix[trig + WINDOW] - prefix[trig]) / WINDOW;
        const mid = (WINDOW - 1) / 2;
        let sxy = 0;
        for (let i = 0; i < WINDOW; i++) sxy += (i - mid) * (buf[trig + i] - mean);
        const sxx = (WINDOW * (WINDOW * WINDOW - 1)) / 12;
        const slope = sxx > 0 ? sxy / sxx : 0;
        const cur = curRef.current;
        for (let i = 0; i < WINDOW; i++) cur[i] = buf[trig + i] - mean - slope * (i - mid);
        prevRef.current.set(cur.subarray(0, WINDOW));
        hasPrevRef.current = true;

        const scale = ((H / 2) / 3000) * (appRef.current.waveYScale || 1);
        ctx.strokeStyle = propsRef.current.color;
        ctx.lineWidth = Math.max(1 * dpr, H / 60);
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
        ctx.stroke();
      }
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
        borderRadius: "2px",
        overflow: "hidden",
        // inset frame so it doesn't consume 1px of the draw area (keeps the
        // top/bottom flush with the meter / keyboard)
        boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--primary) 25%, transparent)",
      }}
    >
      <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0 }} />
    </div>
  );
}
