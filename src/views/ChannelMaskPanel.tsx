import { useContext, useSyncExternalStore } from "react";
import {
  ChevronRight,
  ExpandMore,
  VisibilityOffOutlined,
  VisibilityOutlined,
} from "@mui/icons-material";
import { DragDropContext, Draggable, Droppable, DropResult } from "@hello-pangea/dnd";
import { PlayerContext } from "../contexts/PlayerContext";
import {
  getCollapsedSections,
  getSectionOrder,
  setSectionOrder,
  subscribeSectionOrder,
  toggleSectionCollapsed,
} from "./channel-section-order";
import {
  areChannelsHidden,
  getHiddenChannels,
  isChannelAbsent,
  isChannelHidden,
  setChannelsHidden,
  subscribeChannelVisibility,
} from "./channel-visibility";
import { KSSChannelMask } from "../kss/kss-device";
import { ChannelId } from "../kss/channel-status";
import { IconVolume, IconVolumeOff } from "../widgets/icons";
import { setPianoRollHighlight } from "../widgets/piano-roll-highlight";

type Dev = "opll" | "psg" | "scc" | "spc" | "nsf" | "hes";
// A row may cover several channels (OPLL 7/8/9 double as rhythm). `maskBits` are
// the device-mask bits it toggles together, `targets` the channels whose voice/
// level it shows, `hi` the flat channelIds indices to spotlight (opll 0-13,
// psg 14-19, scc 20-24).
type Row = { label: string; maskBits: number[]; targets: ChannelId[]; hi: number[] };
type Section = { key: string; dev: Dev; label: string; rows: Row[]; bits: number };

// Rhythm channel (index 9-13) -> its mute bit (BD=13 … HH=9); melody index == bit.
const opllBit = (ch: number) => (ch < 9 ? ch : 22 - ch);

// OPLL: 1-6 are plain FM; 7/8/9 also drive the rhythm channels sharing physical
// ch 6/7/8 — OPLL7=BD, OPLL8=SD&HH, OPLL9=TOM&CYM (channels 9 / 10,13 / 11,12).
const OPLL_CHANNELS = [[0], [1], [2], [3], [4], [5], [6, 9], [7, 10, 13], [8, 11, 12]];

const SECTIONS: Section[] = [
  {
    key: "opll",
    dev: "opll",
    label: "OPLL",
    rows: OPLL_CHANNELS.map((chs, i) => ({
      label: String(i + 1),
      maskBits: chs.map(opllBit),
      targets: chs.map((c) => ({ device: "opll", index: c } as ChannelId)),
      hi: chs, // opll flat channelIds index == channel index
    })),
    bits: 0x3fff, // all melody + rhythm bits
  },
  {
    key: "psg",
    dev: "psg",
    label: "PSG",
    rows: [0, 1, 2].map((i) => ({
      label: String(i + 1),
      maskBits: [i],
      targets: [
        { device: "psg", index: i } as ChannelId,
        { device: "psg", index: i + 3 } as ChannelId,
      ],
      hi: [14 + i, 17 + i],
    })),
    bits: 0x7,
  },
  {
    key: "scc",
    dev: "scc",
    label: "SCC",
    rows: [0, 1, 2, 3, 4].map((i) => ({
      label: String(i + 1),
      maskBits: [i],
      targets: [{ device: "scc", index: i } as ChannelId],
      hi: [20 + i],
    })),
    bits: 0x1f,
  },
  {
    // SPC mode's only section: eight interchangeable S-DSP voices, one row each.
    // Its flat indices start at 0 because the SPC channel list replaces the KSS
    // one wholesale rather than being appended to it.
    key: "spc",
    dev: "spc",
    label: "S-DSP",
    rows: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
      label: String(i + 1),
      maskBits: [i],
      targets: [{ device: "spc", index: i } as ChannelId],
      hi: [i],
    })),
    bits: 0xff,
  },
  {
    // NSF mode's only section: six NES channels, each with a fixed role, so the
    // rows are named rather than numbered. Flat indices start at 0 for the same
    // reason the SPC ones do.
    key: "nsf",
    dev: "nsf",
    label: "NES",
    rows: ["SQ1", "SQ2", "TRI", "NOI", "DMC", "FDS"].map((label, i) => ({
      label,
      maskBits: [i],
      targets: [{ device: "nsf", index: i } as ChannelId],
      hi: [i],
    })),
    bits: 0x3f,
  },
  {
    // The VRC6's three channels: the same device and mask as the rest of the NSF
    // list, its own section because it is a different chip.
    key: "vrc6",
    dev: "nsf",
    label: "VRC6",
    rows: ["SQ1", "SQ2", "SAW"].map((label, i) => ({
      label,
      maskBits: [6 + i],
      targets: [{ device: "nsf", index: 6 + i } as ChannelId],
      hi: [6 + i],
    })),
    bits: 0x1c0,
  },
  {
    // The VRC7's six FM channels, after the VRC6's in the same NSF list.
    key: "vrc7",
    dev: "nsf",
    label: "VRC7",
    rows: [0, 1, 2, 3, 4, 5].map((i) => ({
      label: `FM${i + 1}`,
      maskBits: [9 + i],
      targets: [{ device: "nsf", index: 9 + i } as ChannelId],
      hi: [9 + i],
    })),
    bits: 0x7e00,
  },
  {
    // The N163's eight wavetable channels, after the VRC7's.
    key: "n163",
    dev: "nsf",
    label: "N163",
    rows: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
      label: String(i + 1),
      maskBits: [15 + i],
      targets: [{ device: "nsf", index: 15 + i } as ChannelId],
      hi: [15 + i],
    })),
    bits: 0x7f8000,
  },
  {
    // The MMC5's two pulses and its PCM channel, after the N163's.
    key: "mmc5",
    dev: "nsf",
    label: "MMC5",
    rows: ["SQ1", "SQ2", "PCM"].map((label, i) => ({
      label,
      maskBits: [23 + i],
      targets: [{ device: "nsf", index: 23 + i } as ChannelId],
      hi: [23 + i],
    })),
    bits: 0x3800000,
  },
  {
    // HES mode's only section: six interchangeable PSG channels, one row each.
    key: "hes",
    dev: "hes",
    label: "PCE",
    rows: [0, 1, 2, 3, 4, 5].map((i) => ({
      label: String(i + 1),
      maskBits: [i],
      targets: [{ device: "hes", index: i } as ChannelId],
      hi: [i],
    })),
    bits: 0x3f,
  },
];

