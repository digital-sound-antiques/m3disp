import React, { useContext, useEffect, useRef, useState } from "react";
import { AppContext, KeyHighlightColorType } from "../contexts/AppContext";
import { PlayerContext } from "../contexts/PlayerContext";
import { SettingsContext, SettingsContextProvider } from "../contexts/SettingsContext";
import { ColorBall, ColorSelector } from "../widgets/ColorSelector";
import { NumberSelector } from "../widgets/NumberSelector";

function PlayerPanel() {
  const context = useContext(SettingsContext);
  return (
    <div className="crd-fields">
      <NumberSelector
        label="Loop Count"
        values={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
        value={context.defaultLoopCount}
        onChange={context.setDefaultLoopCount}
      />
      <NumberSelector
        label="Maximum Duration"
        values={[120 * 1000, 180 * 1000, 300 * 1000, 600 * 1000, 900 * 1000, 1200 * 1000]}
        value={context.defaultDuration}
        valueLabelFn={(value) => `${(value / 60 / 1000).toFixed(0)} min.`}
        onChange={context.setDefaultDuration}
      />
    </div>
  );
}

function ThemePanel() {
  const app = useContext(AppContext);
  const palette = app.theme.palette;

  const [primaryColor, setPrimaryColor] = useState(palette.primary.main);
  const [secondaryColor, setSecondaryColor] = useState(palette.secondary.main);
  const [keyType, setKeyType] = useState<KeyHighlightColorType>(app.keyHighlightColorType);

  return (
    <div className="crd-fields">
      <ColorSelector
        label="Primary Color"
        variants={["200", "300", "400", "500"]}
        value={primaryColor}
        onChange={(c) => {
          app.setPrimaryColor(c);
          setPrimaryColor(c);
        }}
      />
      <ColorSelector
        label="Accent Color"
        variants={["A100", "A200", "A400", "A700"]}
        value={secondaryColor}
        onChange={(c) => {
          app.setSecondaryColor(c);
          setSecondaryColor(c);
        }}
      />
      <div className="crd-field">
        <div className="crd-field-label">Keyboard Highlight</div>
        <div className="crd-field-row">
          <ColorBall color={palette[keyType].main} />
          <select
            className="crd-select"
            value={keyType}
            onChange={(e) => {
              const t = e.target.value as KeyHighlightColorType;
              app.setKeyHighlightColorType(t);
              setKeyType(t);
            }}
          >
            <option value="primary">Primary Color</option>
            <option value="secondary">Accent Color</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function OtherPanel(props: { onReset: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="crd-fields">
      <div className="crd-field">
        <div className="crd-field-label">Reset</div>
        {confirming ? (
          <>
            <div className="crd-hint">
              Reset all settings to their defaults? This cannot be undone.
            </div>
            <div className="crd-confirm-row">
              <button className="fdlg-txtbtn" onClick={() => setConfirming(false)}>
                CANCEL
              </button>
              <button className="crd-danger-btn" onClick={props.onReset}>
                RESET
              </button>
            </div>
          </>
        ) : (
          <>
            <button className="crd-danger-btn" onClick={() => setConfirming(true)}>
              RESET ALL SETTINGS
            </button>
            <div className="crd-hint">
              Restores the theme, piano-roll and player settings to their defaults.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const TABS = ["Player", "Theme", "Other"];

function SettingsDialogBody(props: { id: string }) {
  const app = useContext(AppContext);
  const player = useContext(PlayerContext);
  const settings = useContext(SettingsContext);
  const [tab, setTab] = useState(0);

  // snapshot restored on Cancel (theme edits are applied live)
  const [savedPrimaryColor] = useState(app.theme.palette.primary.main);
  const [savedSecondaryColor] = useState(app.theme.palette.secondary.main);
  const [savedKeyHighlightColorType] = useState(app.keyHighlightColorType);

  const onCancel = () => {
    app.setPrimaryColor(savedPrimaryColor);
    app.setSecondaryColor(savedSecondaryColor);
    app.setKeyHighlightColorType(savedKeyHighlightColorType);
    app.closeDialog(props.id);
    settings.revert();
  };
  const onOk = () => {
    app.closeDialog(props.id);
    settings.commit();
  };
  const onResetAll = () => {
    app.resetAllSettings();
    player.reducer.setDefaultLoopCount(2);
    player.reducer.setDefaultDuration(300 * 1000);
    app.closeDialog(props.id);
  };

  return (
    <>
      <div className="crd-body">
        <div className="crd-tabs">
          {TABS.map((label, i) => (
            <button
              key={label}
              className={`crd-tab${tab === i ? " active" : ""}`}
              onClick={() => setTab(i)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 0 && <PlayerPanel />}
        {tab === 1 && <ThemePanel />}
        {tab === 2 && <OtherPanel onReset={onResetAll} />}
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

export function SettingsDialog(props: { id: string }) {
  const app = useContext(AppContext);
  const open = app.isOpen(props.id);
  // null = not yet dragged → render centered; once dragged, explicit position.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setPos(null); // always re-center when the dialog opens
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") app.closeDialog(props.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, app, props.id]);

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
    <SettingsContextProvider>
      <div className="fdlg fdlg-settings" style={style}>
        <div
          className="fdlg-head"
          onPointerDown={onHeadDown}
          onPointerMove={onHeadMove}
          onPointerUp={onHeadUp}
        >
          <span>Settings</span>
          <button className="fdlg-close" onClick={() => app.closeDialog(props.id)} title="Close">
            ✕
          </button>
        </div>
        <SettingsDialogBody id={props.id} />
      </div>
    </SettingsContextProvider>
  );
}
