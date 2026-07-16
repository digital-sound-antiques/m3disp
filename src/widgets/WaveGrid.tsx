import { useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ChevronRight, ExpandMore } from "@mui/icons-material";
import { DragDropContext, Draggable, Droppable, DropResult } from "@hello-pangea/dnd";
import { PerChLayout } from "libkss-js";
import { PlayerContext } from "../contexts/PlayerContext";
import { AppContext } from "../contexts/AppContext";
import { channelIds, defaultChannelColors, isChannelMuted, opllBit } from "./piano-roll-painter";
import { DEVICE_CARDS } from "./KeyboardList";
import {
  getCollapsedSections,
  getSectionOrder,
  setSectionOrder,
  subscribeSectionOrder,
  toggleSectionCollapsed,
} from "../views/channel-section-order";
import type { KSSDeviceName } from "../kss/kss-device";

const WINDOW = 512; // samples shown per cell (~12ms @ 44100)

const flatIndex = (device: KSSDeviceName, index: number) =>
  channelIds.findIndex((c) => c.device === device && c.index === index);

// per-channel wave-buffer int16 offset for a device-local channel index
const waveOffset = (device: KSSDeviceName, index: number) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((PerChLayout as any)[device].offset as number) + index;

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
  const bufRef = useRef(new Int32Array(WINDOW));

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
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const canvas = canvasRef.current;
      if (canvas == null) return;
      const p = playerRef.current;
      const pl = p.player;
      const ac = appRef.current;
      const cell = propsRef.current;
      const ctx = canvas.getContext("2d")!;
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const dpr = devicePixelRatio;

      // center line
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(0, Math.round(H / 2), W, Math.max(1, Math.floor(dpr)));

      // heard position (latency-corrected), like the piano roll
      const rate = pl.audioContext?.sampleRate ?? 44100;
      const latency = (pl.outputLatencyOverride ?? pl.outputLatency ?? 0) * rate;
      const heard = Math.floor(pl.seekBaseFrame + (pl.progress?.renderer?.currentFrame ?? 0) - latency);

      const buf = bufRef.current;
      buf.fill(0);
      let ok = false;
      for (const off of cell.offsets) {
        if (pl.readWaveChannel(heard, WINDOW, off, buf)) ok = true;
      }

      const color = ac.pianoRollChannelColors[cell.channels[0]] ?? defaultChannelColors[cell.channels[0]] ?? "#4fa1fb";
      if (ok) {
        // fixed vertical scale; raw ch_out is well under int16 full-scale
        const scale = (H / 2) / 6000;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, Math.round(1.4 * dpr));
        ctx.beginPath();
        for (let i = 0; i < WINDOW; i++) {
          const x = (i / (WINDOW - 1)) * W;
          let y = H / 2 - buf[i] * scale;
          if (y < 0) y = 0;
          else if (y > H) y = H;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // label
      const labelPx = Math.max(9 * dpr, Math.min(H * 0.16, 14 * dpr));
      ctx.font = `500 ${Math.round(labelPx * 0.82)}px Roboto, system-ui, sans-serif`;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(200,200,200,0.75)";
      ctx.fillText(cell.label, Math.round(labelPx * 0.4), Math.round(labelPx * 0.4));
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onClick = () => {
    const ctx = playerRef.current;
    const cur = ctx.channelMask[props.device];
    const bits = props.device === "opll" ? props.targets.map(opllBit) : [props.row];
    const willMute = (cur & (1 << bits[0])) === 0;
    let next = cur;
    for (const b of bits) next = willMute ? next | (1 << b) : next & ~(1 << b);
    const mask = { ...ctx.channelMask, [props.device]: next };
    ctx.player.setChannelMask(mask);
    ctx.reducer.setChannelMaskLive(mask);
  };

  const muted = props.channels.every((ch) => isChannelMuted(player.channelMask, channelIds[ch]));
  return (
    <div className={`pr-grid-cell${muted ? " muted" : ""}`} ref={boxRef} onClick={onClick} title="Mute / unmute">
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

  useEffect(() => {
    player.player.setWaveEnabled(true);
    return () => player.player.setWaveEnabled(false);
  }, [player]);

  const onDragEnd = (result: DropResult) => {
    const { source, destination } = result;
    if (!destination || destination.index === source.index) return;
    const next = [...getSectionOrder()];
    const [moved] = next.splice(source.index, 1);
    next.splice(destination.index, 0, moved);
    setSectionOrder(next);
  };

  const sections = useMemo(() => order, [order]);

  return (
    <div className="pr-grid">
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="wave-sections">
          {(dp) => (
            <div className="pr-grid-list" ref={dp.innerRef} {...dp.droppableProps}>
              {sections.map((key, index) => {
                const card = DEVICE_CARDS[key];
                if (card == null) return null;
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
                              return (
                                <WaveCell
                                  key={i}
                                  label={`CH${i + 1}`}
                                  channels={targets.map((e) => flatIndex(card.device, e))}
                                  offsets={targets.map((e) => waveOffset(card.device, e))}
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