const ALL: KSSChannelMask = { opll: 0x3fff, psg: 0x7, scc: 0x1f, opl: 0, spc: 0xff, nsf: 0x3ffffff, hes: 0x3f };
const NONE: KSSChannelMask = { opll: 0, psg: 0, scc: 0, opl: 0, spc: 0, nsf: 0, hes: 0 };
const maskEq = (a: KSSChannelMask, b: KSSChannelMask) =>
  a.opll === b.opll &&
  a.psg === b.psg &&
  a.scc === b.scc &&
  a.opl === b.opl &&
  a.spc === b.spc &&
  a.nsf === b.nsf &&
  a.hes === b.hes;
const soloMask = (dev: Dev, bits: number): KSSChannelMask => ({ ...ALL, [dev]: ALL[dev] & ~bits });
const bitsOf = (arr: number[]) => arr.reduce((m, b) => m | (1 << b), 0);

/** A channel row: track name (e.g. "OPLL1") + visibility (eye) + mute/solo. */
function ChannelRow(props: {
  name: string;
  hi: number[];
  muted: boolean;
  soloed: boolean;
  visible: boolean;
  onToggleVisible: () => void;
  onMute: () => void;
  onSolo: () => void;
}) {
  return (
    <div className={`ch-row${props.muted ? " muted" : ""}${props.visible ? "" : " hidden"}`}>
      <div className="ch-voice">
        <span className="ch-voice-name">{props.name}</span>
      </div>
      <button
        className="ch-btn vis"
        onClick={(e) => {
          e.stopPropagation();
          props.onToggleVisible();
        }}
        title={props.visible ? "Hide from Keyboard / Roll / Scope" : "Show in Keyboard / Roll / Scope"}
      >
        {props.visible ? <VisibilityOutlined /> : <VisibilityOffOutlined />}
      </button>
      <button
        className={`ch-btn mute${props.muted ? " on" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          props.onMute();
        }}
        title={props.muted ? "Unmute" : "Mute"}
      >
        {props.muted ? <IconVolumeOff /> : <IconVolume />}
      </button>
      <button
        className={`ch-btn solo${props.soloed ? " active" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          props.onSolo();
        }}
        onMouseEnter={() => setPianoRollHighlight(props.hi)}
        onMouseLeave={() => setPianoRollHighlight(null)}
        title="Solo"
      >
        S
      </button>
    </div>
  );
}

