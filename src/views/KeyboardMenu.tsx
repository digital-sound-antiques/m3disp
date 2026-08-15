import { ShowChart, ViewColumn } from "@mui/icons-material";
import { useContext } from "react";
import { AppContext, type KeyboardScopeType } from "../contexts/AppContext";
import { ScopeFpsItem, WaveSamplesItem, WaveYScaleItem } from "./WaveMenu";
import { MenuSelect } from "./MenuSelect";

const scopeOptions: { value: KeyboardScopeType; label: string }[] = [
  { value: "none", label: "None" },
  { value: "wave", label: "Wave" },
  { value: "roll", label: "Piano Roll" },
];

const keyboardColumnOptions = [1, 2].map((n) => ({ value: n, label: String(n) }));

/** Keyboards per row. Two columns fit more channels on screen at the cost of
 *  each keyboard's width, and stack the track info above rather than beside. */
function KeyboardColumnsItem() {
  const ctx = useContext(AppContext);
  return (
    <MenuSelect
      icon={<ViewColumn sx={{ fontSize: 18 }} />}
      label="Columns"
      value={ctx.keyboardColumns}
      options={keyboardColumnOptions}
      onChange={(v) => ctx.setKeyboardColumns(v)}
    />
  );
}

/** Settings for the Keyboard tab: an optional per-keyboard side visualizer —
 *  a waveform or a mini piano roll — plus the sample window (wave only, shared
 *  with the Scope wave view) and the shared FPS that paces it. */
export function KeyboardMenu() {
  const ctx = useContext(AppContext);
  return (
    <div className="menu-list">
      <KeyboardColumnsItem />
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
