import { PropsWithChildren, createContext, useContext, useState } from "react";
import { KSSChannelMask } from "../kss/kss-device";
import { PlayerContext } from "./PlayerContext";

export type SettingsContextState = {
  defaultLoopCount: number;
  defaultDuration: number;
  autoAdvanceGap: number;
  cpuSpeed: number;
  channelMask: KSSChannelMask;
  setDefaultLoopCount: (value: number) => void;
  setDefaultDuration: (value: number) => void;
  setAutoAdvanceGap: (value: number) => void;
  setCpuSpeed: (value: number) => void;
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
  autoAdvanceGap: 0,
  cpuSpeed: 0,
  channelMask: { psg: 0, scc: 0, opll: 0, opl: 0, spc: 0, nsf: 0 },
  setDefaultLoopCount: noop,
  setDefaultDuration: noop,
  setAutoAdvanceGap: noop,
  setCpuSpeed: noop,
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

  function setAutoAdvanceGap(value: number) {
    setState((oldState) => {
      return { ...oldState, autoAdvanceGap: value };
    });
  }

  function setCpuSpeed(value: number) {
    setState((oldState) => {
      return { ...oldState, cpuSpeed: value };
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
    context.reducer.setAutoAdvanceGap(state.autoAdvanceGap);
    context.reducer.setCpuSpeed(state.cpuSpeed);
    context.reducer.setChannelMask(state.channelMask);
  }

  function revert() {
    setState((oldState) => ({
      ...oldState,
      defaultLoopCount: context.defaultLoopCount,
      defaultDuration: context.defaultDuration,
      autoAdvanceGap: context.autoAdvanceGap,
      cpuSpeed: context.cpuSpeed,
      channelMask: { ...context.channelMask },
    }));
  }

  const [state, setState] = useState({
    ...defaultContextState,
    defaultLoopCount: context.defaultLoopCount,
    defaultDuration: context.defaultDuration,
    autoAdvanceGap: context.autoAdvanceGap,
    cpuSpeed: context.cpuSpeed,
    channelMask: { ...context.channelMask },
  });

  return (
    <SettingsContext.Provider
      value={{
        ...state,
        setDefaultLoopCount,
        setDefaultDuration,
        setAutoAdvanceGap,
        setCpuSpeed,
        setChannelMask,
        commit,
        revert,
      }}
    >
      {props.children}
    </SettingsContext.Provider>
  );
}
