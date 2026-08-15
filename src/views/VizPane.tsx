// One pane of the visualiser area: a tab strip with its per-tab toolbar, and
// the body of whichever tab is active.
//
// Two panes can be shown stacked, and tabs move between them by dragging. The
// drag uses the browser's own drag-and-drop rather than @hello-pangea/dnd,
// which the rest of the app uses: a DragDropContext cannot be nested, and the
// keyboard view inside a pane body already has one of its own.

import { useContext, useEffect, useRef, useState } from "react";
import {
  CropLandscape,
  CropPortrait,
  MusicNote,
  Settings,
  ShowChart,
  ViewAgenda,
} from "@mui/icons-material";

import { AppContext } from "../contexts/AppContext";
import { PianoRoll } from "../widgets/PianoRoll";
import { PianoRollGrid } from "../widgets/PianoRollGrid";
import { WaveGrid } from "../widgets/WaveGrid";
import { KeyboardList } from "../widgets/KeyboardList";
import { PianoRollMenu } from "./PianoRollMenu";
import { WaveMenu } from "./WaveMenu";
import { KeyboardMenu } from "./KeyboardMenu";

export type VizTabId = "keyboard" | "pianoroll" | "wave";
export const VIZ_TABS: VizTabId[] = ["keyboard", "pianoroll", "wave"];

const TAB_LABELS: Record<VizTabId, string> = {
  keyboard: "Keyboard",
  pianoroll: "Roll",
  wave: "Scope",
};

/** Identifies our own drags, so unrelated drops (files, text) are ignored. */
export const VIZ_TAB_MIME = "application/x-m3disp-viztab";

export function isVizTabDrag(e: React.DragEvent): boolean {
  return e.dataTransfer.types.includes(VIZ_TAB_MIME);
}

type Props = {
  tabs: VizTabId[];
  active: VizTabId;
  onActivate: (tab: VizTabId) => void;
  /** Drop of `tab` onto this pane, at `index` within its strip. */
  onDropTab: (tab: VizTabId, index: number) => void;
  onDragStateChange: (dragging: boolean) => void;
  keyboardCols: number;
  setKeyboardCols: (cols: number) => void;
};

export function VizPane(props: Props) {
  const app = useContext(AppContext);
  const { active } = props;

  // Settings dropdown, per pane — two panes can have their own open at once.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  // Insertion point highlighted while a tab hovers over this strip.
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const stripDrop = (e: React.DragEvent, index: number) => {
    if (!isVizTabDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setDropIndex(null);
    props.onDropTab(e.dataTransfer.getData(VIZ_TAB_MIME) as VizTabId, index);
  };

  const gearTitle =
    active === "wave"
      ? "Scope settings"
      : active === "keyboard"
        ? "Keyboard settings"
        : "Piano roll settings";

  return (
    <div className="viz-pane">
      <div
        className="viz-tabs"
        onDragOver={(e) => {
          if (!isVizTabDrag(e)) return;
          e.preventDefault();
          if (dropIndex == null) setDropIndex(props.tabs.length);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropIndex(null);
        }}
        onDrop={(e) => stripDrop(e, props.tabs.length)}
      >
        {props.tabs.map((tab, i) => (
          <button
            key={tab}
            className={
              `viz-tab${tab === active ? " active" : ""}` +
              (dropIndex === i ? " drop-before" : "")
            }
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(VIZ_TAB_MIME, tab);
              e.dataTransfer.effectAllowed = "move";
              props.onDragStateChange(true);
            }}
            onDragEnd={() => {
              props.onDragStateChange(false);
              setDropIndex(null);
            }}
            onDragOver={(e) => {
              if (!isVizTabDrag(e)) return;
              e.preventDefault();
              e.stopPropagation();
              setDropIndex(i);
            }}
            onDrop={(e) => stripDrop(e, i)}
            onClick={() => props.onActivate(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}

        <div className="pr-menu-wrap" ref={menuRef}>
          {active === "keyboard" && (
            <div className="viz-seg">
              <button
                className={`viz-seg-btn${props.keyboardCols === 1 ? " active" : ""}`}
                onClick={() => props.setKeyboardCols(1)}
                title="1 column"
              >
                <ViewAgenda sx={{ fontSize: 15 }} />
              </button>
              <button
                className={`viz-seg-btn${props.keyboardCols === 2 ? " active" : ""}`}
                onClick={() => props.setKeyboardCols(2)}
                title="2 columns"
              >
                <ViewAgenda sx={{ fontSize: 15, transform: "rotate(90deg)" }} />
              </button>
            </div>
          )}
          {active === "wave" && (
            <div className="viz-seg">
              <button
                className={`viz-seg-btn${app.scopeType === "wave" ? " active" : ""}`}
                onClick={() => app.setScopeType("wave")}
                title="Waveform"
              >
                <ShowChart sx={{ fontSize: 15 }} />
              </button>
              <button
                className={`viz-seg-btn${app.scopeType === "roll" ? " active" : ""}`}
                onClick={() => app.setScopeType("roll")}
                title="Piano notes"
              >
                <MusicNote sx={{ fontSize: 15 }} />
              </button>
            </div>
          )}
          {active === "pianoroll" && (
            <div className="viz-seg">
              <button
                className={`viz-seg-btn${app.pianoRollMode !== "3d" ? " active" : ""}`}
                onClick={() => app.setPianoRollMode("2d")}
                title="2D"
              >
                <CropLandscape sx={{ fontSize: 15 }} />
              </button>
              <button
                className={`viz-seg-btn${app.pianoRollMode === "3d" ? " active" : ""}`}
                onClick={() => app.setPianoRollMode("3d")}
                title="3D"
              >
                <CropPortrait sx={{ fontSize: 15 }} />
              </button>
            </div>
          )}
          <button
            className={`viz-gear${menuOpen ? " active" : ""}`}
            onClick={() => setMenuOpen((o) => !o)}
            title={gearTitle}
          >
            <Settings sx={{ fontSize: 16 }} />
          </button>
          {menuOpen && (
            <div className="pr-menu">
              {active === "wave" ? (
                app.scopeType === "roll" ? (
                  <PianoRollMenu grid colorize />
                ) : (
                  <WaveMenu />
                )
              ) : active === "keyboard" ? (
                <KeyboardMenu />
              ) : (
                <PianoRollMenu />
              )}
            </div>
          )}
        </div>
      </div>

      <div className="viz-body">
        {active === "pianoroll" ? (
          <PianoRoll mode={app.pianoRollMode} />
        ) : active === "wave" ? (
          app.scopeType === "roll" ? (
            <PianoRollGrid />
          ) : (
            <WaveGrid />
          )
        ) : (
          <div className="viz-keyboard">
            <KeyboardList isSmall={false} columns={props.keyboardCols} />
          </div>
        )}
      </div>
    </div>
  );
}
