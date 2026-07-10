import { useContext } from "react";
import { PlayerContext } from "../contexts/PlayerContext";
import { SurroundSound, VolumeDown } from "@mui/icons-material";
import { SurroundMode } from "../utils/surround";

const NEXT_MODE: Record<SurroundMode, SurroundMode> = {
  off: "wide",
  wide: "wide-reverb",
  "wide-reverb": "off",
};

const MODE_LABEL: Record<SurroundMode, string> = {
  off: "Surround: Off",
  wide: "Surround: Wide",
  "wide-reverb": "Surround: Wide + Reverb",
};

export function VolumeControl() {
  const context = useContext(PlayerContext);
  const mode = context.surroundMode;
  // Icon color signals the current mode: dim when off, white when widening,
  // accented when reverb is added too.
  const modeColor: Record<SurroundMode, string> = {
    off: "rgba(255,255,255,0.4)",
    wide: "#e0e0e0",
    "wide-reverb": "#4f9cff",
  };
  return (
    <div className="volume">
      <button
        className="surround-btn"
        style={{ color: modeColor[mode] }}
        title={MODE_LABEL[mode]}
        onClick={() => context.reducer.setSurroundMode(NEXT_MODE[mode])}
      >
        <SurroundSound sx={{ fontSize: "20px" }} />
      </button>
      <VolumeDown sx={{ fontSize: "18px" }} />
      <input
        type="range"
        min={1.0}
        max={7.0}
        step={0.25}
        value={context.masterGain}
        onChange={(e) => context.reducer.setMasterGain(Number(e.target.value))}
      />
    </div>
  );
}
