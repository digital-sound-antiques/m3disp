import { ThemeProvider } from "@mui/material/styles";
import { CssBaseline } from "@mui/material";
import { Settings, ViewAgenda } from "@mui/icons-material";
import { useContext, useEffect, useRef, useState } from "react";

import { AppContext } from "../contexts/AppContext";
import { FileDropContext } from "../contexts/FileDropContext";
import { PlayerContext } from "../contexts/PlayerContext";

import { ChannelMaskPanel } from "./ChannelMaskPanel";
import { PianoRoll } from "../widgets/PianoRoll";
import { PianoRollMenu } from "./PianoRollMenu";
import { KeyboardList } from "../widgets/KeyboardList";
import { TimeSlider } from "../widgets/TimeSlider";
import { PlayControl } from "./PlayerControl";
import { TransportButtons } from "./TransportButtons";
import { PlayListView } from "./PlayListView";
import { VolumeControl } from "../widgets/VolumeControl";
import { resetSections } from "./channel-section-order";

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
const CH_MIN = 160;
const CH_MAX = 320;
const clampCh = (w: number) => Math.min(CH_MAX, Math.max(CH_MIN, w));
const BOTTOM_MIN = 64;
const BOTTOM_MAX = 120;
const clampBottom = (h: number) => Math.min(BOTTOM_MAX, Math.max(BOTTOM_MIN, h));
const TITLE_MIN = 24;
const TITLE_MAX = 80;
const clampTitle = (h: number) => Math.min(TITLE_MAX, Math.max(TITLE_MIN, h));
const TITLE_FONT_MIN = 18; // px, the base title size at TITLE_MIN
const TITLE_FONT_MAX = 40; // px, at TITLE_MAX
const titleFontFor = (h: number) =>
  TITLE_FONT_MIN +
  ((h - TITLE_MIN) / (TITLE_MAX - TITLE_MIN)) * (TITLE_FONT_MAX - TITLE_FONT_MIN);

export function App() {
  const app = useContext(AppContext);
  return (
    <ThemeProvider theme={app.theme}>
      <CssBaseline />
      {/* secondary dialogs (still MUI) — render unconditionally, self-gated */}
      <SettingsDialog id="settings-dialog" />
      <PianoRollColorDialog />
      <AboutDialog />
      <AppProgressDialog />
      <OpenUrlDialog />
      <SaveAsZipDialog />
      <SampleDialog />
      <Layout />
    </ThemeProvider>
  );
}

