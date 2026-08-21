import { Palette, Theme, createTheme } from "@mui/material";
import { teal } from "@mui/material/colors";
import { PropsWithChildren, createContext, useEffect, useState } from "react";
import AppGlobal from "./AppGlobal";
import { defaultChannelColors, type PianoRollColorMode, type PianoRollParticleType } from "../widgets/piano-roll-painter";
import { resetChannelVisibility } from "../views/channel-visibility";

// Keyboard overlay on the roll: "on" full keyboard, "line" just the now-line,
// "off" nothing. Cycled OFF → ON → LINE.
export type PianoRollKeyboardMode = "off" | "on" | "line";
export const keyboardModeCycle: PianoRollKeyboardMode[] = ["off", "on", "line"];

const defaultTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: teal[300],
    },
    secondary: {
      main: teal["A200"],
    },
    action: {
      selectedOpacity: 0.84,
    },
  },
  shape: {
    borderRadius: 4,
  },
  breakpoints: {
    values: {
      xs: 0,
      sm: 600,
      md: 960,
      lg: 1200,
      xl: 1536,
    },
  },
});

export type KeyHighlightColorType = "primary" | "secondary";
export type SeekSliderColorType = "primary" | "secondary";
export type ScopeType = "wave" | "roll";
// Scope WAVE render style: a single locked trace, or a receding "waterfall" of
// the last N traces (depth history kept on the display side, in WaveCell).
export type WaveStyle = "line" | "waterfall";
// per-keyboard side visualizer in the Keyboard view: nothing, an oscilloscope,
// or a mini piano roll
export type KeyboardScopeType = "none" | "wave" | "roll";
export type PianoRollMode = "2d" | "3d";
export type PianoRollColorModeMap = {
  opll: PianoRollColorMode;
  psg: PianoRollColorMode;
  scc: PianoRollColorMode;
  spc: PianoRollColorMode;
};

// How the flat pianoRollChannelColors[] array maps onto each device, matching
// the channelIds[] layout in piano-roll-painter.ts. Used to persist channel
// colors grouped by device (e.g. {"opll":[...], "psg":[...], "scc":[...]}).
const channelColorGroups: { device: keyof PianoRollColorModeMap; base: number; count: number }[] = [
  { device: "opll", base: 0, count: 14 },
  { device: "psg", base: 14, count: 6 },
  { device: "scc", base: 20, count: 5 },
  // SPC mode replaces the KSS channel list rather than extending it, so its
  // voices are indexed 0-7 there; the shared colour array keeps them after the
  // KSS block so one stored palette covers both modes.
  { device: "spc", base: 25, count: 8 },
];

function channelColorsToMap(colors: string[]): { [device: string]: string[] } {
  const map: { [device: string]: string[] } = {};
  for (const g of channelColorGroups) {
    map[g.device] = colors.slice(g.base, g.base + g.count);
  }
  return map;
}

/** Rebuild the flat color array from a stored device map, or null if malformed. */
function channelColorsFromMap(obj: unknown, fallback: string[]): string[] | null {
  if (obj == null || typeof obj !== "object") return null;
  const map = obj as { [device: string]: unknown };
  const result = fallback.slice();
  for (const g of channelColorGroups) {
    const arr = map[g.device];
    // A group added after the settings were last saved is simply absent; keep
    // its defaults rather than discarding the whole stored palette.
    if (arr === undefined) continue;
    if (!Array.isArray(arr) || arr.length !== g.count) return null;
    for (let i = 0; i < g.count; i++) {
      if (typeof arr[i] !== "string") return null;
      result[g.base + i] = arr[i];
    }
  }
  return result;
}

