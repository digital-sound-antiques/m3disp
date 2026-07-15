import { useContext, useSyncExternalStore } from "react";
import { useTheme } from "@mui/material/styles";
import { ChevronRight, ExpandMore } from "@mui/icons-material";
import { DragDropContext, Draggable, Droppable, DropResult } from "@hello-pangea/dnd";
import { PlayerContext } from "../contexts/PlayerContext";
import { ChannelId } from "../kss/channel-status";
import { KSSDeviceName } from "../kss/kss-device";
import { Keyboard } from "./Keyboard";
import { TrackInfoPanel, VolumeInfoPanel } from "./TrackInfo";
import { AppContext } from "../contexts/AppContext";
import {
  getCollapsedSections,
  getSectionOrder,
  setSectionOrder,
  subscribeSectionOrder,
  toggleSectionCollapsed,
} from "../views/channel-section-order";

type DeviceCardProps = {
  name: string;
  device: KSSDeviceName;
  targets: Array<number[] | number>;
  small?: boolean;
  columns?: number;
  keyboardAspectRatio?: string;
};

// OPLL rhythm channels (index 9-13) use reversed mute bits (BD=13 … HH=9);
// melody channels and other devices use the row index as the bit.
const opllBit = (ch: number) => (ch < 9 ? ch : 22 - ch);

function DeviceCard(props: DeviceCardProps) {
  const theme = useTheme();
  const app = useContext(AppContext);
  const context = useContext(PlayerContext);
  const masks = context.channelMask[props.device];

  // tap a row to toggle its mute; keeps the voice/meter/keyboard highlight live
  const toggleMute = (i: number) => {
    const dev = props.device;
    const cur = context.channelMask[dev];
    let t = props.targets[i];
    if (typeof t === "number") t = [t];
    const bits = dev === "opll" ? t.map(opllBit) : [i];
    const willMute = (cur & (1 << bits[0])) === 0;
    let next = cur;
    for (const b of bits) next = willMute ? next | (1 << b) : next & ~(1 << b);
    const mask = { ...context.channelMask, [dev]: next };
    context.player.setChannelMask(mask);
    context.reducer.setChannelMaskLive(mask);
  };

  const cols2 = props.columns === 2;
  const res = [];
  for (let i = 0; i < props.targets.length; i++) {
    const mask = (masks & (1 << i)) != 0;

    let target = props.targets[i];
    if (typeof target == "number") {
      target = [target];
    }

    const channels: ChannelId[] = target.map((e) => ({ device: props.device, index: e }));

    res.push(
      <div
        key={`${i}`}
        onClick={() => toggleMute(i)}
        title={mask ? "Unmute" : "Mute"}
        style={{
          // 2-column: stack info row on top of the keyboard; 1-column: side by side
          display: "flex",
          flexDirection: cols2 ? "column" : "row",
          position: "relative",
          // 1-column: aspect on the whole row. 2-column: no cell aspect (height is
          // auto = info row + keyboard), the aspect goes on the keyboard box below.
          aspectRatio: cols2 ? undefined : props.keyboardAspectRatio ?? "640 / 22",
          width: cols2 ? "calc(50% - 1cqw)" : "100%",
          overflow: "hidden",
          // channel spacing scales with the keyboard width (% vertical margin is
          // relative to the containing block's width); tighter in 1-column
          marginBottom: cols2 ? "0.5%" : "0.3%",
          // size container so the track info can scale via cqw/cqh (1-column needs
          // a definite height → size; 2-column height is content-driven → inline-size)
          containerType: cols2 ? "inline-size" : "size",
          cursor: "pointer",
          // muted rows dim, but their voice/meter/keyboard stay live
          opacity: mask ? 0.5 : 1.0,
        }}
      >
        {props.small ? (
          <VolumeInfoPanel
            variant="horizontal"
            targets={channels}
            disabled={false}
            sx={{ width: "72px" }}
          />
        ) : (
          <TrackInfoPanel title={String(i + 1)} targets={channels} disabled={false} top={cols2} />
        )}

        <div
          style={
            cols2
              ? { width: "100%", aspectRatio: props.keyboardAspectRatio ?? "640 / 48", position: "relative" }
              : { flex: 1, minWidth: 0, minHeight: 0, position: "relative" }
          }
        >
          <Keyboard
            targets={channels}
            highlightColor={
              app.keyHighlightColorType == "primary"
                ? theme.palette.primary.main
                : theme.palette.secondary.main
            }
            whiteKeyColor={theme.palette.text.primary}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="kbd-device"
      style={cols2 ? { flexDirection: "row", flexWrap: "wrap", columnGap: "2cqw" } : undefined}
    >
      {res}
    </div>
  );
}

// device-section cards keyed to match the channel list's section keys, so both
// can share the same (reorderable) display order. Also consumed by the
// per-channel piano-roll grid (PianoRollGrid) so all views group rhythm-sharing
// OPLL slots and PSG tone+noise pairs identically.
export const DEVICE_CARDS: Record<
  string,
  { name: string; device: KSSDeviceName; targets: Array<number[] | number> }
> = {
  opll: { name: "OPLL", device: "opll", targets: [0, 1, 2, 3, 4, 5, [6, 9], [7, 10, 13], [8, 11, 12]] },
  psg: { name: "PSG", device: "psg", targets: [[0, 3], [1, 4], [2, 5]] },
  scc: { name: "SCC", device: "scc", targets: [0, 1, 2, 3, 4] },
};

export function KeyboardList(props: {
  isSmall?: boolean | null;
  aspect?: string | null;
  columns?: number;
}) {
  const isSmall =
    props.isSmall ?? (typeof window !== "undefined" && window.innerWidth < 600);
  // per-row aspect ratio: shorter keyboards in 1-column, taller in 2-column
  // 1-column: applied to the whole row; 2-column: applied to the keyboard box
  // (the cell height is then auto = info row + keyboard, so it can't stretch)
  const aspect =
    props.aspect ?? (isSmall ? "640/22" : props.columns === 2 ? "640/36" : "640/24");
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
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="kbd-sections">
        {(dp) => (
          <div
            className="kbd-list"
            ref={dp.innerRef}
            {...dp.droppableProps}
            style={{ gap: "6px" }}
          >
            {order.map((key, index) => {
              const c = DEVICE_CARDS[key];
              if (c == null) return null;
              const isCollapsed = collapsed.includes(key);
              return (
                <Draggable key={key} draggableId={key} index={index}>
                  {(p) => (
                    <div className="kbd-section" ref={p.innerRef} {...p.draggableProps}>
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
                          {c.name}
                        </span>
                      </div>
                      {!isCollapsed && (
                        <DeviceCard
                          keyboardAspectRatio={aspect}
                          small={isSmall}
                          columns={props.columns}
                          name={c.name}
                          device={c.device}
                          targets={c.targets}
                        />
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
  );
}
