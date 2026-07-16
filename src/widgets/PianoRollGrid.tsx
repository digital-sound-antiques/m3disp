import { useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronRight, ExpandMore } from "@mui/icons-material";
import { DragDropContext, Draggable, Droppable, DropResult } from "@hello-pangea/dnd";
import { PlayerContext } from "../contexts/PlayerContext";
import { AppContext } from "../contexts/AppContext";
import {
  channelIds,
  createParticleStore,
  defaultVoiceColors,
  isChannelMuted,
  opllBit,
  paintCellRoll,
} from "./piano-roll-painter";
import { DEVICE_CARDS } from "./KeyboardList";
import { toggleSolo } from "../kss/channel-solo";
import {
  getCollapsedSections,
  getSectionOrder,
  setSectionOrder,
  subscribeSectionOrder,
  toggleSectionCollapsed,
} from "../views/channel-section-order";
import type { KSSDeviceName } from "../kss/kss-device";

// A channelColors palette that is a single color for every channel (used when
// Colorize is off). Memoized so the array identity is stable per color.
let monoCache = "";
let monoArr: string[] = [];
function monoColors(color: string): string[] {
  if (color !== monoCache) {
    monoCache = color;
    monoArr = channelIds.map(() => color);
  }
  return monoArr;
}

// flat channelIds[] index for (device, device-local index)
const flatIndex = (device: KSSDeviceName, index: number) =>
  channelIds.findIndex((c) => c.device === device && c.index === index);

// One channel-cell: its own canvas piano roll + tap-to-mute (same bit mapping as
// the keyboard/channel views). Its own particle store & frame clock so many
// small canvases don't share (and fight over) the global one.
function GridCell(props: {
  label: string;
  channels: number[];
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
  const cellRef = useRef({ label: props.label, channels: props.channels });
  cellRef.current = { label: props.label, channels: props.channels };

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
      const dt = lastRef.current ? Math.min((t - lastRef.current) / 1000, 1 / 20) : 0;
      lastRef.current = t;
      const ac = appRef.current;
      // Colorize OFF → render every note in the primary color (mode "channel"
      // with a uniform palette); ON → the usual per-channel/voice colors.
      const colorConfig = ac.waveColorize
        ? {
            mode: ac.pianoRollColorMode,
            channelColors: ac.pianoRollChannelColors,
            voiceColors: defaultVoiceColors,
          }
        : {
            mode: { opll: "channel", psg: "channel", scc: "channel" } as const,
            channelColors: monoColors(ac.theme.palette.primary.main),
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
        dt
      );
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

  // fully-muted cell: dim the whole canvas via CSS opacity (no canvas scrim)
  const muted = props.channels.every((ch) => isChannelMuted(player.channelMask, channelIds[ch]));
  return (
    <div
      ref={boxRef}
      className={`pr-grid-cell${muted ? " muted" : ""}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title="Click: mute · Double-click: solo"
    >
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", top: 0, left: 0, opacity: muted ? 0.33 : 1 }}
      />
    </div>
  );
}

/**
 * Per-channel piano-roll grid: one small roll per channel in a 3-column grid,
 * grouped into OPLL / PSG / SCC sections that are collapsible and reorderable —
 * mirroring the Keyboard view (shared section order & collapsed state).
 */
export function PianoRollGrid() {
  const order = useSyncExternalStore(subscribeSectionOrder, getSectionOrder);
  const collapsed = useSyncExternalStore(subscribeSectionOrder, getCollapsedSections);

  const onDragEnd = (result: DropResult) => {
    const { source, destination } = result;
    if (!destination || destination.index === source.index) return;
    const next = [...getSectionOrder()];
    const [moved] = next.splice(source.index, 1);
    next.splice(destination.index, 0, moved);
    setSectionOrder(next);
  };

  return (
    <div className="pr-grid">
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="grid-sections">
          {(dp) => (
            <div className="pr-grid-list" ref={dp.innerRef} {...dp.droppableProps}>
              {order.map((key, index) => {
                const card = DEVICE_CARDS[key];
                if (card == null) return null;
                const isCollapsed = collapsed.includes(key);
                // section grows in proportion to its number of cell rows so all
                // cells end up ~equal height and the whole grid fits (no scroll)
                const rows = Math.ceil(card.targets.length / 3);
                return (
                  <Draggable key={key} draggableId={key} index={index}>
                    {(p) => (
                      <div
                        className="kbd-section pr-grid-section"
                        ref={p.innerRef}
                        {...p.draggableProps}
                        style={{
                          ...p.draggableProps.style,
                          flexGrow: isCollapsed ? 0 : rows,
                        }}
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
                                <GridCell
                                  key={i}
                                  label={`CH${i + 1}`}
                                  channels={targets.map((e) => flatIndex(card.device, e))}
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
