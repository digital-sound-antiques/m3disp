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
import {
  getCollapsedSections,
  getSectionOrder,
  setSectionOrder,
  subscribeSectionOrder,
  toggleSectionCollapsed,
} from "../views/channel-section-order";
import type { KSSDeviceName } from "../kss/kss-device";

// samples shown per cell is user-selectable (waveWindowSize: 128/256/512); 2×
// that many are read so a trigger point can be found before the shown window.
const MAX_WINDOW = 512;

const flatIndex = (device: KSSDeviceName, index: number) =>
  channelIds.findIndex((c) => c.device === device && c.index === index);

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
      ctx.fillRect(0, Math.round(H / 2), W, 1);

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
        // trigger: align the display to a rising crossing of the window's mean
        // (DC level) so a periodic waveform stays put ("locked") instead of
        // scrolling. Using the mean (not 0) handles unipolar signals like the PSG.
        let sum = 0;
        for (let i = 0; i < total; i++) sum += buf[i];
        const mean = sum / total;
        let trig = 0;
        for (let i = 1; i < WINDOW; i++) {
          if (buf[i - 1] - mean <= 0 && buf[i] - mean > 0) {
            trig = i;
            break;
          }
        }
        // fixed vertical scale; raw ch_out is well under int16 full-scale
        const scale = (H / 2) / 3000;
        ctx.strokeStyle = color;
        // line thickens with the cell size (H is in backing px, so this scales
        // with the drawn height and stays dpr-correct)
        ctx.lineWidth = Math.max(1.5 * dpr, H / 90);
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();
        for (let i = 0; i < WINDOW; i++) {
          const x = (i / (WINDOW - 1)) * W;
          let y = H / 2 - (buf[trig + i] - mean) * scale;
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

  // enable capture only while mounted. Depend on the stable player instance (not
  // the context value, which changes on every volume/state update and would
  // otherwise toggle capture off→on — clearing the ring — and flicker the scope).
  const playerInst = player.player;
  useEffect(() => {
    playerInst.setWaveEnabled(true);
    return () => playerInst.setWaveEnabled(false);
  }, [playerInst]);

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
