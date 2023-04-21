import { Theme, createTheme } from "@mui/material";
import { pink, teal } from "@mui/material/colors";
import { PropsWithChildren, createContext, useState } from "react";

const defaultTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: teal[300],
    },
    secondary: {
      main: pink['A200'],
    },
    background: {
      default: "#121212",
      paper: "#333340",
    },
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
  };

  const setSecondaryColor = (id: string) => {
    setState((oldState) => {
      const palette = Object.assign({}, oldState.theme.palette);
      palette.secondary.main = id;
      return { ...oldState, theme: { ...oldState.theme, palette } };
    });
  };

  const [state, setState] = useState(defaultContextData);

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
      {props.children}
    </AppContext.Provider>
  );
}
