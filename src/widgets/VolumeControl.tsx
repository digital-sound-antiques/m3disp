import { useContext } from "react";
import {
  MASTER_GAIN_MAX_DB,
  MASTER_GAIN_MIN_DB,
  PlayerContext,
  masterGainFromDb,
  masterGainToDb,
} from "../contexts/PlayerContext";
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
    "wide-reverb": "var(--primary)",
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
        min={MASTER_GAIN_MIN_DB}
        max={MASTER_GAIN_MAX_DB}
        step={0.5}
        value={masterGainToDb(context.masterGain)}
        title={context.masterGain > 0 ? `${masterGainToDb(context.masterGain).toFixed(1)} dB` : "Mute"}
        onChange={(e) => context.reducer.setMasterGain(masterGainFromDb(Number(e.target.value)))}
      />
    </div>
  );
}
