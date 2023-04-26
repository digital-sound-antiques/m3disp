import { Palette, Theme, createTheme } from "@mui/material";
import { teal } from "@mui/material/colors";
import { PropsWithChildren, createContext, useEffect, useState } from "react";
import AppGlobal from "./AppGlobal";

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

type AppContextData = {
  theme: Theme;
  keyHighlightColorType: KeyHighlightColorType;
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
};

const noop = () => {
  console.log(`no-op`);
};

const defaultContextData: AppContextData = {
  theme: defaultTheme,
  keyHighlightColorType: "primary",
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
};

export const AppContext = createContext(defaultContextData);

const keyPrimaryColor = "m3disp.palette.primary.main";
const keySecondaryColor = "m3disp.palette.secondary.main";
const keyKeyHighlightColorType = "m3disp.keyHighlightColorType";

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