type AppContextData = {
  theme: Theme;
  keyHighlightColorType: KeyHighlightColorType;
  seekSliderColorType: SeekSliderColorType;
  scopeType: ScopeType;
  waveStyle: WaveStyle;
  waveColorize: boolean;
  waveWindowSize: number;
  waveYScale: number; // oscilloscope amplitude scale (1.0 .. 4.0, 0.5 steps)
  scopeColumns: number; // cells per row in the Scope grids (1..5)
  keyboardColumns: number; // keyboards per row in the Keyboard view (1..2)
  scopeFps: number; // 0 = auto (adaptive, 60fps max), else forced target fps (12..60)
  keyboardScope: KeyboardScopeType; // per-keyboard side visualizer (none/wave/roll)
  channelFontScaleLevel: number;
  playlistFontScaleLevel: number;
  pianoRollRangeInSec: number;
  pianoRollLayered: boolean;
  pianoRollPress: boolean; // sounding notes sink in, like a struck key
  pianoRollBeatLines: boolean; // faint rule on every estimated beat
  pianoRollMode: string;
  pianoRollParticleType: PianoRollParticleType;
  pianoRollKeyboard: PianoRollKeyboardMode;
  pianoRollColorMode: PianoRollColorModeMap;
  pianoRollChannelColors: string[];
  // Roll tab's own Colorize switch (independent of the Scope tab's waveColorize):
  // off = every note in the primary color.
  pianoRollColorize: boolean;
  openMap: { [key: string]: boolean };
  anchorElMap: { [key: string]: HTMLElement | null };
  isOpen: (id: string) => boolean;
  openDialog: (id: string) => void;
  closeDialog: (id: string) => void;
  openPopup: (id: string, anchorEl: HTMLElement) => void;
  closePopup: (id: string) => void;
  setPrimaryColor: (id: string) => void;
  setSecondaryColor: (id: string) => void;
  setKeyHighlightColorType: (id: KeyHighlightColorType) => void;
  setSeekSliderColorType: (id: SeekSliderColorType) => void;
  setScopeType: (v: ScopeType) => void;
  setWaveStyle: (v: WaveStyle) => void;
  setWaveColorize: (v: boolean) => void;
  setWaveWindowSize: (value: number) => void;
  setWaveYScale: (value: number) => void;
  setScopeColumns: (value: number) => void;
  setKeyboardColumns: (value: number) => void;
  setScopeFps: (value: number) => void;
  setKeyboardScope: (v: KeyboardScopeType) => void;
  setChannelFontScaleLevel: (value: number) => void;
  setPlaylistFontScaleLevel: (value: number) => void;
  setPianoRollRangeInSec: (value: number) => void;
  setPianoRollLayered: (value: boolean) => void;
  setPianoRollPress: (value: boolean) => void;
  setPianoRollBeatLines: (value: boolean) => void;
  setPianoRollMode: (value: PianoRollMode) => void;
  setPianoRollParticleType: (value: PianoRollParticleType) => void;
  setPianoRollKeyboard: (value: PianoRollKeyboardMode) => void;
  setPianoRollColorMode: (value: PianoRollColorModeMap) => void;
  setPianoRollChannelColors: (value: string[]) => void;
  setPianoRollColorize: (value: boolean) => void;
  resetAllSettings: () => void;
};

const noop = () => {
  console.log(`no-op`);
};

const defaultContextData: AppContextData = {
  theme: defaultTheme,
  keyHighlightColorType: "primary",
  seekSliderColorType: "primary",
  scopeType: "wave",
  waveStyle: "line",
  waveColorize: false,
  waveWindowSize: 256,
  waveYScale: 1.0,
  scopeColumns: 3,
  keyboardColumns: 1,
  scopeFps: 0,
  keyboardScope: "none",
  channelFontScaleLevel: 1,
  playlistFontScaleLevel: 2,
  pianoRollRangeInSec: 4.0,
  pianoRollLayered: false,
  pianoRollPress: false,
  pianoRollBeatLines: false,
  pianoRollMode: "2d",
  pianoRollParticleType: "off",
  pianoRollKeyboard: "line",
  pianoRollColorMode: { opll: "voice", psg: "voice", scc: "voice", spc: "channel" },
  pianoRollChannelColors: [...defaultChannelColors],
  pianoRollColorize: true,
  openMap: {},
  anchorElMap: {},
  isOpen: () => false,
  openDialog: noop,
  closeDialog: noop,
  openPopup: noop,
  closePopup: noop,
  setPrimaryColor: noop,
  setSecondaryColor: noop,
  setKeyHighlightColorType: noop,
  setSeekSliderColorType: noop,
  setScopeType: noop,
  setWaveStyle: noop,
  setWaveColorize: noop,
  setWaveWindowSize: noop,
  setWaveYScale: noop,
  setScopeColumns: noop,
  setKeyboardColumns: noop,
  setScopeFps: noop,
  setKeyboardScope: noop,
  setChannelFontScaleLevel: noop,
  setPlaylistFontScaleLevel: noop,
  setPianoRollRangeInSec: noop,
  setPianoRollLayered: noop,
  setPianoRollPress: noop,
  setPianoRollBeatLines: noop,
  setPianoRollMode: noop,
  setPianoRollParticleType: noop,
  setPianoRollKeyboard: noop,
  setPianoRollColorMode: noop,
  setPianoRollChannelColors: noop,
  setPianoRollColorize: noop,
  resetAllSettings: noop,
};

