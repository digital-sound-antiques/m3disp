import { AutoAwesome, Layers, Piano, Settings, ThreeDRotation, ZoomIn } from "@mui/icons-material";
import { useContext } from "react";
import { AppContext } from "../contexts/AppContext";
import { particleTypeCycle, type PianoRollParticleType } from "./piano-roll-painter";

export const pianoRollColorDialogId = "piano-roll-color-dialog";

const nextParticleType = (t: PianoRollParticleType) =>
  particleTypeCycle[(particleTypeCycle.indexOf(t) + 1) % particleTypeCycle.length];

export function PianoRollControl() {
  const context = useContext(AppContext);

  return (
    <div className="pr-control">
      <span className="pr-ico" title="Time range">
        <ZoomIn sx={{ fontSize: 16 }} />
      </span>
      <input
        className="pr-range"
        type="range"
        min={1}
        max={16}
        step={1}
        value={context.pianoRollRangeInSec}
        onChange={(e) => context.setPianoRollRangeInSec(Number(e.target.value))}
        title={`${context.pianoRollRangeInSec}s`}
      />
      <button
        className={`pr-toggle${context.pianoRollLayered ? " active" : ""}`}
        onClick={() => context.setPianoRollLayered(!context.pianoRollLayered)}
        title="Layered"
      >
        <Layers sx={{ fontSize: 16 }} />
      </button>
      <button
        className={`pr-toggle${context.pianoRollParticleType !== "off" ? " active" : ""}`}
        onClick={() => context.setPianoRollParticleType(nextParticleType(context.pianoRollParticleType))}
        title={`Particles: ${context.pianoRollParticleType}`}
      >
        <AutoAwesome sx={{ fontSize: 16 }} />
      </button>
      <button
        className={`pr-toggle${context.pianoRollShowKeyboard ? " active" : ""}`}
        onClick={() => context.setPianoRollShowKeyboard(!context.pianoRollShowKeyboard)}
        title="Keyboard"
      >
        <Piano sx={{ fontSize: 16 }} />
      </button>
      <button
        className={`pr-toggle${context.pianoRollMode == "3d" ? " active" : ""}`}
        onClick={() => context.setPianoRollMode(context.pianoRollMode == "3d" ? "2d" : "3d")}
        title="3D"
      >
        <ThreeDRotation sx={{ fontSize: 16 }} />
      </button>
      <button
        className="pr-toggle"
        onClick={() => context.openDialog(pianoRollColorDialogId)}
        title="Channel color settings"
      >
        <Settings sx={{ fontSize: 16 }} />
      </button>
    </div>
  );
}
