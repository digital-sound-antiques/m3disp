import React, { useContext, useEffect, useRef, useState } from "react";
import { AppContext, PianoRollColorModeMap } from "../contexts/AppContext";
import { ColorBall } from "../widgets/ColorSelector";
import { pianoRollColorDialogId } from "../widgets/PianoRollControl";
import { defaultChannelColors, type PianoRollColorMode } from "../widgets/piano-roll-painter";

// Channel labels, aligned 1:1 with channelIds[] in piano-roll-painter.ts.
const oplFmLabels = ["OPLL1", "OPLL2", "OPLL3", "OPLL4", "OPLL5", "OPLL6", "OPLL7", "OPLL8", "OPLL9"];
const oplRhythmLabels = ["BD", "SD", "TOM", "CYM", "HH"];
const psgLabels = ["PSG1", "PSG2", "PSG3", "NOISE1", "NOISE2", "NOISE3"];
const sccLabels = ["SCC1", "SCC2", "SCC3", "SCC4", "SCC5"];

type ChannelGroup = { device: keyof PianoRollColorModeMap; name: string; labels: string[]; base: number };

// base = starting index into channelIds[] / the channel color arrays.
const channelGroups: ChannelGroup[] = [
  { device: "opll", name: "OPLL", labels: [...oplFmLabels, ...oplRhythmLabels], base: 0 },
  { device: "psg", name: "PSG", labels: psgLabels, base: 14 },
  { device: "scc", name: "SCC", labels: sccLabels, base: 20 },
];

/** Normalize an arbitrary stored color into the #rrggbb form <input type="color"> requires. */
function toHex6(color: string): string {
  return color.slice(0, 7).toLowerCase();
}

const BALL_SIZE = 22; // inner circle diameter; the hit area is +6.

function ColorPickerBall(props: { color: string; disabled?: boolean; onChange: (c: string) => void }) {
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <ColorBall color={props.color} size={BALL_SIZE} />
      {!props.disabled && (
        <input
          type="color"
          value={toHex6(props.color)}
          onChange={(e) => props.onChange(e.target.value)}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: `${BALL_SIZE + 6}px`,
            height: `${BALL_SIZE + 6}px`,
            opacity: 0,
            cursor: "pointer",
          }}
        />
      )}
    </span>
  );
}

function DialogBody(props: { id: string }) {
  const app = useContext(AppContext);
  const [tab, setTab] = useState(0);

  // Snapshot of the values when the dialog opened, restored on Cancel.
  const [savedMode] = useState(app.pianoRollColorMode);
  const [savedChannelColors] = useState(app.pianoRollChannelColors);

  // Working copies driving the UI; edits are applied live (and persisted).
  const [mode, setMode] = useState<PianoRollColorModeMap>(app.pianoRollColorMode);
  const [channelColors, setChannelColors] = useState<string[]>(app.pianoRollChannelColors);

  const updateMode = (device: keyof PianoRollColorModeMap, value: PianoRollColorMode) => {
    const next = { ...mode, [device]: value };
    setMode(next);
    app.setPianoRollColorMode(next);
  };

  const updateChannelColorAt = (index: number, color: string) => {
    const next = channelColors.slice();
    next[index] = color;
    setChannelColors(next);
    app.setPianoRollChannelColors(next);
  };

  const resetChannelColors = (group: ChannelGroup) => {
    const next = channelColors.slice();
    for (let i = 0; i < group.labels.length; i++) {
      next[group.base + i] = defaultChannelColors[group.base + i];
    }
    setChannelColors(next);
    app.setPianoRollChannelColors(next);
  };

  const onCancel = () => {
    app.setPianoRollColorMode(savedMode);
    app.setPianoRollChannelColors(savedChannelColors);
    app.closeDialog(props.id);
  };
  const onOk = () => app.closeDialog(props.id);

  return (
    <>
      <div className="crd-body">
        <div className="crd-tabs">
          {channelGroups.map((grp, i) => (
            <button
              key={grp.device}
              className={`crd-tab${tab === i ? " active" : ""}`}
              onClick={() => setTab(i)}
            >
              {grp.name}
            </button>
          ))}
        </div>

        {/* stack all device groups in one grid cell so switching tabs doesn't
            resize the dialog (height stays at the tallest group) */}
        <div className="crd-panels">
          {channelGroups.map((grp, i) => {
            const gMode = mode[grp.device];
            const disabled = gMode === "voice"; // channel colors only apply "By Channel"
            return (
              <div className={`crd-panel${tab === i ? " active" : ""}`} key={grp.device}>
                <div className="crd-section-label">Coloring Mode</div>
                <div className="crd-radios">
                  <label className="crd-radio">
                    <input
                      type="radio"
                      name={`crd-mode-${grp.device}`}
                      checked={gMode === "voice"}
                      onChange={() => updateMode(grp.device, "voice")}
                    />
                    <span>By Tone</span>
                  </label>
                  <label className="crd-radio">
                    <input
                      type="radio"
                      name={`crd-mode-${grp.device}`}
                      checked={gMode === "channel"}
                      onChange={() => updateMode(grp.device, "channel")}
                    />
                    <span>By Channel</span>
                  </label>
                </div>

                <div className={`crd-colors${disabled ? " disabled" : ""}`}>
                  <div className="crd-section-label">Channel Colors</div>
                  <div className="crd-grid">
                    {grp.labels.map((label, j) => {
                      const index = grp.base + j;
                      return (
                        <div className="crd-cell" key={label}>
                          <ColorPickerBall
                            color={channelColors[index]}
                            disabled={disabled}
                            onChange={(c) => updateChannelColorAt(index, c)}
                          />
                          <span className="crd-cell-label">{label}</span>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    className="crd-reset"
                    disabled={disabled}
                    onClick={() => resetChannelColors(grp)}
                  >
                    Reset to Default
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="fdlg-foot">
        <button className="fdlg-txtbtn" onClick={onCancel}>
          CANCEL
        </button>
        <button className="fdlg-txtbtn" onClick={onOk}>
          OK
        </button>
      </div>
    </>
  );
}

export function PianoRollColorDialog() {
  const app = useContext(AppContext);
  const open = app.isOpen(pianoRollColorDialogId);
  // null = not yet dragged → render centered; once dragged, explicit position.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setPos(null); // always re-center when the dialog opens
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") app.closeDialog(pianoRollColorDialogId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, app]);

  if (!open) return null;

  const onHeadDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest(".fdlg-close")) return;
    const rect = (e.currentTarget.closest(".fdlg") as HTMLElement).getBoundingClientRect();
    const start = pos ?? { x: rect.left, y: rect.top };
    if (!pos) setPos(start); // switch from centered to explicit positioning
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, x: start.x, y: start.y };
  };
  const onHeadMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - 60, d.x + (e.clientX - d.px))),
      y: Math.max(0, Math.min(window.innerHeight - 40, d.y + (e.clientY - d.py))),
    });
  };
  const onHeadUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const style: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y }
    : { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };

  return (
    <div className="fdlg fdlg-colors" style={style}>
      <div className="fdlg-head" onPointerDown={onHeadDown} onPointerMove={onHeadMove} onPointerUp={onHeadUp}>
        <span>Channel Colors</span>
        <button
          className="fdlg-close"
          onClick={() => app.closeDialog(pianoRollColorDialogId)}
          title="Close"
        >
          ✕
        </button>
      </div>
      <DialogBody id={pianoRollColorDialogId} />
    </div>
  );
}
