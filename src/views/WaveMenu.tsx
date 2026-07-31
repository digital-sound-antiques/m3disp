import { GraphicEq, InvertColors, Layers, Speed } from "@mui/icons-material";
import { useContext } from "react";
import { AppContext, type WaveStyle } from "../contexts/AppContext";
import { MenuSelect } from "./MenuSelect";

const waveStyleOptions: { value: WaveStyle; label: string }[] = [
  { value: "line", label: "Line" },
  { value: "waterfall", label: "Waterfall" },
];
const waveWindowOptions = [128, 256, 512, 1024].map((n) => ({ value: n, label: String(n) }));

// Scope render rate: Auto (adaptive; drops to 30/20fps only on slow machines)
// or a pinned absolute target. Shared by both scope tabs and the main roll.
// 120 is honored on a 120Hz+ display (capped at the refresh rate otherwise).
const scopeFpsOptions = [
  { value: 0, label: "Auto" },
  { value: 15, label: "15" },
  { value: 30, label: "30" },
  { value: 60, label: "60" },
  { value: 120, label: "120" },
];

/** FPS control shared by the Scope menus: Auto / 30 / 60 / 120. */
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

/** Colorize toggle shared by both Scope modes: OFF = single primary color,
 *  ON = per-channel/voice colors. */
export function ColorizeItems() {
  const ctx = useContext(AppContext);
  return (
    <button
      className={`menu-item${ctx.waveColorize ? " active" : ""}`}
      onClick={() => ctx.setWaveColorize(!ctx.waveColorize)}
    >
      <span className="menu-ico">
        <InvertColors sx={{ fontSize: 18 }} />
      </span>
      <span className="menu-label">Colorize</span>
      <span className="menu-state">{ctx.waveColorize ? "ON" : "OFF"}</span>
    </button>
  );
}

/** Settings menu for the Scope tab in WAVE mode: Type, colorize options, and
 *  the oscilloscope window size. */
export function WaveMenu() {
  const ctx = useContext(AppContext);
  return (
    <div className="menu-list">
      <MenuSelect
        icon={<Layers sx={{ fontSize: 18 }} />}
        label="Type"
        value={ctx.waveStyle}
        options={waveStyleOptions}
        active={ctx.waveStyle === "waterfall"}
        onChange={(v) => ctx.setWaveStyle(v)}
      />
      <MenuSelect
        icon={<GraphicEq sx={{ fontSize: 18 }} />}
        label="Samples"
        value={ctx.waveWindowSize}
        options={waveWindowOptions}
        active
        onChange={(v) => ctx.setWaveWindowSize(v)}
      />
      <ScopeFpsItem />
      <ColorizeItems />
    </div>
  );
}