export const AppContext = createContext(defaultContextData);

const keyPrimaryColor = "m3disp.palette.primary.main";
const keySecondaryColor = "m3disp.palette.secondary.main";
const keyKeyHighlightColorType = "m3disp.keyHighlightColorType";
const keySeekSliderColorType = "m3disp.seekSliderColorType";
const keyScopeType = "m3disp.scopeType";
const keyWaveStyle = "m3disp.waveStyle";
const keyWaveColorize = "m3disp.waveColorize";
const keyWaveWindowSize = "m3disp.waveWindowSize";
const keyWaveYScale = "m3disp.waveYScale";
const keyScopeColumns = "m3disp.scopeColumns";
const keyKeyboardColumns = "m3disp.keyboardCols";
const keyScopeFps = "m3disp.scopeFps";
const keyKeyboardScope = "m3disp.keyboardScope";
const keyChannelFontScaleLevel = "m3disp.channelFontScaleLevel";
const keyPlaylistFontScaleLevel = "m3disp.playlistFontScaleLevel";
const keyPianoRollRangeInSec = "m3disp.pianoRoll.rangeInSec";
const keyPianoRollLayered = "m3disp.pianoRoll.layered";
const keyPianoRollPress = "m3disp.pianoRoll.press";
const keyPianoRollBeatLines = "m3disp.pianoRoll.beatLines";
const keyPianoRollShowParticles = "m3disp.pianoRoll.showParticles"; // legacy boolean, migrated
const keyPianoRollParticleType = "m3disp.pianoRoll.particleType";
const keyPianoRollShowKeyboard = "m3disp.pianoRoll.showKeyboard"; // legacy boolean, migrated
const keyPianoRollKeyboard = "m3disp.pianoRoll.keyboard";
const keyPianoRollMode = "m3disp.pianoRoll.mode";
const keyPianoRollColorMode = "m3disp.pianoRoll.colorMode";
const keyPianoRollChannelColors = "m3disp.pianoRoll.channelColors";
const keyPianoRollColorize = "m3disp.pianoRoll.colorize";

