import { PropsWithChildren, createContext, useContext, useState } from "react";
import { KSSChannelMask } from "../kss/kss-device";
import { PlayerContext } from "./PlayerContext";

export type SettingsContextState = {
  defaultLoopCount: number;
  defaultDuration: number;
  channelMask: KSSChannelMask;
  setDefaultLoopCount: (value: number) => void;
  setDefaultDuration: (value: number) => void;
  setChannelMask: (channelMask: KSSChannelMask) => void;
  commit: () => void;
  revert: () => void;
};

const noop = () => {
  console.log(`no-op`);
};

const defaultContextState: SettingsContextState = {
  defaultLoopCount: 2,
  defaultDuration: 300 * 1000,
  channelMask: { psg: 0, scc: 0, opll: 0, opl: 0 },
  setDefaultLoopCount: noop,
  setDefaultDuration: noop,
  setChannelMask: noop,
  commit: noop,
  revert: noop,
};

export const SettingsContext = createContext(defaultContextState);

export function SettingsContextProvider(props: PropsWithChildren) {
  const context = useContext(PlayerContext);

  function setDefaultLoopCount(value: number) {
    setState((oldState) => {
      return { ...oldState, defaultLoopCount: value };
    });
  }

  function setDefaultDuration(value: number) {
    setState((oldState) => {
      return { ...oldState, defaultDuration: value };
    });
  }

  function setChannelMask(channelMask: KSSChannelMask) {
    setState((oldState) => {
      return { ...oldState, channelMask };
    });
  }

  function commit() {
    context.reducer.setDefaultLoopCount(state.defaultLoopCount);
    context.reducer.setDefaultDuration(state.defaultDuration);
    context.reducer.setChannelMask(state.channelMask);
  }

  function revert() {
    setState((oldState) => ({
      ...oldState,
      defaultLoopCount: context.defaultLoopCount,
      defaultDuration: context.defaultDuration,
      channelMask: { ...context.channelMask },
    }));
  }

  const [state, setState] = useState({
    ...defaultContextState,
    channelMask: { ...context.channelMask },
  });

  return (
    <SettingsContext.Provider
      value={{
        ...state,
        setDefaultLoopCount,
        setDefaultDuration,
        setChannelMask,
        commit,
        revert,
      }}
    >
      {props.children}
    </SettingsContext.Provider>
  );
}
