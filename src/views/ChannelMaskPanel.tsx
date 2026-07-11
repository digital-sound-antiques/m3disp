import { useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTheme } from "@mui/material/styles";
import { ChevronRight, ExpandMore, Piano, Settings } from "@mui/icons-material";
import { DragDropContext, Draggable, Droppable, DropResult } from "@hello-pangea/dnd";
import { PlayerContext } from "../contexts/PlayerContext";
import { keyboardDialogId } from "./KeyboardDialog";
import {
  getSectionOrder,
  setSectionOrder,
  subscribeSectionOrder,
} from "./channel-section-order";
import { AppContext } from "../contexts/AppContext";
import { pianoRollColorDialogId } from "../widgets/PianoRollControl";
import { KSSChannelMask } from "../kss/kss-device";
import { ChannelId } from "../kss/channel-status";
import { IconVolume, IconVolumeOff } from "../widgets/icons";
import { setPianoRollHighlight } from "../widgets/piano-roll-highlight";
import { WaveIndicator } from "../widgets/TrackInfo";

type Dev = "opll" | "psg" | "scc";
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
];

const ALL: KSSChannelMask = { opll: 0x3fff, psg: 0x7, scc: 0x1f, opl: 0 };
const NONE: KSSChannelMask = { opll: 0, psg: 0, scc: 0, opl: 0 };
const maskEq = (a: KSSChannelMask, b: KSSChannelMask) =>
  a.opll === b.opll && a.psg === b.psg && a.scc === b.scc && a.opl === b.opl;
const soloMask = (dev: Dev, bits: number): KSSChannelMask => ({ ...ALL, [dev]: ALL[dev] & ~bits });
const bitsOf = (arr: number[]) => arr.reduce((m, b) => m | (1 << b), 0);

/** A channel row: voice name (or SCC waveform) + mute/solo. When no voice is
 *  active (stopped/silent) it falls back to the device+channel name (e.g.
 *  "OPLL1"). Muted channels still show their voice. Reads status each frame. */
function ChannelRow(props: {
  num: string;
  name: string;
  targets: ChannelId[];
  hi: number[];
  muted: boolean;
  soloed: boolean;
  onMute: () => void;
  onSolo: () => void;
}) {
  const theme = useTheme();
  const context = useContext(PlayerContext);
  const [voice, setVoice] = useState<string | Uint8Array | null>(null);
  const targetsRef = useRef(props.targets);
  targetsRef.current = props.targets;

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const p = context.player;
      if (p.state === "playing" || p.state === "paused") {
        let v: string | Uint8Array | null = null;
        for (const t of targetsRef.current) {
          const s = p.getChannelStatus(t);
          if (s != null && s.voice != null) {
            v = s.voice as string | Uint8Array;
            break;
          }
        }
        setVoice(v);
      } else {
        setVoice(null);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [context.player]);

  const hiOn = () => setPianoRollHighlight(props.hi);
  const hiOff = () => setPianoRollHighlight(null);

  return (
    <div className={`ch-row${props.muted ? " muted" : ""}`}>
      <span className="ch-num">{props.num}</span>
      <div className="ch-voice">
        {voice instanceof Uint8Array ? (
          <div className="ch-wave">
            <WaveIndicator wave={voice} color={theme.palette.primary.main} />
          </div>
        ) : typeof voice === "string" ? (
          <span className="ch-voice-name">{voice}</span>
        ) : (
          <span className="ch-voice-name placeholder">{props.name}</span>
        )}
      </div>
      <button
        className={`ch-btn mute${props.muted ? " on" : ""}`}
        onClick={props.onMute}
        onMouseEnter={hiOn}
        onMouseLeave={hiOff}
        title={props.muted ? "Unmute" : "Mute"}
      >
        {props.muted ? <IconVolumeOff /> : <IconVolume />}
      </button>
      <button
        className={`ch-btn solo${props.soloed ? " active" : ""}`}
        onClick={props.onSolo}
        onMouseEnter={hiOn}
        onMouseLeave={hiOff}
        title="Solo"
      >
        S
      </button>
    </div>
  );
}