export function AppContextProvider(props: PropsWithChildren) {
  const isOpen = (id: string) => {
    return state.openMap[id] ?? false;
  };

  const openDialog = (id: string) => openPopup(id, null);

  const openPopup = (id: string, anchorEl: HTMLElement | null) => {
    setState((oldState) => {
      const anchorElMap = { ...oldState.anchorElMap };
      if (anchorEl != null) {
        anchorElMap[id] = anchorEl;
      }
      const openMap = { ...oldState.openMap };
      openMap[id] = true;
      return { ...oldState, openMap, anchorElMap };
    });
  };

  const closePopup = (id: string) => {
    setState((oldState) => {
      const openMap = { ...oldState.openMap };
      openMap[id] = false;
      return { ...oldState, openMap };
    });
  };

  const closeDialog = closePopup;

  const setPrimaryColor = (id: string, save: boolean = true) => {
    setState((oldState) => {
      const palette = Object.assign({}, oldState.theme.palette);
      palette.primary.main = id;
      return { ...oldState, theme: { ...oldState.theme, palette } };
    });
    if (save) {
      localStorage.setItem(keyPrimaryColor, id);
    }
  };

  const setSecondaryColor = (id: string, save: boolean = true) => {
    setState((oldState) => {
      const palette = Object.assign({}, oldState.theme.palette);
      palette.secondary.main = id;
      return { ...oldState, theme: { ...oldState.theme, palette } };
    });
    if (save) {
      localStorage.setItem(keySecondaryColor, id);
    }
  };

  const setKeyHighlightColorType = (type: KeyHighlightColorType, save: boolean = true) => {
    setState((oldState) => {
      return { ...oldState, keyHighlightColorType: type };
    });
    if (save) {
      localStorage.setItem(keyKeyHighlightColorType, type);
    }
  };

  const setSeekSliderColorType = (type: SeekSliderColorType, save: boolean = true) => {
    setState((oldState) => {
      return { ...oldState, seekSliderColorType: type };
    });
    if (save) {
      localStorage.setItem(keySeekSliderColorType, type);
    }
  };

  const setScopeType = (v: ScopeType, save: boolean = true) => {
    setState((oldState) => {
      return { ...oldState, scopeType: v };
    });
    if (save) {
      localStorage.setItem(keyScopeType, v);
    }
  };

  const setWaveStyle = (v: WaveStyle, save: boolean = true) => {
    setState((oldState) => {
      return { ...oldState, waveStyle: v };
    });
    if (save) {
      localStorage.setItem(keyWaveStyle, v);
    }
  };

  const setWaveColorize = (v: boolean, save: boolean = true) => {
    setState((oldState) => {
      return { ...oldState, waveColorize: v };
    });
    if (save) {
      localStorage.setItem(keyWaveColorize, v ? "1" : "0");
    }
  };

  const setWaveWindowSize = (value: number, save: boolean = true) => {
    setState((oldState) => {
      return { ...oldState, waveWindowSize: value };
    });
    if (save) {
      localStorage.setItem(keyWaveWindowSize, String(value));
    }
  };

  const setWaveYScale = (value: number, save: boolean = true) => {
    setState((oldState) => {
      return { ...oldState, waveYScale: value };
    });
    if (save) {
      localStorage.setItem(keyWaveYScale, String(value));
    }
  };

  const setScopeColumns = (value: number, save: boolean = true) => {
    setState((oldState) => {
      return { ...oldState, scopeColumns: value };
    });
    if (save) {
      localStorage.setItem(keyScopeColumns, String(value));
    }
  };

  const setKeyboardColumns = (value: number, save: boolean = true) => {
    setState((oldState) => {
      return { ...oldState, keyboardColumns: value };
    });
    if (save) {
      localStorage.setItem(keyKeyboardColumns, String(value));
    }
  };

  const setScopeFps = (value: number, save: boolean = true) => {
    setState((oldState) => {
      return { ...oldState, scopeFps: value };
    });
    if (save) {
      localStorage.setItem(keyScopeFps, String(value));
    }
  };

  const setKeyboardScope = (v: KeyboardScopeType, save: boolean = true) => {
    setState((oldState) => {
      return { ...oldState, keyboardScope: v };
    });
    if (save) {
      localStorage.setItem(keyKeyboardScope, v);
    }
  };

  const setChannelFontScaleLevel = (value: number, save: boolean = true) => {
    const level = Math.min(5, Math.max(1, Math.round(value)));
    setState((oldState) => {
      return { ...oldState, channelFontScaleLevel: level };
    });
    if (save) {
      localStorage.setItem(keyChannelFontScaleLevel, String(level));
    }
  };

  const setPlaylistFontScaleLevel = (value: number, save: boolean = true) => {
    const level = Math.min(5, Math.max(1, Math.round(value)));
    setState((oldState) => {
      return { ...oldState, playlistFontScaleLevel: level };
    });
    if (save) {
      localStorage.setItem(keyPlaylistFontScaleLevel, String(level));
    }
  };

  const setPianoRollRangeInSec = (value: number, save: boolean = true) => {
    setState((oldState) => {
      return { ...oldState, pianoRollRangeInSec: value };
    });
    if (save) {
      localStorage.setItem(keyPianoRollRangeInSec, value.toString());
    }
  };

  const setPianoRollLayered = (value: boolean, save: boolean = true) => {
    setState((oldState) => {
      return { ...oldState, pianoRollLayered: value };
    });
    if (save) {
      localStorage.setItem(keyPianoRollLayered, value.toString());
    }
  };

  const setPianoRollPress = (value: boolean, save: boolean = true) => {
    setState((oldState) => {
      return { ...oldState, pianoRollPress: value };
    });
    if (save) {
      localStorage.setItem(keyPianoRollPress, value.toString());
    }
  };

  const setPianoRollBeatLines = (value: boolean, save: boolean = true) => {
    setState((oldState) => {
      return { ...oldState, pianoRollBeatLines: value };
    });
    if (save) {
      localStorage.setItem(keyPianoRollBeatLines, value.toString());
    }
  };

  const setPianoRollMode = (value: string, save: boolean = true) => {
    setState((oldState) => {
      return { ...oldState, pianoRollMode: value };
    });
    if (save) {
      localStorage.setItem(keyPianoRollMode, value);
    }
  };

  const setPianoRollParticleType = (value: PianoRollParticleType, save: boolean = true) => {
    setState((oldState) => ({ ...oldState, pianoRollParticleType: value }));
    if (save) {
      localStorage.setItem(keyPianoRollParticleType, value);
    }
  };

  const setPianoRollKeyboard = (value: PianoRollKeyboardMode, save: boolean = true) => {
    setState((oldState) => ({ ...oldState, pianoRollKeyboard: value }));
    if (save) {
      localStorage.setItem(keyPianoRollKeyboard, value);
    }
  };

  const setPianoRollColorMode = (value: PianoRollColorModeMap, save: boolean = true) => {
    setState((oldState) => ({ ...oldState, pianoRollColorMode: value }));
    if (save) {
      localStorage.setItem(keyPianoRollColorMode, JSON.stringify(value));
    }
  };

  const setPianoRollChannelColors = (value: string[], save: boolean = true) => {
    setState((oldState) => ({ ...oldState, pianoRollChannelColors: value }));
    if (save) {
      localStorage.setItem(keyPianoRollChannelColors, JSON.stringify(channelColorsToMap(value)));
    }
  };

  const setPianoRollColorize = (value: boolean, save: boolean = true) => {
    setState((oldState) => ({ ...oldState, pianoRollColorize: value }));
    if (save) {
      localStorage.setItem(keyPianoRollColorize, value.toString());
    }
  };

  // Restore every app-level setting to its factory default (and persist it).
  const resetAllSettings = () => {
    setPrimaryColor(defaultTheme.palette.primary.main);
    setSecondaryColor(defaultTheme.palette.secondary.main);
    setKeyHighlightColorType("primary");
    setSeekSliderColorType("primary");
    setScopeType("wave");
    setWaveStyle("line");
    setWaveColorize(false);
    setWaveWindowSize(256);
    setWaveYScale(1.0);
    setScopeColumns(3);
    setKeyboardColumns(1);
    setScopeFps(0);
    setKeyboardScope("none");
    setChannelFontScaleLevel(1);
    setPlaylistFontScaleLevel(2);
    setPianoRollRangeInSec(4.0);
    setPianoRollLayered(false);
    setPianoRollPress(false);
    setPianoRollBeatLines(false);
    setPianoRollMode("2d");
    setPianoRollParticleType("off");
    setPianoRollKeyboard("line");
    setPianoRollColorMode({ opll: "voice", psg: "voice", scc: "voice", spc: "channel" });
    setPianoRollChannelColors([...defaultChannelColors]);
    setPianoRollColorize(true);
    // Let the layout (channel/playlist collapse, widths, section order, view
    // tab) reset itself; those states live in <Layout> and the section store.
    window.dispatchEvent(new Event("m3disp:reset-layout"));
    // Player-side settings (volume, surround, repeat, …) reset via a SEPARATE
    // event so the standalone "Reset Window Layout" command doesn't drag them in.
    window.dispatchEvent(new Event("m3disp:reset-player"));
    // channel visibility: everything back to visible
    resetChannelVisibility();
  };

  const [state, setState] = useState(defaultContextData);
  const [initialized, setInitialized] = useState(false);

  const initialize = async () => {
    await AppGlobal.initialize();
    setInitialized(true);
  };

  useEffect(() => {
    initialize();
    const base = state.theme.palette;
    setPrimaryColor(localStorage.getItem(keyPrimaryColor) ?? base.primary.main, false);
    setSecondaryColor(localStorage.getItem(keySecondaryColor) ?? base.secondary.main, false);
    setKeyHighlightColorType(
      (localStorage.getItem(keyKeyHighlightColorType) ??
        state.keyHighlightColorType) as KeyHighlightColorType,
      false
    );
    setSeekSliderColorType(
      (localStorage.getItem(keySeekSliderColorType) ??
        state.seekSliderColorType) as SeekSliderColorType,
      false
    );
    setScopeType(
      (localStorage.getItem(keyScopeType) ?? state.scopeType) as ScopeType,
      false
    );
    {
      const s = localStorage.getItem(keyWaveStyle);
      setWaveStyle(s === "waterfall" || s === "line" ? s : state.waveStyle, false);
    }
    {
      const v = localStorage.getItem(keyWaveColorize);
      setWaveColorize(v == null ? state.waveColorize : v === "1", false);
    }
    {
      const s = parseInt(localStorage.getItem(keyWaveWindowSize) ?? "", 10);
      setWaveWindowSize([128, 256, 512, 1024].includes(s) ? s : state.waveWindowSize, false);
    }
    {
      // snap to the slider's 0.5 grid and clamp to its 1.0..4.0 range
      const v = parseFloat(localStorage.getItem(keyWaveYScale) ?? "");
      if (Number.isFinite(v)) {
        setWaveYScale(Math.min(4, Math.max(1, Math.round(v * 2) / 2)), false);
      }
    }
    {
      const s = parseInt(localStorage.getItem(keyScopeColumns) ?? "", 10);
      setScopeColumns([1, 2, 3, 4, 5].includes(s) ? s : state.scopeColumns, false);
    }
    {
      const s = parseInt(localStorage.getItem(keyKeyboardColumns) ?? "", 10);
      setKeyboardColumns([1, 2].includes(s) ? s : state.keyboardColumns, false);
    }
    {
      const s = parseInt(localStorage.getItem(keyScopeFps) ?? "", 10);
      // a stored 120 (no longer offered) falls back to Auto
      setScopeFps([0, 12, 15, 20, 24, 30, 48, 60].includes(s) ? s : state.scopeFps, false);
    }
    {
      const v = localStorage.getItem(keyKeyboardScope);
      // migrate the old boolean ("1"/"0") to the 3-way setting
      const mapped =
        v === "wave" || v === "roll" || v === "none" ? v : v === "1" ? "wave" : "none";
      setKeyboardScope(mapped, false);
    }
    {
      const s = localStorage.getItem(keyChannelFontScaleLevel);
      if (s != null) setChannelFontScaleLevel(parseInt(s, 10), false);
    }
    {
      const s = localStorage.getItem(keyPlaylistFontScaleLevel);
      if (s != null) setPlaylistFontScaleLevel(parseInt(s, 10), false);
    }

    let str = localStorage.getItem(keyPianoRollRangeInSec);
    if (str != null) {
      setPianoRollRangeInSec(parseFloat(str), false);
    }
    str = localStorage.getItem(keyPianoRollLayered);
    if (str != null) {
      setPianoRollLayered(str == "true", false);
    }
    str = localStorage.getItem(keyPianoRollPress);
    if (str != null) {
      setPianoRollPress(str == "true", false);
    }
    str = localStorage.getItem(keyPianoRollBeatLines);
    if (str != null) {
      setPianoRollBeatLines(str == "true", false);
    }
    str = localStorage.getItem(keyPianoRollColorize);
    if (str != null) {
      setPianoRollColorize(str == "true", false);
    }
    str = localStorage.getItem(keyPianoRollParticleType);
    if (str === "off" || str === "spark" || str === "star" || str === "heart") {
      setPianoRollParticleType(str, false);
    } else if (localStorage.getItem(keyPianoRollShowParticles) === "true") {
      // migrate the old boolean setting: previous "on" becomes the spark preset
      setPianoRollParticleType("spark", false);
    }
    str = localStorage.getItem(keyPianoRollKeyboard);
    if (str === "off" || str === "on" || str === "line") {
      setPianoRollKeyboard(str, false);
    } else {
      // migrate old boolean: true → full keyboard, false → now-line only
      const old = localStorage.getItem(keyPianoRollShowKeyboard);
      if (old != null) setPianoRollKeyboard(old === "true" ? "on" : "line", false);
    }
    str = localStorage.getItem(keyPianoRollMode);
    if (str != null) {
      setPianoRollMode(str, false);
    }

    const colorModeStr = localStorage.getItem(keyPianoRollColorMode);
    if (colorModeStr != null) {
      try {
        const m = JSON.parse(colorModeStr);
        const pick = (v: unknown, fallback: PianoRollColorMode = "voice"): PianoRollColorMode =>
          v === "channel" ? "channel" : v === "voice" ? "voice" : fallback;
        setPianoRollColorMode(
          {
            opll: pick(m?.opll),
            psg: pick(m?.psg),
            scc: pick(m?.scc),
            // Absent from settings saved before SPC support; the S-DSP has no
            // voice numbers to colour by, so it defaults to "by channel".
            spc: pick(m?.spc, "channel"),
          },
          false
        );
      } catch {
        /* ignore malformed value */
      }
    }

    const chColorsStr = localStorage.getItem(keyPianoRollChannelColors);
    if (chColorsStr != null) {
      try {
        const colors = channelColorsFromMap(JSON.parse(chColorsStr), defaultChannelColors);
        if (colors != null) {
          setPianoRollChannelColors(colors, false);
        }
      } catch {
        /* ignore malformed value */
      }
    }
  }, []);

  useEffect(() => {
    setState((oldState) => ({
      ...oldState,
      theme: { ...oldState.theme, palette: updatePalette(oldState.theme.palette) },
    }));
  }, [state.theme.palette.primary.main, state.theme.palette.secondary.main]);

  return (
    <AppContext.Provider
      value={{
        ...state,
        isOpen,
        openDialog,
        openPopup,
        closePopup,
        closeDialog,
        setPrimaryColor,
        setSecondaryColor,
        setKeyHighlightColorType,
        setSeekSliderColorType,
        setScopeType,
        setWaveStyle,
        setWaveColorize,
        setWaveWindowSize,
        setWaveYScale,
        setScopeColumns,
        setKeyboardColumns,
        setScopeFps,
        setKeyboardScope,
        setChannelFontScaleLevel,
        setPlaylistFontScaleLevel,
        setPianoRollRangeInSec,
        setPianoRollLayered,
        setPianoRollPress,
        setPianoRollBeatLines,
        setPianoRollMode,
        setPianoRollParticleType,
        setPianoRollKeyboard,
        setPianoRollColorMode,
        setPianoRollChannelColors,
        setPianoRollColorize,
        resetAllSettings,
      }}
    >
      {initialized ? props.children : null}
    </AppContext.Provider>
  );
}