export function ChannelMaskPanel() {
  const context = useContext(PlayerContext);
  const mask = context.channelMask;

  // section display order + collapse — shared with the keyboard tab/dialog
  // (drag-to-reorder, collapse, persisted)
  const order = useSyncExternalStore(subscribeSectionOrder, getSectionOrder);
  const collapsed = useSyncExternalStore(subscribeSectionOrder, getCollapsedSections);
  // re-render checkboxes when any channel's visibility changes
  useSyncExternalStore(subscribeChannelVisibility, getHiddenChannels);

  // Rows for chips the file does not have are left out, and a section left
  // with none drops out entirely.
  const orderedSections = order
    .map((k) => SECTIONS.find((s) => s.key === k))
    .filter((s): s is Section => s != null)
    .map((s) => ({ ...s, rows: s.rows.filter((r) => !r.hi.every(isChannelAbsent)) }))
    .filter((s) => s.rows.length > 0);

  const toggleCollapse = (key: string) => toggleSectionCollapsed(key);

  const onSecDragEnd = (result: DropResult) => {
    const { source, destination } = result;
    if (!destination || destination.index === source.index) return;
    // Indices are into the shown sections, which can be fewer than the stored
    // order holds, so the move is made by key.
    const movedKey = orderedSections[source.index].key;
    const destKey = orderedSections[destination.index].key;
    const next = [...getSectionOrder()];
    next.splice(next.indexOf(movedKey), 1);
    const at = next.indexOf(destKey);
    next.splice(destination.index > source.index ? at + 1 : at, 0, movedKey);
    setSectionOrder(next);
  };

  const apply = (next: KSSChannelMask) => {
    context.player.setChannelMask(next);
    context.reducer.setChannelMaskLive(next);
  };
  const setDevice = (dev: Dev, deviceMask: number) => apply({ ...mask, [dev]: deviceMask });
  const reset = () => apply({ ...NONE });

  const toggleRow = (dev: Dev, maskBits: number[]) => {
    const willMute = (mask[dev] & (1 << maskBits[0])) === 0;
    let dm = mask[dev];
    for (const b of maskBits) dm = willMute ? dm | (1 << b) : dm & ~(1 << b);
    setDevice(dev, dm);
  };
  const solo = (dev: Dev, bits: number) => {
    const s = soloMask(dev, bits);
    apply(maskEq(mask, s) ? { ...NONE } : s);
  };
  const isSoloed = (dev: Dev, bits: number) => maskEq(mask, soloMask(dev, bits));

  return (
    <>
      <div className="ch-head">
        <span className="ch-title">Channels</span>
        <button
          className="ch-btn"
          onClick={reset}
          disabled={maskEq(mask, NONE)}
          title="Unmute all channels"
        >
          <IconVolume />
        </button>
      </div>
      <DragDropContext onDragEnd={onSecDragEnd}>
        <Droppable droppableId="ch-sections">
          {(dp) => (
            <div className="ch-list" ref={dp.innerRef} {...dp.droppableProps}>
              {orderedSections.map((s, index) => {
                const dmask = mask[s.dev];
                const on = (dmask & s.bits) === s.bits;
                const partial = !on && (dmask & s.bits) !== 0;
                const isCollapsed = collapsed.includes(s.key);
                // section-wide visibility: all its channels' flat indices
                const secHi = s.rows.flatMap((r) => r.hi);
                const secAllHidden = areChannelsHidden(secHi);
                const secAnyHidden = secHi.some((i) => isChannelHidden(i));
                return (
                  <Draggable key={s.key} draggableId={s.key} index={index}>
                    {(p) => (
                      <div className="ch-group" ref={p.innerRef} {...p.draggableProps}>
                        <div
                          className={`ch-sec${secAllHidden ? " hidden" : ""}`}
                          onClick={() => toggleCollapse(s.key)}
                          title={isCollapsed ? "Expand" : "Collapse"}
                          {...p.dragHandleProps}
                        >
                          <button className="ch-collapse" title={isCollapsed ? "Expand" : "Collapse"}>
                            {isCollapsed ? (
                              <ChevronRight sx={{ fontSize: 16 }} />
                            ) : (
                              <ExpandMore sx={{ fontSize: 16 }} />
                            )}
                          </button>
                          <span className="ch-sec-label">{s.label}</span>
                          <button
                            className={`ch-btn vis${secAnyHidden && !secAllHidden ? " partial" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setChannelsHidden(secHi, !secAnyHidden);
                            }}
                            title={
                              secAnyHidden
                                ? "Show in Keyboard / Roll / Scope"
                                : "Hide from Keyboard / Roll / Scope"
                            }
                          >
                            {secAllHidden ? <VisibilityOffOutlined /> : <VisibilityOutlined />}
                          </button>
                          <button
                            className={`ch-btn mute${on ? " on" : partial ? " partial" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDevice(s.dev, on ? dmask & ~s.bits : dmask | s.bits);
                            }}
                            title={on ? "Unmute section" : "Mute section"}
                          >
                            {on ? <IconVolumeOff /> : <IconVolume />}
                          </button>
                          <button
                            className={`ch-btn solo${isSoloed(s.dev, s.bits) ? " active" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              solo(s.dev, s.bits);
                            }}
                            onMouseEnter={() =>
                              setPianoRollHighlight(s.rows.flatMap((r) => r.hi))
                            }
                            onMouseLeave={() => setPianoRollHighlight(null)}
                            title="Solo section"
                          >
                            S
                          </button>
                        </div>
                        {!isCollapsed &&
                          s.rows.map((r) => {
                            const rowBits = bitsOf(r.maskBits);
                            const muted = (dmask & (1 << r.maskBits[0])) !== 0;
                            const visible = !areChannelsHidden(r.hi);
                            return (
                              <ChannelRow
                                key={r.label}
                                // A numbered row reads as "CH3"; a named one
                                // (the NES channels) stands on its own.
                                name={/^\d+$/.test(r.label) ? `CH${r.label}` : r.label}
                                hi={r.hi}
                                muted={muted}
                                soloed={isSoloed(s.dev, rowBits)}
                                visible={visible}
                                onToggleVisible={() => setChannelsHidden(r.hi, visible)}
                                onMute={() => toggleRow(s.dev, r.maskBits)}
                                onSolo={() => solo(s.dev, rowBits)}
                              />
                            );
                          })}
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
    </>
  );
}
