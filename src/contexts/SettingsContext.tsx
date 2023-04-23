import { PropsWithChildren, createContext, useContext, useState } from "react";
import { KSSChannelMask } from "../kss/kss-device";
import { PlayerContext } from "./PlayerContext";

export type SettingsContextData = {
  channelMask: KSSChannelMask;
  setChannelMask: (channelMask: KSSChannelMask) => void;
  commit: () => void;
  revert: () => void;
};

const noop = () => {
  console.log(`no-op`);
};

const defaultContextData: SettingsContextData = {
  channelMask: { psg: 0, scc: 0, opll: 0, opl: 0 },
  setChannelMask: noop,
  commit: noop,
  revert: noop,
};

export const SettingsContext = createContext(defaultContextData);

export function SettingsContextProvider(props: PropsWithChildren) {
  const context = useContext(PlayerContext);

  const setChannelMask = (channelMask: KSSChannelMask) => {
    setState((oldState) => {
      return { ...oldState, channelMask };
    });
  };

  const commit = () => {
    context.setChannelMask(state.channelMask);
  };

  const revert = () => {
    setState((oldState) => ({ ...oldState, channelMask: { ...context.channelMask } }));
  };

  const [state, setState] = useState({
    ...defaultContextData,
    channelMask: { ...context.channelMask },
  });

  return (
    <SettingsContext.Provider
      value={{
        ...state,
        setChannelMask,
        commit,
        revert,
      }}
    >
      {props.children}
    </SettingsContext.Provider>
  );
}
