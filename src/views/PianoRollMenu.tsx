import { AutoAwesome, Layers, Palette, Piano, ZoomIn } from "@mui/icons-material";
import { ReactNode, useContext } from "react";
import { AppContext, keyboardModeCycle, type PianoRollKeyboardMode } from "../contexts/AppContext";
import { pianoRollColorDialogId } from "../widgets/PianoRollControl";
import { particleTypeCycle, type PianoRollParticleType } from "../widgets/piano-roll-painter";
import { ColorizeItems, ScopeFpsItem } from "./WaveMenu";
import { MenuSelect } from "./MenuSelect";
import { MenuToggle } from "./MenuToggle";

const nextKeyboardMode = (t: PianoRollKeyboardMode) =>
  keyboardModeCycle[(keyboardModeCycle.indexOf(t) + 1) % keyboardModeCycle.length];

// Capitalised labels for the particle sub-list, in the cycle's order.
const particleLabels: Record<PianoRollParticleType, string> = {
  off: "Off",
  spark: "Spark",
  star: "Star",
  heart: "Heart",
};
const particleOptions = particleTypeCycle.map((t) => ({ value: t, label: particleLabels[t] }));

/** Labelled vertical menu of piano-roll settings (shown from the gear in the
 *  Piano Roll / Grid tab header). In grid mode only Zoom, Particles and Colors
 *  apply (Layer / Keyboard / 3D are piano-roll only). */
export function PianoRollMenu(props: { grid?: boolean; colorize?: boolean }) {
  const ctx = useContext(AppContext);

  const toggle = (icon: ReactNode, label: string, on: boolean, onClick: () => void) => (
    <MenuToggle icon={icon} label={label} on={on} onToggle={onClick} />
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
      <MenuSelect
        icon={<AutoAwesome sx={{ fontSize: 18 }} />}
        label="Particles"
        value={ctx.pianoRollParticleType}
        options={particleOptions}
        active={ctx.pianoRollParticleType !== "off"}
        onChange={(v) => ctx.setPianoRollParticleType(v)}
      />
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
      <ScopeFpsItem />
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
