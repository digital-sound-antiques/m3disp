import { GraphicEq, InvertColors, Layers, Speed } from "@mui/icons-material";
import { useContext } from "react";
import { AppContext } from "../contexts/AppContext";

const waveWindowCycle = [128, 256, 512, 1024];
const nextWaveWindow = (n: number) =>
  waveWindowCycle[(waveWindowCycle.indexOf(n) + 1) % waveWindowCycle.length] ?? 512;

// Scope render rate: Auto (adaptive; drops to 30/20fps only on slow machines)
// or a pinned target. Shared by both scope tabs and the main roll.
const scopeFpsCycle = [0, 60, 30];
const nextScopeFps = (n: number) =>
  scopeFpsCycle[(scopeFpsCycle.indexOf(n) + 1) % scopeFpsCycle.length] ?? 0;

/** FPS control shared by the Scope menus: Auto / 60 / 30. */
export function ScopeFpsItem() {
  const ctx = useContext(AppContext);
  return (
    <button
      className={`menu-item${ctx.scopeFps !== 0 ? " active" : ""}`}
      onClick={() => ctx.setScopeFps(nextScopeFps(ctx.scopeFps))}
    >
      <span className="menu-ico">
        <Speed sx={{ fontSize: 18 }} />
      </span>
      <span className="menu-label">FPS</span>
      <span className="menu-state">{ctx.scopeFps === 0 ? "Auto" : ctx.scopeFps}</span>
    </button>
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
  const waterfall = ctx.waveStyle === "waterfall";
  return (
    <div className="menu-list">
      <button
        className="menu-item active"
        onClick={() => ctx.setWaveStyle(waterfall ? "line" : "waterfall")}
      >
        <span className="menu-ico">
          <Layers sx={{ fontSize: 18 }} />
        </span>
        <span className="menu-label">Type</span>
        <span className="menu-state">{waterfall ? "Waterfall" : "Line"}</span>
      </button>
      <button
        className="menu-item active"
        onClick={() => ctx.setWaveWindowSize(nextWaveWindow(ctx.waveWindowSize))}
      >
        <span className="menu-ico">
          <GraphicEq sx={{ fontSize: 18 }} />
        </span>
        <span className="menu-label">Samples</span>
        <span className="menu-state">{ctx.waveWindowSize}</span>
      </button>
      <ScopeFpsItem />
      <ColorizeItems />
    </div>
  );
}
