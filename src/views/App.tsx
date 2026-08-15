import { ThemeProvider } from "@mui/material/styles";
import { CssBaseline } from "@mui/material";
import { FormatAlignCenter, FormatAlignLeft, FormatAlignRight } from "@mui/icons-material";
import { useContext, useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

import { AppContext } from "../contexts/AppContext";
import { FileDropContext } from "../contexts/FileDropContext";
import { PlayerContext } from "../contexts/PlayerContext";

import { ChannelMaskPanel } from "./ChannelMaskPanel";
import {
  VizPane,
  VIZ_TABS,
  VIZ_TAB_MIME,
  isVizTabDrag,
  type VizTabId,
} from "./VizPane";
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

/** Pick black or white for a (hex) background using perceived brightness (YIQ).
 *  Dark text on light colours, white on dark; the threshold is tuned to read
 *  well on saturated mid-tones (e.g. white on a medium blue). */
const ON_COLOR_THRESHOLD = 150; // 0..255
function onColor(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
  if (!m) return "#ffffff";
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness >= ON_COLOR_THRESHOLD ? "#0d1117" : "#ffffff";
}

// ---- visualiser pane layout ----

const VIZ_LAYOUT_KEY = "m3disp.vizLayout";
const SPLIT_MIN = 0.15;
const SPLIT_MAX = 0.85;
const clampSplit = (r: number) => Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, r));

type VizLayout = {
  top: VizTabId[];
  bottom: VizTabId[];
  activeTop: VizTabId | null;
  activeBottom: VizTabId | null;
  /** Top pane's share of the height, 0..1. Only meaningful when split. */
  ratio: number;
};

/**
 * Keep a layout self-consistent: every tab present exactly once, each pane's
 * active tab actually in that pane, and an unsplit layout always held in `top`
 * so "not split" has a single representation.
 */
function normalizeVizLayout(l: VizLayout): VizLayout {
  const seen = new Set<VizTabId>();
  const keep = (list: VizTabId[]) =>
    list.filter((t) => VIZ_TABS.includes(t) && !seen.has(t) && seen.add(t) !== undefined);
  let top = keep(l.top);
  let bottom = keep(l.bottom);
  // Any tab lost by malformed storage comes back in the top pane.
  for (const t of VIZ_TABS) if (!seen.has(t)) top.push(t);
  if (top.length === 0) {
    top = bottom;
    bottom = [];
  }
  const pick = (list: VizTabId[], active: VizTabId | null) =>
    list.length === 0 ? null : list.includes(active as VizTabId) ? active : list[0];
  return {
    top,
    bottom,
    activeTop: pick(top, l.activeTop),
    activeBottom: pick(bottom, l.activeBottom),
    ratio: clampSplit(l.ratio),
  };
}

function loadVizLayout(): VizLayout {
  const fallback: VizLayout = {
    top: [...VIZ_TABS],
    bottom: [],
    activeTop: "pianoroll",
    activeBottom: null,
    ratio: 0.5,
  };
  try {
    const raw = localStorage.getItem(VIZ_LAYOUT_KEY);
    if (raw) return normalizeVizLayout({ ...fallback, ...JSON.parse(raw) });
  } catch {
    /* ignore malformed storage */
  }
  // Carry over the single-tab selection this replaced. The old "grid" tab
  // folded into Scope (Type = ROLL).
  const old = localStorage.getItem("m3disp.vizTab");
  if (old === "grid") {
    localStorage.setItem("m3disp.scopeType", "roll");
    return normalizeVizLayout({ ...fallback, activeTop: "wave" });
  }
  if (old === "keyboard" || old === "wave") {
    return normalizeVizLayout({ ...fallback, activeTop: old });
  }
  return fallback;
}

const BOTTOM_MIN = 40;
const BOTTOM_MAX = 128;
const BOTTOM_DEFAULT = 64;
// below this bar height, drop the version/latency line
const BOTTOM_COMPACT = 64;
// transport controls scale from 1.0 (min bar height) up to 1.5 (max)
const transportScaleFor = (h: number) =>
  1 + ((h - BOTTOM_MIN) / (BOTTOM_MAX - BOTTOM_MIN)) * 0.5;
