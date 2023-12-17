import { PropsWithChildren, createContext, useState } from "react";

type AppProgresssContextData = {
  title: string | null;
  progress: number | null;
  setTitle: (value: string | null) => void;
  setProgress: (value: number | null) => void;
  rev: number;
};

const defaultContextData: AppProgresssContextData = {
  title: null,
  progress: null,
  setTitle: () => console.log(`setTitle noop`),
  setProgress: () => console.log(`setProgress noop`),
  rev: 0,
};

export const AppProgressContext = createContext(defaultContextData);

export function AppProgressContextProvider(props: PropsWithChildren) {
  const [state, setState] = useState(defaultContextData);

  const setTitle = (value: string | null) => {
    setState((oldState) => ({ ...oldState, title: value }));
  };

  const setProgress = (value: number | null) => {
    setState((oldState) => ({ ...oldState, progress: value, rev: oldState.rev + 1 }));
  };

  return (
    <AppProgressContext.Provider value={{ ...state, setProgress, setTitle }}>
      {props.children}
    </AppProgressContext.Provider>
  );
}
