import { GraphicEq, Palette } from "@mui/icons-material";
import { useContext } from "react";
import { AppContext } from "../contexts/AppContext";

const waveWindowCycle = [128, 256, 512];
const nextWaveWindow = (n: number) =>
  waveWindowCycle[(waveWindowCycle.indexOf(n) + 1) % waveWindowCycle.length] ?? 512;

/** Settings menu for the Wave tab (shown from the gear in the tab header).
 *  Colorize OFF = a single primary color; ON = the same per-channel/voice
 *  colors as the piano roll. Samples = shown window size. */
export function WaveMenu() {
  const ctx = useContext(AppContext);
  return (
    <div className="menu-list">
      <button
        className={`menu-item${ctx.waveColorize ? " active" : ""}`}
        onClick={() => ctx.setWaveColorize(!ctx.waveColorize)}
      >
        <span className="menu-ico">
          <Palette sx={{ fontSize: 18 }} />
        </span>
        <span className="menu-label">Colorize</span>
        <span className="menu-state">{ctx.waveColorize ? "ON" : "OFF"}</span>
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
    </div>
  );
}