const clampBottom = (h: number) => Math.min(BOTTOM_MAX, Math.max(BOTTOM_MIN, h));
const TITLE_MIN = 16;
const TITLE_MAX = 80;
const TITLE_DEFAULT = 20;
const clampTitle = (h: number) => Math.min(TITLE_MAX, Math.max(TITLE_MIN, h));
const TITLE_FONT_MAX = 64; // px, upper cap for the title font
// The title font tracks the bar height (so it fills without being clipped by the
// row) up to a cap; with line-height:1 on the title, 0.8×height always fits.
const titleFontFor = (h: number) => Math.min(TITLE_FONT_MAX, Math.round(h * 0.8));

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

  // PWA update: a new deploy installs but waits (registerType "prompt"); surface
  // an UPDATE button next to the version instead of auto-reloading mid-playback.
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, r) {
      // re-check periodically so a long-open session still sees new releases
      if (r) setInterval(() => r.update(), 60 * 60 * 1000);
    },
  });
  const [updating, setUpdating] = useState(false);
  const updateButton = updating ? (
    <span className="ab-updating">Updating…</span>
  ) : needRefresh ? (
    <button
      className="ab-update"
      onClick={() => {
        setUpdating(true);
        updateServiceWorker(true);
      }}
      title="A new version is available — click to update"
    >
      UPDATE
    </button>
  ) : null;

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
    return isNaN(v) ? BOTTOM_DEFAULT : clampBottom(v);
  });
  // title-bar height under the piano roll (drag-resizable, grows the title font)
  const [titleHeight, setTitleHeight] = useState(() => {
    const v = parseInt(localStorage.getItem("m3disp.titleHeight") ?? "", 10);
    return isNaN(v) ? TITLE_DEFAULT : clampTitle(v);
  });
  // title text alignment (left / center / right), persisted
  const [titleAlign, setTitleAlign] = useState<"left" | "center" | "right">(() => {
    const v = localStorage.getItem("m3disp.titleAlign");
    return v === "center" || v === "right" ? v : "left";
  });
  // Which tab sits in which pane, and which is on top in each. Everything lives
  // in one pane until a tab is dragged out, which is when the split appears.
  const [vizLayout, setVizLayout] = useState<VizLayout>(loadVizLayout);
  useEffect(() => {
    localStorage.setItem(VIZ_LAYOUT_KEY, JSON.stringify(vizLayout));
  }, [vizLayout]);
  // True while a tab is being dragged, which is when the "drop to split" target
  // is worth showing.
  const [tabDragging, setTabDragging] = useState(false);
  // A tab dropped into the other pane unmounts the button it was dragged from,
  // so its own dragend never fires. Watch for the end of the drag at the window
  // instead, which also covers dropping outside and cancelling with Esc.
  useEffect(() => {
    if (!tabDragging) return;
    // Bubble phase, not capture: React handles the drop at the root container,
    // so capturing here would clear the flag — and unmount the drop target —
    // before its onDrop ever ran.
    const stop = () => setTabDragging(false);
    window.addEventListener("dragend", stop);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragend", stop);
      window.removeEventListener("drop", stop);
    };
  }, [tabDragging]);

  const vizRef = useRef<HTMLDivElement>(null);
  const splitDragRef = useRef(false);
  const startSplitResize = (e: React.PointerEvent) => {
    splitDragRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onSplitResize = (e: React.PointerEvent) => {
    if (!splitDragRef.current || vizRef.current == null) return;
    const r = vizRef.current.getBoundingClientRect();
    if (r.height <= 0) return;
    const ratio = (e.clientY - r.top) / r.height;
    setVizLayout((l) => ({ ...l, ratio: clampSplit(ratio) }));
  };
  const endSplitResize = (e: React.PointerEvent) => {
    splitDragRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  /** Move `tab` into `pane` at `index`, keeping both panes' active tabs valid. */
  const moveVizTab = (tab: VizTabId, pane: "top" | "bottom", index: number) => {
    // The drag is over once a drop lands. The window listener below can't be
    // relied on for this: a drop onto a tab stops propagation so the strip
    // underneath doesn't also handle it, which keeps the event from reaching
    // the window at all.
    setTabDragging(false);
    setVizLayout((l) => {
      const top = l.top.filter((t) => t !== tab);
      const bottom = l.bottom.filter((t) => t !== tab);
      const target = pane === "top" ? top : bottom;
      target.splice(Math.max(0, Math.min(index, target.length)), 0, tab);
      return normalizeVizLayout({ ...l, top, bottom, [pane === "top" ? "activeTop" : "activeBottom"]: tab });
    });
  };
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
  useEffect(() => {
    localStorage.setItem("m3disp.titleAlign", titleAlign);
  }, [titleAlign]);

  // "Reset all settings" also restores the layout to its defaults (live).
  useEffect(() => {
    const onReset = () => {
      setChannelsCollapsed(false);
      setSideCollapsed(false);
      setSideWidth(300);
      setChannelsWidth(210);
      setBottomHeight(BOTTOM_DEFAULT);
      setTitleHeight(TITLE_DEFAULT);
      setTitleAlign("left");
      setVizLayout(
        normalizeVizLayout({
          top: [...VIZ_TABS],
          bottom: [],
          activeTop: "pianoroll",
          activeBottom: null,
          ratio: 0.5,
        })
      );
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
    root.setProperty("--on-primary", onColor(app.theme.palette.primary.main));
    root.setProperty("--secondary", app.theme.palette.secondary.main);
    root.setProperty("--on-secondary", onColor(app.theme.palette.secondary.main));
    root.setProperty("--panel-bg", app.theme.palette.background.paper);
    root.setProperty(
      "--seek-color",
      app.seekSliderColorType === "primary"
        ? app.theme.palette.primary.main
        : app.theme.palette.secondary.main
    );
  }, [app.theme, app.seekSliderColorType]);

  // channel/playlist font scale: level 1..5 -> 100%..200% in 25% steps
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--ch-font-scale", String(1 + (app.channelFontScaleLevel - 1) * 0.25));
    root.setProperty("--pl-font-scale", String(1 + (app.playlistFontScaleLevel - 1) * 0.25));
  }, [app.channelFontScaleLevel, app.playlistFontScaleLevel]);

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
    const raw = clampBottom(d.h - (e.clientY - d.y));
    // snap the 48–64 band to either end (no intermediate heights there); the
    // range above BOTTOM_COMPACT stays continuous
    const h = raw < BOTTOM_COMPACT ? (raw < (BOTTOM_MIN + BOTTOM_COMPACT) / 2 ? BOTTOM_MIN : BOTTOM_COMPACT) : raw;
    setBottomHeight(h);
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
            <div className="viz" ref={vizRef}>
              {(() => {
                const l = vizLayout;
                const split = l.top.length > 0 && l.bottom.length > 0;
                const pane = (which: "top" | "bottom") => (
                  <VizPane
                    tabs={which === "top" ? l.top : l.bottom}
                    active={(which === "top" ? l.activeTop : l.activeBottom)!}
                    onActivate={(t) =>
                      setVizLayout((s) => ({
                        ...s,
                        [which === "top" ? "activeTop" : "activeBottom"]: t,
                      }))
                    }
                    onDropTab={(t, i) => moveVizTab(t, which, i)}
                    onDragStateChange={setTabDragging}
                  />
                );
                return (
                  <>
                    <div
                      className="viz-pane-slot"
                      style={{ flex: split ? `${l.ratio} 1 0` : "1 1 0" }}
                    >
                      {pane("top")}
                    </div>
                    {split && (
                      <>
                        <div
                          className="viz-split-resize"
                          onPointerDown={startSplitResize}
                          onPointerMove={onSplitResize}
                          onPointerUp={endSplitResize}
                        />
                        <div className="viz-pane-slot" style={{ flex: `${1 - l.ratio} 1 0` }}>
                          {pane("bottom")}
                        </div>
                      </>
                    )}
                    {!split && tabDragging && (
                      <div
                        className="viz-split-drop"
                        onDragOver={(e) => {
                          if (isVizTabDrag(e)) e.preventDefault();
                        }}
                        onDrop={(e) => {
                          if (!isVizTabDrag(e)) return;
                          e.preventDefault();
                          moveVizTab(e.dataTransfer.getData(VIZ_TAB_MIME) as VizTabId, "bottom", 0);
                        }}
                      >
                        Drop here to split
                      </div>
                    )}
                  </>
                );
              })()}
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
                    "--title-align": titleAlign,
                  } as React.CSSProperties
                }
              >
                <PlayControl />
                <div className="viz-seg title-align-seg">
                  <button
                    className={`viz-seg-btn${titleAlign === "left" ? " active" : ""}`}
                    onClick={() => setTitleAlign("left")}
                    title="Align left"
                  >
                    <FormatAlignLeft sx={{ fontSize: 15 }} />
                  </button>
                  <button
                    className={`viz-seg-btn${titleAlign === "center" ? " active" : ""}`}
                    onClick={() => setTitleAlign("center")}
                    title="Align center"
                  >
                    <FormatAlignCenter sx={{ fontSize: 15 }} />
                  </button>
                  <button
                    className={`viz-seg-btn${titleAlign === "right" ? " active" : ""}`}
                    onClick={() => setTitleAlign("right")}
                    title="Align right"
                  >
                    <FormatAlignRight sx={{ fontSize: 15 }} />
                  </button>
                </div>
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

        <div
          className={`app-bottom${bottomHeight < BOTTOM_COMPACT ? " compact" : ""}`}
          style={
            { height: bottomHeight, "--transport-scale": transportScaleFor(bottomHeight) } as React.CSSProperties
          }
        >
          <div
            className="app-bottom-resize"
            onPointerDown={startBottomResize}
            onPointerMove={onBottomResize}
            onPointerUp={endBottomResize}
          />
          <div className="ab-title app-title">
            M<sup>3</sup>disp
            {/* version/UPDATE inline beside the logo; CSS shows it when the bar is
                compact and on phones, where the .ab-version row is hidden */}
            <span className="ab-title-inline">
              <span className="ab-title-ver">{packageJson.version}</span>
              {updateButton}
            </span>
          </div>
          <div className="ab-transport">
            <TransportButtons />
          </div>
          <div className="ab-actions header-actions">
            <VolumeControl />
            <OptionMenu />
          </div>
          {bottomHeight >= BOTTOM_COMPACT && (
            <span className="ab-version">
              <a href="https://github.com/digital-sound-antiques/m3disp" target="github">
                <img src={ghlogo} width={14} height={14} alt="github" />
              </a>
              <span>{packageJson.version}</span>
              {updateButton}
            </span>
          )}
          <span className="ab-latency">
            Output Latency: {(context.player.outputLatency * 1000).toFixed(1)}ms
          </span>
        </div>
      </div>
    </FileDropContext>
  );
}