function Layout() {
  const app = useContext(AppContext);
  const context = useContext(PlayerContext);

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
  // channels column width (drag-resizable, persisted)
  const [channelsWidth, setChannelsWidth] = useState(() => {
    const v = parseInt(localStorage.getItem("m3disp.channelsWidth") ?? "", 10);
    return isNaN(v) ? 210 : clampCh(v);
  });
  // bottom bar height (drag-resizable upward, persisted)
  const [bottomHeight, setBottomHeight] = useState(() => {
    const v = parseInt(localStorage.getItem("m3disp.bottomHeight") ?? "", 10);
    return isNaN(v) ? BOTTOM_MIN : clampBottom(v);
  });
  // title-bar height under the piano roll (drag-resizable, grows the title font)
  const [titleHeight, setTitleHeight] = useState(() => {
    const v = parseInt(localStorage.getItem("m3disp.titleHeight") ?? "", 10);
    return isNaN(v) ? TITLE_MIN : clampTitle(v);
  });
  // center view tab: "pianoroll" (default) or "keyboard"
  const [vizTab, setVizTab] = useState<"pianoroll" | "keyboard">(() =>
    localStorage.getItem("m3disp.vizTab") === "keyboard" ? "keyboard" : "pianoroll"
  );
  useEffect(() => {
    localStorage.setItem("m3disp.vizTab", vizTab);
  }, [vizTab]);
  // keyboard view: 1 or 2 channels per row
  const [keyboardCols, setKeyboardCols] = useState<number>(() =>
    localStorage.getItem("m3disp.keyboardCols") === "2" ? 2 : 1
  );
  useEffect(() => {
    localStorage.setItem("m3disp.keyboardCols", String(keyboardCols));
  }, [keyboardCols]);
  // piano-roll settings dropdown (gear in the tab row)
  const [prMenuOpen, setPrMenuOpen] = useState(false);
  const prMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!prMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!prMenuRef.current?.contains(e.target as Node)) setPrMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [prMenuOpen]);

  useEffect(() => {
    localStorage.setItem("m3disp.channelsCollapsed", channelsCollapsed ? "1" : "0");
  }, [channelsCollapsed]);
  useEffect(() => {
    localStorage.setItem("m3disp.sideCollapsed", sideCollapsed ? "1" : "0");
  }, [sideCollapsed]);
  useEffect(() => {
    localStorage.setItem("m3disp.sideWidth", String(sideWidth));
  }, [sideWidth]);
  useEffect(() => {
    localStorage.setItem("m3disp.channelsWidth", String(channelsWidth));
  }, [channelsWidth]);
  useEffect(() => {
    localStorage.setItem("m3disp.bottomHeight", String(bottomHeight));
  }, [bottomHeight]);
  useEffect(() => {
    localStorage.setItem("m3disp.titleHeight", String(titleHeight));
  }, [titleHeight]);

  // "Reset all settings" also restores the layout to its defaults (live).
  useEffect(() => {
    const onReset = () => {
      setChannelsCollapsed(false);
      setSideCollapsed(false);
      setSideWidth(300);
      setChannelsWidth(210);
      setBottomHeight(BOTTOM_MIN);
      setTitleHeight(TITLE_MIN);
      setVizTab("pianoroll");
      setKeyboardCols(1);
      resetSections();
    };
    window.addEventListener("m3disp:reset-layout", onReset);
    return () => window.removeEventListener("m3disp:reset-layout", onReset);
  }, []);

  // Expose the MUI theme's primary + paper background as CSS variables on the
  // document root so the plain-CSS UI (and the modeless dialogs, which render
  // outside .app) can tint/colour to match the theme.
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--primary", app.theme.palette.primary.main);
    root.setProperty("--secondary", app.theme.palette.secondary.main);
    root.setProperty("--panel-bg", app.theme.palette.background.paper);
  }, [app.theme]);

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

  const chDragRef = useRef<{ x: number; w: number } | null>(null);
  const startChResize = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    chDragRef.current = { x: e.clientX, w: channelsWidth };
  };
  const onChResize = (e: React.PointerEvent) => {
    const d = chDragRef.current;
    if (!d) return;
    setChannelsWidth(clampCh(d.w + (e.clientX - d.x)));
  };
  const endChResize = (e: React.PointerEvent) => {
    chDragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const bottomDragRef = useRef<{ y: number; h: number } | null>(null);
  const startBottomResize = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    bottomDragRef.current = { y: e.clientY, h: bottomHeight };
  };
  const onBottomResize = (e: React.PointerEvent) => {
    const d = bottomDragRef.current;
    if (!d) return;
    // dragging up (smaller clientY) grows the bar
    setBottomHeight(clampBottom(d.h - (e.clientY - d.y)));
  };
  const endBottomResize = (e: React.PointerEvent) => {
    bottomDragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const titleDragRef = useRef<{ y: number; h: number } | null>(null);
  const startTitleResize = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    titleDragRef.current = { y: e.clientY, h: titleHeight };
  };
  const onTitleResize = (e: React.PointerEvent) => {
    const d = titleDragRef.current;
    if (!d) return;
    // dragging the piano-roll bottom edge up grows the title bar (and shrinks
    // the piano roll); dragging down shrinks it
    setTitleHeight(clampTitle(d.h - (e.clientY - d.y)));
  };
  const endTitleResize = (e: React.PointerEvent) => {
    titleDragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <FileDropContext>
      <div className="app">
        <div className="layout">
          <aside
            className={`channels${channelsCollapsed ? " collapsed" : ""}`}
            style={channelsCollapsed ? undefined : { width: channelsWidth }}
          >
            {!channelsCollapsed && <ChannelMaskPanel />}
            {!channelsCollapsed && (
              <div
                className="channels-resize"
                onPointerDown={startChResize}
                onPointerMove={onChResize}
                onPointerUp={endChResize}
              />
            )}
            <button
              className="panel-toggle edge-right"
              title={channelsCollapsed ? "Show channels" : "Hide channels"}
              onClick={() => setChannelsCollapsed((c) => !c)}
            >
              <span className="panel-toggle-knob">{channelsCollapsed ? "›" : "‹"}</span>
            </button>
          </aside>

          <div className="main">
            <div className="viz">
              <div className="viz-tabs">
                <button
                  className={`viz-tab${vizTab === "keyboard" ? " active" : ""}`}
                  onClick={() => setVizTab("keyboard")}
                >
                  Keyboard
                </button>
                <button
                  className={`viz-tab${vizTab === "pianoroll" ? " active" : ""}`}
                  onClick={() => setVizTab("pianoroll")}
                >
                  Piano Roll
                </button>
                {vizTab === "keyboard" && (
                  <div className="viz-seg">
                    <button
                      className={`viz-seg-btn${keyboardCols === 1 ? " active" : ""}`}
                      onClick={() => setKeyboardCols(1)}
                      title="1 column"
                    >
                      <ViewAgenda sx={{ fontSize: 15 }} />
                    </button>
                    <button
                      className={`viz-seg-btn${keyboardCols === 2 ? " active" : ""}`}
                      onClick={() => setKeyboardCols(2)}
                      title="2 columns"
                    >
                      <ViewAgenda sx={{ fontSize: 15, transform: "rotate(90deg)" }} />
                    </button>
                  </div>
                )}
                {vizTab === "pianoroll" && (
                  <div className="pr-menu-wrap" ref={prMenuRef}>
                    <button
                      className={`viz-gear${prMenuOpen ? " active" : ""}`}
                      onClick={() => setPrMenuOpen((o) => !o)}
                      title="Piano roll settings"
                    >
                      <Settings sx={{ fontSize: 16 }} />
                    </button>
                    {prMenuOpen && (
                      <div className="pr-menu">
                        <PianoRollMenu />
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="viz-body">
                {vizTab === "pianoroll" ? (
                  <PianoRoll mode={app.pianoRollMode} />
                ) : (
                  <div className="viz-keyboard">
                    <KeyboardList isSmall={false} columns={keyboardCols} />
                  </div>
                )}
              </div>
            </div>

            <section className="transport">
              <div
                className="transport-resize"
                onPointerDown={startTitleResize}
                onPointerMove={onTitleResize}
                onPointerUp={endTitleResize}
              />
              <div
                className="transport-row"
                style={
                  {
                    height: titleHeight,
                    "--title-font": `${titleFontFor(titleHeight)}px`,
                  } as React.CSSProperties
                }
              >
                <PlayControl />
              </div>
              <TimeSlider />
              <div className="transport-buttons-bar">
                <TransportButtons />
              </div>
            </section>
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

        <div className="app-bottom" style={{ height: bottomHeight }}>
          <div
            className="app-bottom-resize"
            onPointerDown={startBottomResize}
            onPointerMove={onBottomResize}
            onPointerUp={endBottomResize}
          />
          <div className="ab-title app-title">
            M<sup>3</sup>disp
          </div>
          <div className="ab-transport">
            <TransportButtons />
          </div>
          <div className="ab-actions header-actions">
            <VolumeControl />
            <OptionMenu />
          </div>
          <span className="ab-version">
            <a href="https://github.com/digital-sound-antiques/m3disp" target="github">
              <img src={ghlogo} width={14} height={14} alt="github" />
            </a>
            <span>v{packageJson.version}</span>
          </span>
          <span className="ab-latency">
            Output Latency: {Math.round(context.player.outputLatency * 1000)}ms
          </span>
        </div>
      </div>
    </FileDropContext>
  );
}
