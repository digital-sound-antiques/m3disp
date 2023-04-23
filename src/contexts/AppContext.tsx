import { Theme, createTheme } from "@mui/material";
import { pink, teal } from "@mui/material/colors";
import { PropsWithChildren, createContext, useEffect, useState } from "react";
import AppGlobal from "./AppGlobal";

const defaultTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: teal[300],
    },
    secondary: {
      main: pink['A200'],
    },
    // background: {
    //   default: "#131313",
    //   paper: "#222222",
    // },
  },
  // shape: {
  //   borderRadius: 0,
  // },
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

type AppContextData = {
  theme: Theme;
  openMap: { [key: string]: boolean };
  anchorElMap: { [key: string]: HTMLElement | null };
  isOpen: (id: string) => boolean;
  openDialog: (id: string) => void;
  closeDialog: (id: string) => void;
  openPopup: (id: string, anchorEl: HTMLElement) => void;
  closePopup: (id: string) => void;
  setPrimaryColor: (id: string) => void;
  setSecondaryColor: (id: string) => void;
};

const noop = () => {
  console.log(`no-op`);
};

const defaultContextData: AppContextData = {
  theme: defaultTheme,
  openMap: {},
  anchorElMap: {},
  isOpen: () => false,
  openDialog: noop,
  closeDialog: noop,
  openPopup: noop,
  closePopup: noop,
  setPrimaryColor: noop,
  setSecondaryColor: noop,
};

export const AppContext = createContext(defaultContextData);

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

  const setPrimaryColor = (id: string) => {
    setState((oldState) => {
      const palette = Object.assign({}, oldState.theme.palette);
      palette.primary.main = id;
      return { ...oldState, theme: { ...oldState.theme, palette } };
    });
    localStorage.setItem("m3disp.palette.primary.main", id);
  };

  const setSecondaryColor = (id: string) => {
    setState((oldState) => {
      const palette = Object.assign({}, oldState.theme.palette);
      palette.secondary.main = id;
      return { ...oldState, theme: { ...oldState.theme, palette } };
    });
    localStorage.setItem("m3disp.palette.secondary.main", id);
  };

  const [state, setState] = useState(defaultContextData);
  const [initialized, setInitialized] = useState(false);

  const initialize = async () => {
    await AppGlobal.initialize();
    setInitialized(true);
  }

  useEffect(() => {
    console.log(`mount AppContextProvider`);
    initialize();
    state.theme.palette.primary.main = localStorage.getItem("m3disp.palette.primary.main") ?? teal[300];
    state.theme.palette.secondary.main = localStorage.getItem("m3disp.palette.secondary.main") ?? pink[300];
    return () => { console.log(`ummount AppContextProvider`); }
  }, []);

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
      }}
    >      
      {initialized ? props.children : null}
    </AppContext.Provider>
  );
}