function updatePalette(base: Palette): Palette {
  const res = Object.assign({}, base);
  const primary = base.primary.main;
  const text = blendColor("#eeeeee", primary + "10");
  res.text.primary = text;
  res.text.secondary = text + "c0";
  res.text.disabled = text + "80";
  res.divider = text + "20";
  res.background.default = blendColor("#121212", primary + "10");
  res.background.paper = blendColor("#303030", primary + "08");
  return res;
}

function parseColor(color: string): { r: number; g: number; b: number; a: number } {
  if (color.charAt(0) == "#") {
    const pattern = /^#([0-9A-F][0-9A-F])([0-9A-F][0-9A-F])([0-9A-F][0-9A-F])([0-9A-F][0-9A-F])?/i;
    const matches = color.match(pattern);
    if (matches != null) {
      const r = parseInt(matches[1], 16);
      const g = parseInt(matches[2], 16);
      const b = parseInt(matches[3], 16);
      const a = parseInt(matches[4] ?? "FF", 16) / 255;
      return { r, g, b, a };
    }
  }
  throw new Error(`Parse Error: ${color}`);
}

function blendColor(dst: string, src: string): string {
  const d = parseColor(dst);
  const s = parseColor(src);
  const r = Math.floor(s.r * s.a + d.r * (1 - s.a));
  const g = Math.floor(s.g * s.a + d.g * (1 - s.a));
  const b = Math.floor(s.b * s.a + d.b * (1 - s.a));
  const rs = r < 16 ? "0" + r.toString(16) : r.toString(16);
  const gs = g < 16 ? "0" + g.toString(16) : g.toString(16);
  const bs = g < 16 ? "0" + b.toString(16) : b.toString(16);
  return "#" + rs + gs + bs;
}
