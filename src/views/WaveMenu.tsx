import { GraphicEq, Height, InvertColors, Layers, Speed, ViewColumn } from "@mui/icons-material";
import { useContext } from "react";
import { AppContext } from "../contexts/AppContext";
import { MenuSelect } from "./MenuSelect";
import { MenuToggle } from "./MenuToggle";

const waveWindowOptions = [128, 256, 512, 1024].map((n) => ({ value: n, label: String(n) }));

// Scope render rate: Auto (adaptive; 60fps at best, dropping to 30/20 only on
// slow machines) or a pinned absolute target, capped at the display refresh rate.
// Shared by both scope tabs and the main roll.
const scopeFpsOptions = [
  { value: 0, label: "Auto" },
  { value: 12, label: "12" },
  { value: 15, label: "15" },
  { value: 20, label: "20" },
  { value: 24, label: "24" },
  { value: 30, label: "30" },
  { value: 48, label: "48" },
  { value: 60, label: "60" },
];

/** FPS control shared by the Scope menus: Auto / 12 / 15 / 20 / 24 / 30 / 48 / 60. */
export function ScopeFpsItem() {
  const ctx = useContext(AppContext);
  return (
    <MenuSelect
      icon={<Speed sx={{ fontSize: 18 }} />}
      label="FPS"
      value={ctx.scopeFps}
      options={scopeFpsOptions}
      active={ctx.scopeFps !== 0}
      onChange={(v) => ctx.setScopeFps(v)}
    />
  );
}

/** Oscilloscope window size (samples). Shared by the Scope wave view and the
 *  Keyboard-view mini scopes (they read the same waveWindowSize). */
export function WaveSamplesItem() {
  const ctx = useContext(AppContext);
  return (
    <MenuSelect
      icon={<GraphicEq sx={{ fontSize: 18 }} />}
      label="Samples"
      value={ctx.waveWindowSize}
      options={waveWindowOptions}
      active
      onChange={(v) => ctx.setWaveWindowSize(v)}
    />
  );
}

const scopeColumnOptions = [1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }));

/** Cells per row in the Scope grids (1..5). Fewer columns = wider cells (and
 *  taller sections, since each section's row count grows to match). Shared by
 *  the Scope tab's Wave and Piano Roll grids. */
export function ScopeColumnsItem() {
  const ctx = useContext(AppContext);
  return (
    <MenuSelect
      icon={<ViewColumn sx={{ fontSize: 18 }} />}
      label="Columns"
      value={ctx.scopeColumns}
      options={scopeColumnOptions}
      active={ctx.scopeColumns !== 3}
      onChange={(v) => ctx.setScopeColumns(v)}
    />
  );
}

/** Amplitude (vertical) scale for the oscilloscope traces: a 1.0x..4.0x slider
 *  in 0.5 steps. The raw ch_out is well under full scale, so quiet channels
 *  benefit from a boost; the trace is clipped to the cell, not wrapped, so an
 *  over-large scale just flattens the peaks. Shared by the Scope wave view
 *  (line & waterfall) and the Keyboard-view mini scopes. */
export function WaveYScaleItem() {
  const ctx = useContext(AppContext);
  const label = `${ctx.waveYScale.toFixed(1)}x`;
  return (
    <div className="menu-row">
      <span className="menu-ico">
        <Height sx={{ fontSize: 18 }} />
      </span>
      <span className="menu-label">Y-Scale</span>
      <span className="menu-state">{label}</span>
      <input
        className="pr-range"
        type="range"
        min={1}
        max={4}
        step={0.5}
        value={ctx.waveYScale}
        onChange={(e) => ctx.setWaveYScale(Number(e.target.value))}
        title={label}
      />
    </div>
  );
}

/** Colorize toggle shared by both Scope modes: OFF = single primary color,
 *  ON = per-channel/voice colors. */
export function ColorizeItems() {
  const ctx = useContext(AppContext);
  return (
    <MenuToggle
      icon={<InvertColors sx={{ fontSize: 18 }} />}
      label="Colorize"
      on={ctx.waveColorize}
      onToggle={() => ctx.setWaveColorize(!ctx.waveColorize)}
    />
  );
}

/** Settings menu for the Scope tab in WAVE mode: Waterfall, colorize options,
 *  and the oscilloscope window size. */
export function WaveMenu() {
  const ctx = useContext(AppContext);
  return (
    <div className="menu-list">
      {/* the only two styles are Line and Waterfall, so a switch reads better
          than a pick-a-value list: OFF = Line, ON = Waterfall */}
      <MenuToggle
        icon={<Layers sx={{ fontSize: 18 }} />}
        label="Waterfall"
        on={ctx.waveStyle === "waterfall"}
        onToggle={() => ctx.setWaveStyle(ctx.waveStyle === "waterfall" ? "line" : "waterfall")}
      />
      <ScopeColumnsItem />
      <WaveSamplesItem />
      <WaveYScaleItem />
      <ScopeFpsItem />
      <ColorizeItems />
    </div>
  );
}
