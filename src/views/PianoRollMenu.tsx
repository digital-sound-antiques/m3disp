import { AutoAwesome, Layers, Palette, Piano, ThreeDRotation, ZoomIn } from "@mui/icons-material";
import { ReactNode, useContext } from "react";
import { AppContext } from "../contexts/AppContext";
import { pianoRollColorDialogId } from "../widgets/PianoRollControl";

/** Labelled vertical menu of piano-roll settings (shown from the gear in the
 *  Piano Roll tab header). */
export function PianoRollMenu() {
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
      {toggle(<Layers sx={{ fontSize: 18 }} />, "Layer", ctx.pianoRollLayered, () =>
        ctx.setPianoRollLayered(!ctx.pianoRollLayered)
      )}
      {toggle(<AutoAwesome sx={{ fontSize: 18 }} />, "Particles", ctx.pianoRollShowParticles, () =>
        ctx.setPianoRollShowParticles(!ctx.pianoRollShowParticles)
      )}
      {toggle(<Piano sx={{ fontSize: 18 }} />, "Keyboard", ctx.pianoRollShowKeyboard, () =>
        ctx.setPianoRollShowKeyboard(!ctx.pianoRollShowKeyboard)
      )}
      {toggle(<ThreeDRotation sx={{ fontSize: 18 }} />, "3D", ctx.pianoRollMode === "3d", () =>
        ctx.setPianoRollMode(ctx.pianoRollMode === "3d" ? "2d" : "3d")
      )}
      <button className="menu-item" onClick={() => ctx.openDialog(pianoRollColorDialogId)}>
        <span className="menu-ico">
          <Palette sx={{ fontSize: 18 }} />
        </span>
        <span className="menu-label">Colors…</span>
      </button>
    </div>
  );
}
