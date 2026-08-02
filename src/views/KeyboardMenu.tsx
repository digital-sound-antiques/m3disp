import { ShowChart } from "@mui/icons-material";
import { useContext } from "react";
import { AppContext, type KeyboardScopeType } from "../contexts/AppContext";
import { ScopeFpsItem, WaveSamplesItem, WaveYScaleItem } from "./WaveMenu";
import { MenuSelect } from "./MenuSelect";

const scopeOptions: { value: KeyboardScopeType; label: string }[] = [
  { value: "none", label: "None" },
  { value: "wave", label: "Wave" },
  { value: "roll", label: "Piano Roll" },
];

/** Settings for the Keyboard tab: an optional per-keyboard side visualizer —
 *  a waveform or a mini piano roll — plus the sample window (wave only, shared
 *  with the Scope wave view) and the shared FPS that paces it. */
export function KeyboardMenu() {
  const ctx = useContext(AppContext);
  return (
    <div className="menu-list">
      <MenuSelect
        icon={<ShowChart sx={{ fontSize: 18 }} />}
        label="Scope"
        value={ctx.keyboardScope}
        options={scopeOptions}
        active={ctx.keyboardScope !== "none"}
        onChange={(v) => ctx.setKeyboardScope(v)}
      />
      {ctx.keyboardScope === "wave" && (
        <>
          <WaveSamplesItem />
          <WaveYScaleItem />
        </>
      )}
      {ctx.keyboardScope !== "none" && <ScopeFpsItem />}
    </div>
  );
}
