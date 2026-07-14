import { Palette, Theme, createTheme } from "@mui/material";
import { teal } from "@mui/material/colors";
import { PropsWithChildren, createContext, useEffect, useState } from "react";
import AppGlobal from "./AppGlobal";
import { defaultChannelColors, type PianoRollColorMode } from "../widgets/piano-roll-painter";

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
export type PianoRollMode = "2d" | "3d";
export type PianoRollColorModeMap = {
  opll: PianoRollColorMode;
  psg: PianoRollColorMode;
  scc: PianoRollColorMode;
};

// How the flat pianoRollChannelColors[] array maps onto each device, matching
// the channelIds[] layout in piano-roll-painter.ts. Used to persist channel
// colors grouped by device (e.g. {"opll":[...], "psg":[...], "scc":[...]}).
const channelColorGroups: { device: keyof PianoRollColorModeMap; base: number; count: number }[] = [
  { device: "opll", base: 0, count: 14 },
  { device: "psg", base: 14, count: 6 },
  { device: "scc", base: 20, count: 5 },
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
  pianoRollRangeInSec: number;
  pianoRollLayered: boolean;
  pianoRollMode: string;
  pianoRollShowParticles: boolean;
  pianoRollShowKeyboard: boolean;
  pianoRollColorMode: PianoRollColorModeMap;
  pianoRollChannelColors: string[];
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
  setPianoRollRangeInSec: (value: number) => void;
  setPianoRollLayered: (value: boolean) => void;
  setPianoRollMode: (value: PianoRollMode) => void;
  setPianoRollShowParticles: (value: boolean) => void;
  setPianoRollShowKeyboard: (value: boolean) => void;
  setPianoRollColorMode: (value: PianoRollColorModeMap) => void;
  setPianoRollChannelColors: (value: string[]) => void;
  resetAllSettings: () => void;
};

const noop = () => {
  console.log(`no-op`);
};

const defaultContextData: AppContextData = {
  theme: defaultTheme,
  keyHighlightColorType: "primary",
  seekSliderColorType: "primary",
  pianoRollRangeInSec: 4.0,
  pianoRollLayered: false,
  pianoRollMode: "2d",
  pianoRollShowParticles: false,
  pianoRollShowKeyboard: false,
  pianoRollColorMode: { opll: "voice", psg: "voice", scc: "voice" },
  pianoRollChannelColors: [...defaultChannelColors],
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
  setPianoRollRangeInSec: noop,
  setPianoRollLayered: noop,
  setPianoRollMode: noop,
  setPianoRollShowParticles: noop,
  setPianoRollShowKeyboard: noop,
  setPianoRollColorMode: noop,
  setPianoRollChannelColors: noop,
  resetAllSettings: noop,
};

export const AppContext = createContext(defaultContextData);

const keyPrimaryColor = "m3disp.palette.primary.main";
const keySecondaryColor = "m3disp.palette.secondary.main";
const keyKeyHighlightColorType = "m3disp.keyHighlightColorType";
const keySeekSliderColorType = "m3disp.seekSliderColorType";
const keyPianoRollRangeInSec = "m3disp.pianoRoll.rangeInSec";
const keyPianoRollLayered = "m3disp.pianoRoll.layered";
const keyPianoRollShowParticles = "m3disp.pianoRoll.showParticles";
const keyPianoRollShowKeyboard = "m3disp.pianoRoll.showKeyboard";
const keyPianoRollMode = "m3disp.pianoRoll.mode";
const keyPianoRollColorMode = "m3disp.pianoRoll.colorMode";
const keyPianoRollChannelColors = "m3disp.pianoRoll.channelColors";

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

  const setPianoRollMode = (value: string, save: boolean = true) => {
    setState((oldState) => {
      return { ...oldState, pianoRollMode: value };
    });
    if (save) {
      localStorage.setItem(keyPianoRollMode, value);
    }
  };

  const setPianoRollShowParticles = (value: boolean, save: boolean = true) => {
    setState((oldState) => ({ ...oldState, pianoRollShowParticles: value }));
    if (save) {
      localStorage.setItem(keyPianoRollShowParticles, value.toString());
    }
  };

  const setPianoRollShowKeyboard = (value: boolean, save: boolean = true) => {
    setState((oldState) => ({ ...oldState, pianoRollShowKeyboard: value }));
    if (save) {
      localStorage.setItem(keyPianoRollShowKeyboard, value.toString());
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

  // Restore every app-level setting to its factory default (and persist it).
  const resetAllSettings = () => {
    setPrimaryColor(defaultTheme.palette.primary.main);
    setSecondaryColor(defaultTheme.palette.secondary.main);
    setKeyHighlightColorType("primary");
    setSeekSliderColorType("primary");
    setPianoRollRangeInSec(4.0);
    setPianoRollLayered(false);
    setPianoRollMode("2d");
    setPianoRollShowParticles(false);
    setPianoRollShowKeyboard(false);
    setPianoRollColorMode({ opll: "voice", psg: "voice", scc: "voice" });
    setPianoRollChannelColors([...defaultChannelColors]);
    // Let the layout (channel/playlist collapse, widths, section order, view
    // tab) reset itself; those states live in <Layout> and the section store.
    window.dispatchEvent(new Event("m3disp:reset-layout"));
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

    let str = localStorage.getItem(keyPianoRollRangeInSec);
    if (str != null) {
      setPianoRollRangeInSec(parseFloat(str), false);
    }
    str = localStorage.getItem(keyPianoRollLayered);
    if (str != null) {
      setPianoRollLayered(str == "true", false);
    }
    str = localStorage.getItem(keyPianoRollShowParticles);
    if (str != null) {
      setPianoRollShowParticles(str == "true", false);
    }
    str = localStorage.getItem(keyPianoRollShowKeyboard);
    if (str != null) {
      setPianoRollShowKeyboard(str == "true", false);
    }
    str = localStorage.getItem(keyPianoRollMode);
    if (str != null) {
      setPianoRollMode(str, false);
    }

    const colorModeStr = localStorage.getItem(keyPianoRollColorMode);
    if (colorModeStr != null) {
      try {
        const m = JSON.parse(colorModeStr);
        const pick = (v: unknown): PianoRollColorMode => (v === "channel" ? "channel" : "voice");
        setPianoRollColorMode({ opll: pick(m?.opll), psg: pick(m?.psg), scc: pick(m?.scc) }, false);
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
        setPianoRollRangeInSec,
        setPianoRollLayered,
        setPianoRollMode,
        setPianoRollShowParticles,
        setPianoRollShowKeyboard,
        setPianoRollColorMode,
        setPianoRollChannelColors,
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
