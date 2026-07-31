import { useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { useTheme } from "@mui/material/styles";
import { ChevronRight, ExpandMore } from "@mui/icons-material";
import { DragDropContext, Draggable, Droppable, DropResult } from "@hello-pangea/dnd";
import { PlayerContext } from "../contexts/PlayerContext";
import { ChannelId } from "../kss/channel-status";
import { KSSChannelMask, KSSDeviceName } from "../kss/kss-device";
import { toggleSolo } from "../kss/channel-solo";
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
import {
  areChannelsHidden,
  getHiddenChannels,
  subscribeChannelVisibility,
} from "../views/channel-visibility";
import { channelIds } from "./piano-roll-painter";
import { waveOffset } from "./scope-dsp";
import { KeyboardScope } from "./KeyboardScope";
import { KeyboardRoll } from "./KeyboardRoll";

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

// flat channelIds[] index for (device, device-local index), and per-cell/card
// visibility (a card is hidden when every cell's channels are all hidden)
const flatIndex = (device: KSSDeviceName, index: number) =>
  channelIds.findIndex((c) => c.device === device && c.index === index);
const cellChannels = (device: KSSDeviceName, t: number[] | number) =>
  (typeof t === "number" ? [t] : t).map((e) => flatIndex(device, e));
const isCardHidden = (device: KSSDeviceName, targets: Array<number[] | number>) =>
  targets.every((t) => areChannelsHidden(cellChannels(device, t)));

function DeviceCard(props: DeviceCardProps) {
  const theme = useTheme();
  const app = useContext(AppContext);
  const context = useContext(PlayerContext);
  const masks = context.channelMask[props.device];
  const highlightColor =
    app.keyHighlightColorType == "primary"
      ? theme.palette.primary.main
      : theme.palette.secondary.main;
  const sideMode = app.keyboardScope; // "none" | "wave" | "roll"

  const rowBits = (i: number) => {
    let t = props.targets[i];
    if (typeof t === "number") t = [t];
    return props.device === "opll" ? t.map(opllBit) : [i];
  };
  const applyMask = (mask: KSSChannelMask) => {
    context.player.setChannelMask(mask);
    context.reducer.setChannelMaskLive(mask);
  };

  // tap a row to toggle its mute; keeps the voice/meter/keyboard highlight live
  const toggleMute = (i: number) => {
    const dev = props.device;
    const cur = context.channelMask[dev];
    const bits = rowBits(i);
    const willMute = (cur & (1 << bits[0])) === 0;
    let next = cur;
    for (const b of bits) next = willMute ? next | (1 << b) : next & ~(1 << b);
    applyMask({ ...context.channelMask, [dev]: next });
  };

  // double-tap a row = solo (same as the channel list's S button)
  const soloRow = (i: number) => applyMask(toggleSolo(context.channelMask, props.device, rowBits(i)));

  const cols2 = props.columns === 2;
  const res = [];
  for (let i = 0; i < props.targets.length; i++) {
    let target = props.targets[i];
    if (typeof target == "number") {
      target = [target];
    }

    // hidden channel: drop the cell from the keyboard view
    if (areChannelsHidden(target.map((e) => flatIndex(props.device, e)))) continue;

    const mask = (masks & (1 << i)) != 0;
    const channels: ChannelId[] = target.map((e) => ({ device: props.device, index: e }));
    // the per-keyboard side visualizer: waveform, mini roll, or nothing
    const flats = target.map((e) => flatIndex(props.device, e));
    const sideEl =
      sideMode === "wave" ? (
        <KeyboardScope
          offsets={[...new Set(target.map((e) => waveOffset(props.device, e)))]}
          color={highlightColor}
        />
      ) : sideMode === "roll" ? (
        <KeyboardRoll channels={flats} color={highlightColor} />
      ) : null;

    const keyboard = (
      <Keyboard
        targets={channels}
        highlightColor={highlightColor}
        whiteKeyColor={theme.palette.text.primary}
      />
    );
    const info = props.small ? (
      <VolumeInfoPanel variant="horizontal" targets={channels} disabled={false} sx={{ width: "72px" }} />
    ) : (
      <TrackInfoPanel title={`CH${i + 1}`} targets={channels} disabled={false} top={cols2} />
    );

    res.push(
      <div
        key={`${i}`}
        onClick={() => toggleMute(i)}
        onDoubleClick={() => soloRow(i)}
        title={mask ? "Unmute" : "Mute · Double-click: solo"}
        style={{
          // always a row: [info+keyboard] then the full-height side visualizer.
          // 1-column stacks info beside the keyboard; 2-column stacks it above.
          display: "flex",
          flexDirection: "row",
          position: "relative",
          // 1-column: aspect on the whole row. 2-column: height is content-driven
          // (info row + keyboard), so no cell aspect.
          aspectRatio: cols2 ? undefined : props.keyboardAspectRatio ?? "640 / 22",
          width: cols2 ? "calc(50% - 0.5cqw)" : "100%",
          overflow: "hidden",
          // channel spacing scales with the keyboard width; tighter in 1-column
          marginBottom: cols2 ? "1%" : "0.6%",
          // size container so the track info can scale via cqw/cqh (1-column needs
          // a definite height → size; 2-column height is content-driven → inline-size)
          containerType: cols2 ? "inline-size" : "size",
          cursor: "pointer",
          // muted rows dim, but their voice/meter/keyboard stay live
          opacity: mask ? 0.5 : 1.0,
        }}
      >
        {cols2 ? (
          // 2-column: info row above the keyboard; the meter's right edge lines up
          // with the keyboard's right edge (both padded 1.5cqw)
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            {info}
            <div
              style={{
                width: "100%",
                aspectRatio: props.keyboardAspectRatio ?? "640 / 48",
                boxSizing: "border-box",
                paddingLeft: "1.5cqw",
                paddingRight: "1.5cqw",
                position: "relative",
              }}
            >
              {keyboard}
            </div>
          </div>
        ) : (
          // 1-column: track-info column beside the keyboard
          <>
            {info}
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, position: "relative" }}>{keyboard}</div>
          </>
        )}
        {sideEl && (
          // full-height side visualizer at the right. 2-column: spans the info row
          // + keyboard; 1-column: matches the track-info column width.
          <div
            style={{
              flex: cols2 ? "0 0 17cqw" : "0 0 12.75cqw",
              minWidth: 0,
              marginLeft: cols2 ? "0.375%" : "0.75%",
              position: "relative",
              // 2-column: drop the top so the waveform lines up with the level
              // meter (not the very top of the info row)
              ...(cols2 ? { boxSizing: "border-box" as const, paddingTop: "1.5cqw" } : {}),
            }}
          >
            {sideEl}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="kbd-device"
      style={cols2 ? { flexDirection: "row", flexWrap: "wrap", columnGap: "1cqw" } : undefined}
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
    props.aspect ?? (isSmall ? "640/22" : props.columns === 2 ? "640/36" : "640/28");
  const order = useSyncExternalStore(subscribeSectionOrder, getSectionOrder);
  const collapsed = useSyncExternalStore(subscribeSectionOrder, getCollapsedSections);
  const hiddenSnapshot = useSyncExternalStore(subscribeChannelVisibility, getHiddenChannels);

  // enable per-channel wave capture only for the "wave" side visualizer (the
  // mini roll uses snapshots, which are always captured)
  const app = useContext(AppContext);
  const playerInst = useContext(PlayerContext).player;
  useEffect(() => {
    if (app.keyboardScope !== "wave") return;
    playerInst.setWaveEnabled(true);
    return () => playerInst.setWaveEnabled(false);
  }, [app.keyboardScope, playerInst]);

  // categories with at least one visible channel; filtering keeps the Draggable
  // indices contiguous (a fully-hidden category drops out, header + all)
  const visibleKeys = useMemo(
    () =>
      order.filter((key) => {
        const c = DEVICE_CARDS[key];
        return c != null && !isCardHidden(c.device, c.targets);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [order, hiddenSnapshot]
  );

  // reorder by key (indices are into the filtered list)
  const onDragEnd = (result: DropResult) => {
    const { source, destination } = result;
    if (!destination || destination.index === source.index) return;
    const movedKey = visibleKeys[source.index];
    const destKey = visibleKeys[destination.index];
    const next = [...getSectionOrder()];
    next.splice(next.indexOf(movedKey), 1);
    const at = next.indexOf(destKey);
    next.splice(destination.index > source.index ? at + 1 : at, 0, movedKey);
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
            {visibleKeys.map((key, index) => {
              const c = DEVICE_CARDS[key]!;
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
