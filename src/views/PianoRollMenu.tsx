import {
  AutoAwesome,
  InvertColors,
  Layers,
  Piano,
  TouchApp,
  ViewWeek,
  ZoomIn,
} from "@mui/icons-material";
import { ReactNode, useContext } from "react";
import { AppContext, keyboardModeCycle, type PianoRollKeyboardMode } from "../contexts/AppContext";
import { particleTypeCycle, type PianoRollParticleType } from "../widgets/piano-roll-painter";
import { ColorizeItems, ColorsItem, ScopeColumnsItem, ScopeFpsItem } from "./WaveMenu";
import { MenuSelect } from "./MenuSelect";
import { MenuToggle } from "./MenuToggle";

// Capitalised labels for the particle sub-list, in the cycle's order.
const particleLabels: Record<PianoRollParticleType, string> = {
  off: "Off",
  spark: "Spark",
  star: "Star",
  heart: "Heart",
};
const particleOptions = particleTypeCycle.map((t) => ({ value: t, label: particleLabels[t] }));

const keyboardLabels: Record<PianoRollKeyboardMode, string> = {
  off: "Off",
  on: "On",
  line: "Line",
};
const keyboardOptions = keyboardModeCycle.map((t) => ({ value: t, label: keyboardLabels[t] }));

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
        <span className="menu-state">{`${ctx.pianoRollRangeInSec}s`}</span>
        <input
          className="pr-range"
          type="range"
          min={1}
          max={20}
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
      {toggle(<TouchApp sx={{ fontSize: 18 }} />, "Press", ctx.pianoRollPress, () =>
        ctx.setPianoRollPress(!ctx.pianoRollPress)
      )}
      <MenuSelect
        icon={<AutoAwesome sx={{ fontSize: 18 }} />}
        label="Particles"
        value={ctx.pianoRollParticleType}
        options={particleOptions}
        active={ctx.pianoRollParticleType !== "off"}
        onChange={(v) => ctx.setPianoRollParticleType(v)}
      />
      {!props.grid &&
        toggle(<ViewWeek sx={{ fontSize: 18 }} />, "Beat", ctx.pianoRollBeatLines, () =>
          ctx.setPianoRollBeatLines(!ctx.pianoRollBeatLines)
        )}
      {!props.grid && (
        <MenuSelect
          icon={<Piano sx={{ fontSize: 18 }} />}
          label="Keyboard"
          value={ctx.pianoRollKeyboard}
          options={keyboardOptions}
          active={ctx.pianoRollKeyboard !== "off"}
          onChange={(v) => ctx.setPianoRollKeyboard(v)}
        />
      )}
      {props.grid && <ScopeColumnsItem />}
      <ScopeFpsItem />
      {props.colorize ? (
        <ColorizeItems />
      ) : (
        /* the Roll tab has its own Colorize switch, independent of the Scope
           tab's: OFF = every note in the primary color */
        <MenuToggle
          icon={<InvertColors sx={{ fontSize: 18 }} />}
          label="Colorize"
          on={ctx.pianoRollColorize}
          onToggle={() => ctx.setPianoRollColorize(!ctx.pianoRollColorize)}
        />
      )}
      <ColorsItem />
    </div>
  );
}