const COLLAPSED_KEY = "m3disp.chCollapsedSections";

export function ChannelMaskPanel() {
  const context = useContext(PlayerContext);
  const app = useContext(AppContext);
  const keyboardOpen = app.isOpen(keyboardDialogId);
  const mask = context.channelMask;

  // section display order — shared with the keyboard dialog (drag-to-reorder,
  // persisted) — and per-panel collapse state
  const order = useSyncExternalStore(subscribeSectionOrder, getSectionOrder);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
      if (Array.isArray(saved)) return new Set<string>(saved);
    } catch {
      /* ignore malformed storage */
    }
    return new Set<string>();
  });

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
  }, [collapsed]);

  const orderedSections = order
    .map((k) => SECTIONS.find((s) => s.key === k))
    .filter((s): s is Section => s != null);

  const toggleCollapse = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const onSecDragEnd = (result: DropResult) => {
    const { source, destination } = result;
    if (!destination || destination.index === source.index) return;
    const next = [...getSectionOrder()];
    const [moved] = next.splice(source.index, 1);
    next.splice(destination.index, 0, moved);
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
        <button className="ch-reset" onClick={reset} title="Unmute all channels">
          Reset
        </button>
        <span className="ch-actions">
          <button
            className={`ch-kbd-btn${keyboardOpen ? " active" : ""}`}
            onClick={() =>
              keyboardOpen ? app.closeDialog(keyboardDialogId) : app.openDialog(keyboardDialogId)
            }
            title="Keyboard"
          >
            <Piano sx={{ fontSize: 15 }} />
          </button>
          <button
            className="ch-icon-btn"
            onClick={() => app.openDialog(pianoRollColorDialogId)}
            title="Channel color settings"
          >
            <Settings sx={{ fontSize: 15 }} />
          </button>
        </span>
      </div>
      <DragDropContext onDragEnd={onSecDragEnd}>
        <Droppable droppableId="ch-sections">
          {(dp) => (
            <div className="ch-list" ref={dp.innerRef} {...dp.droppableProps}>
              {orderedSections.map((s, index) => {
                const dmask = mask[s.dev];
                const on = (dmask & s.bits) === s.bits;
                const partial = !on && (dmask & s.bits) !== 0;
                const secHi = s.rows.flatMap((r) => r.hi);
                const isCollapsed = collapsed.has(s.key);
                return (
                  <Draggable key={s.key} draggableId={s.key} index={index}>
                    {(p) => (
                      <div className="ch-group" ref={p.innerRef} {...p.draggableProps}>
                        <div className="ch-sec">
                          <button
                            className="ch-collapse"
                            onClick={() => toggleCollapse(s.key)}
                            title={isCollapsed ? "Expand" : "Collapse"}
                          >
                            {isCollapsed ? (
                              <ChevronRight sx={{ fontSize: 16 }} />
                            ) : (
                              <ExpandMore sx={{ fontSize: 16 }} />
                            )}
                          </button>
                          <span className="ch-sec-label" {...p.dragHandleProps}>
                            {s.label}
                          </span>
                          <button
                            className={`ch-btn mute${on ? " on" : partial ? " partial" : ""}`}
                            onClick={() => setDevice(s.dev, on ? dmask & ~s.bits : dmask | s.bits)}
                            onMouseEnter={() => setPianoRollHighlight(secHi)}
                            onMouseLeave={() => setPianoRollHighlight(null)}
                            title={on ? "Unmute section" : "Mute section"}
                          >
                            {on ? <IconVolumeOff /> : <IconVolume />}
                          </button>
                          <button
                            className={`ch-btn solo${isSoloed(s.dev, s.bits) ? " active" : ""}`}
                            onClick={() => solo(s.dev, s.bits)}
                            onMouseEnter={() => setPianoRollHighlight(secHi)}
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
                            return (
                              <ChannelRow
                                key={r.label}
                                num={r.label}
                                name={`${s.label}${r.label}`}
                                targets={r.targets}
                                hi={r.hi}
                                muted={muted}
                                soloed={isSoloed(s.dev, rowBits)}
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
