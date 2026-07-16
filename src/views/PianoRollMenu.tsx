import { AutoAwesome, Layers, Palette, Piano, ZoomIn } from "@mui/icons-material";
import { ReactNode, useContext } from "react";
import { AppContext, keyboardModeCycle, type PianoRollKeyboardMode } from "../contexts/AppContext";
import { pianoRollColorDialogId } from "../widgets/PianoRollControl";
import { particleTypeCycle, type PianoRollParticleType } from "../widgets/piano-roll-painter";
import { ColorizeItems } from "./WaveMenu";

const nextParticleType = (t: PianoRollParticleType) =>
  particleTypeCycle[(particleTypeCycle.indexOf(t) + 1) % particleTypeCycle.length];
const nextKeyboardMode = (t: PianoRollKeyboardMode) =>
  keyboardModeCycle[(keyboardModeCycle.indexOf(t) + 1) % keyboardModeCycle.length];

/** Labelled vertical menu of piano-roll settings (shown from the gear in the
 *  Piano Roll / Grid tab header). In grid mode only Zoom, Particles and Colors
 *  apply (Layer / Keyboard / 3D are piano-roll only). */
export function PianoRollMenu(props: { grid?: boolean; colorize?: boolean }) {
  const ctx = useContext(AppContext);

  const toggle = (icon: ReactNode, label: string, on: boolean, onClick: () => void) => (
    <button className={`menu-item${on ? " active" : ""}`} onClick={onClick}>
      <span className="menu-ico">{icon}</span>
      <span className="menu-label">{label}</span>
      <span className="menu-state">{on ? "ON" : "OFF"}</span>
    </button>
  );

  return (
    <div className="menu-list">
      <div className="menu-row">
        <span className="menu-ico">
          <ZoomIn sx={{ fontSize: 18 }} />
        </span>
        <span className="menu-label">Zoom</span>
        <input
          className="pr-range"
          type="range"
          min={1}
          max={16}
          step={1}
          value={ctx.pianoRollRangeInSec}
          onChange={(e) => ctx.setPianoRollRangeInSec(Number(e.target.value))}
          title={`${ctx.pianoRollRangeInSec}s`}
        />
      </div>
      {!props.grid &&
        toggle(<Layers sx={{ fontSize: 18 }} />, "Layer", ctx.pianoRollLayered, () =>
          ctx.setPianoRollLayered(!ctx.pianoRollLayered)
        )}
      <button
        className={`menu-item${ctx.pianoRollParticleType !== "off" ? " active" : ""}`}
        onClick={() => ctx.setPianoRollParticleType(nextParticleType(ctx.pianoRollParticleType))}
      >
        <span className="menu-ico">
          <AutoAwesome sx={{ fontSize: 18 }} />
        </span>
        <span className="menu-label">Particles</span>
        <span className="menu-state">{ctx.pianoRollParticleType.toUpperCase()}</span>
      </button>
      {!props.grid && (
        <button
          className={`menu-item${ctx.pianoRollKeyboard !== "off" ? " active" : ""}`}
          onClick={() => ctx.setPianoRollKeyboard(nextKeyboardMode(ctx.pianoRollKeyboard))}
        >
          <span className="menu-ico">
            <Piano sx={{ fontSize: 18 }} />
          </span>
          <span className="menu-label">Keyboard</span>
          <span className="menu-state">{ctx.pianoRollKeyboard.toUpperCase()}</span>
        </button>
      )}
      {props.colorize ? (
        <ColorizeItems />
      ) : (
        <button className="menu-item" onClick={() => ctx.openDialog(pianoRollColorDialogId)}>
          <span className="menu-ico">
            <Palette sx={{ fontSize: 18 }} />
          </span>
          <span className="menu-label">Colors…</span>
        </button>
      )}
    </div>
  );
}
