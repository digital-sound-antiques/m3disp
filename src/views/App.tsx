import { ThemeProvider } from "@mui/material/styles";
import { CssBaseline } from "@mui/material";
import { MoreVert, Piano } from "@mui/icons-material";
import { useContext, useEffect, useRef, useState } from "react";

import { AppContext } from "../contexts/AppContext";
import { FileDropContext } from "../contexts/FileDropContext";
import { PlayerContext } from "../contexts/PlayerContext";

import { ChannelMaskPanel } from "./ChannelMaskPanel";
import { PianoRoll } from "../widgets/PianoRoll";
import { PianoRollControl } from "../widgets/PianoRollControl";
import { TimeSlider } from "../widgets/TimeSlider";
import { PlayControl } from "./PlayerControl";
import { PlayListView } from "./PlayListView";
import { VolumeControl } from "../widgets/VolumeControl";

import { KeyboardDialog, keyboardDialogId } from "./KeyboardDialog";
import { SettingsDialog } from "./SettingsDialog";
import { PianoRollColorDialog } from "./PianoRollColorDialog";
import { OptionMenu } from "./OptionMenu";
import { AboutDialog } from "./AboutDialog";
import { AppProgressDialog } from "./AppProgressDialog";
import { OpenUrlDialog } from "./OpenUrlDialog";
import { SaveAsZipDialog } from "./SaveAsZipDialog";
import { SampleDialog } from "./SampleDialog";

import packageJson from "../../package.json";
import ghlogo from "../assets/github-mark-white.svg";
import "./App.css";

const SIDE_MIN = 220;
const SIDE_MAX = 560;

export function App() {
  const app = useContext(AppContext);
  return (
    <ThemeProvider theme={app.theme}>
      <CssBaseline />
      {/* secondary dialogs (still MUI) — render unconditionally, self-gated */}
      <SettingsDialog id="settings-dialog" />
      <PianoRollColorDialog />
      <OptionMenu id="option-menu" />
      <AboutDialog />
      <AppProgressDialog />
      <OpenUrlDialog />
      <SaveAsZipDialog />
      <SampleDialog />
      <KeyboardDialog />
      <Layout />
    </ThemeProvider>
  );
}

function Layout() {
  const app = useContext(AppContext);
  const context = useContext(PlayerContext);
  const optionsRef = useRef<HTMLButtonElement>(null);

  const [channelsCollapsed, setChannelsCollapsed] = useState(
    () => localStorage.getItem("m3disp.channelsCollapsed") === "1"
  );
  const [sideCollapsed, setSideCollapsed] = useState(
    () => localStorage.getItem("m3disp.sideCollapsed") === "1"
  );
  const [sideWidth, setSideWidth] = useState(() => {
    const v = parseInt(localStorage.getItem("m3disp.sideWidth") ?? "", 10);
    return isNaN(v) ? 300 : Math.min(SIDE_MAX, Math.max(SIDE_MIN, v));
  });

  useEffect(() => {
    localStorage.setItem("m3disp.channelsCollapsed", channelsCollapsed ? "1" : "0");
  }, [channelsCollapsed]);
  useEffect(() => {
    localStorage.setItem("m3disp.sideCollapsed", sideCollapsed ? "1" : "0");
  }, [sideCollapsed]);
  useEffect(() => {
    localStorage.setItem("m3disp.sideWidth", String(sideWidth));
  }, [sideWidth]);

  const sideDragRef = useRef<{ x: number; w: number } | null>(null);
  const startSideResize = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    sideDragRef.current = { x: e.clientX, w: sideWidth };
  };
  const onSideResize = (e: React.PointerEvent) => {
    const d = sideDragRef.current;
    if (!d) return;
    setSideWidth(Math.min(SIDE_MAX, Math.max(SIDE_MIN, d.w - (e.clientX - d.x))));
  };
  const endSideResize = (e: React.PointerEvent) => {
    sideDragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <FileDropContext>
      <div className="app">
        <div className="layout">
          <aside className={`channels${channelsCollapsed ? " collapsed" : ""}`}>
            {!channelsCollapsed && <ChannelMaskPanel />}
            <button
              className="panel-toggle edge-right"
              title={channelsCollapsed ? "Show channels" : "Hide channels"}
              onClick={() => setChannelsCollapsed((c) => !c)}
            >
              <span className="panel-toggle-knob">{channelsCollapsed ? "›" : "‹"}</span>
            </button>
          </aside>

          <div className="main">
            <header>
              <h1>
                M<sup>3</sup>disp
              </h1>
              <div className="header-actions">
                <VolumeControl />
                <button
                  className="hbtn"
                  title="Keyboard"
                  onClick={() => app.openDialog(keyboardDialogId)}
                >
                  <Piano sx={{ fontSize: 20 }} />
                </button>
                <button
                  className="hbtn"
                  ref={optionsRef}
                  title="Options"
                  onClick={() => app.openPopup("option-menu", optionsRef.current!)}
                >
                  <MoreVert sx={{ fontSize: 20 }} />
                </button>
              </div>
            </header>

            <div className="pr-bar">
              <PianoRollControl />
            </div>

            <div className="viz">
              <PianoRoll mode={app.pianoRollMode} />
            </div>

            <section className="transport">
              <TimeSlider />
              <PlayControl />
            </section>

            <div className="app-footer">
              <a href="https://github.com/digital-sound-antiques/m3disp" target="github">
                <img src={ghlogo} width={14} height={14} alt="github" />
              </a>
              <span>v{packageJson.version}</span>
              <span className="spacer" />
              <span>Output Latency: {Math.round(context.player.outputLatency * 1000)}ms</span>
            </div>
          </div>

          <aside
            className={`side${sideCollapsed ? " collapsed" : ""}`}
            style={sideCollapsed ? undefined : { width: sideWidth }}
          >
            {!sideCollapsed && (
              <div
                className="side-resize"
                onPointerDown={startSideResize}
                onPointerMove={onSideResize}
                onPointerUp={endSideResize}
              />
            )}
            <button
              className="panel-toggle edge-left"
              title={sideCollapsed ? "Show playlist" : "Hide playlist"}
              onClick={() => setSideCollapsed((c) => !c)}
            >
              <span className="panel-toggle-knob">{sideCollapsed ? "‹" : "›"}</span>
            </button>
            {!sideCollapsed && <PlayListView />}
          </aside>
        </div>
      </div>
    </FileDropContext>
  );
}
