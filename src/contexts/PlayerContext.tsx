import React, { useContext, useEffect, useRef, useState } from "react";
import { AudioPlayerState } from "webaudio-stream-player";
import { KSSChannelMask } from "../kss/kss-device";
import { KSSPlayer } from "../kss/kss-player";
import { BinaryDataStorage } from "../utils/binary-data-storage";
import { loadEntriesFromFileList, loadEntriesFromUrl } from "../utils/loader";
import { isIOS, isSafari } from "../utils/platform-detect";
import { unmuteAudio } from "../utils/unmute";
import AppGlobal from "./AppGlobal";
import { PlayerContextReducer } from "./PlayerContextReducer";
import { AppProgressContext } from "./AppProgressContext";
import { KSSDecoderStartOptions } from "../kss/kss-decoder-worker";

export type PlayListEntry = {
  title?: string | null;
  filename: string;
  dataId: string; // sha1 for data
  duration?: number | null; // in ms
  fadeDuration?: number | null; // in ms
  song?: number | null; // sub song number
  loop?: number | null; // loop number
};

export type RepeatMode = "none" | "all" | "single";

export interface PlayerContextState {
  audioContext: AudioContext;
  gainNode: GainNode;
  storage: BinaryDataStorage;
  masterGain: number;
  player: KSSPlayer;
  repeatMode: RepeatMode;
  entries: PlayListEntry[];
  currentEntry: PlayListEntry | null;
  playState: "playing" | "paused" | "stopped";
  playStateChangeCount: number;
  defaultLoopCount: number;
  defaultDuration: number;
  channelMask: KSSChannelMask;
  unmute: () => Promise<void>;
}

function autoResumeAudioContext(audioContext: AudioContext) {
  if (isIOS && isSafari) {
    document.addEventListener("visibilitychange", () => {
      console.log(`visibility change / state=${audioContext.state}`);
      if ((audioContext.state as any) == "interrupted") {
        /* unawaited */ audioContext.resume();
      }
    });
  }
}

const createDefaultContextState = () => {
  const audioContext = new AudioContext({ sampleRate: 44100, latencyHint: "interactive" });
  const state: PlayerContextState = {
    audioContext: audioContext,
    gainNode: new GainNode(audioContext),
    storage: new BinaryDataStorage(),
    player: new KSSPlayer("worklet"),
    repeatMode: "none",
    entries: [],
    currentEntry: null,
    playStateChangeCount: 0,
    playState: "stopped",
    masterGain: 4.0,
    defaultLoopCount: 2,
    defaultDuration: 300 * 1000,
    channelMask: {
      psg: 0,
      opl: 0,
      opll: 0,
      scc: 0,
    },
    unmute: async () => {
      unmuteAudio();
      if (audioContext.state != "running") {
        await audioContext.resume();
      }
    },
  };

  state.gainNode.gain.value = state.masterGain;
  state.gainNode.connect(state.audioContext.destination);
  state.player.connect(state.gainNode);
  autoResumeAudioContext(state.audioContext);

  try {
    const data = localStorage.getItem("m3disp.playerContext");
    const json = data != null ? JSON.parse(data) : {};
    const pls = localStorage.getItem("m3disp.entries");
    const entries = pls != null ? JSON.parse(pls) : [];
    state.entries = entries;
    state.masterGain = json.masterGain ?? state.masterGain;
    state.gainNode.gain.value = state.masterGain;
    state.repeatMode = json.repeatMode ?? state.repeatMode;
    state.defaultLoopCount = json.defaultLoopCount ?? state.defaultLoopCount;
    state.defaultDuration = json.defaultDuration ?? state.defaultDuration;
  } catch (e) {
    console.error(e);
    localStorage.clear();
  }
  return state;
};

const defaultContextState: PlayerContextState = createDefaultContextState();

export const PlayerContext = React.createContext({
  ...defaultContextState,
  reducer: new PlayerContextReducer(() => {}),
});

function usePrevious<T>(value: T) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

async function applyPlayStateChange(
  oldState: PlayerContextState | null,
  state: PlayerContextState
) {
  const play = async (entry: PlayListEntry) => {
    const { channelMask } = state;
    const { dataId, song, duration, fadeDuration } = entry;
    const data = await state.storage.get(dataId);
    const options: KSSDecoderStartOptions = {
      channelMask,
      data,
      song,
      duration,
      fadeDuration,
      loop: state.defaultLoopCount,      
      defaultDuration: state.defaultDuration,
    };
    await state.player.play(options);
  };

  if (state.playState == "playing") {
    if (state.currentEntry != null) {
      if (oldState?.currentEntry != state.currentEntry) {
        return play(state.currentEntry);
      }
      if (state.player.state != "playing" && state.player.state != "paused") {
        return play(state.currentEntry);
      }
    } else {
      console.warn("Missing current entry.");
      return;
    }
  }

  if (state.playState == "playing" && state.player.state == "paused") {
    return state.player.resume();
  }
  if (state.playState == "paused" && state.player.state == "playing") {
    return state.player.pause();
  }
  if (state.playState == "stopped" && state.player.state != "aborted") {
    return state.player.abort();
  }
}

export function PlayerContextProvider(props: React.PropsWithChildren) {
  const [state, setState] = useState(defaultContextState);
  const oldState = usePrevious(state);
  const p = useContext(AppProgressContext);

  useEffect(() => {
    applyPlayStateChange(oldState, state);
  }, [state.playStateChangeCount]);

  useEffect(() => {
    state.gainNode.gain.value = state.masterGain;
  }, [state.masterGain]);

  const reducer = new PlayerContextReducer(setState);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    window.addEventListener("message", onWindowMessage, false);
    state.player.addEventListener("statechange", onPlayerStateChange);
    initialize();
    return () => {
      window.removeEventListener("message", onWindowMessage, false);
      state.player.removeEventListener("statechange", onPlayerStateChange);
    };
  }, []);

  useEffect(() => {
    if (initialized) {
      saveEntries(state.entries);
    }
  }, [state.entries]);

  const initialize = async () => {
    if (!initialized) {
      await state.storage.open("m3disp");
      await pruneEntries();
      setInitialized(true);

      try {
        const params = AppGlobal.getQueryParamsOnce();
        const openUrl = params.get("open");
        if (openUrl) {
          const entries = await loadEntriesFromUrl(openUrl, state.storage, p.setProgress);
          setState((oldState) => {
            return {
              ...oldState,
              entries,
            };
          });
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  const pruneEntries = async () => {
    const keys = await state.storage.getAllKeys();
    const ids = state.entries.map((e) => e.dataId);
    await state.storage.gc(ids);
    const entries = state.entries.filter((e) => keys.indexOf(e.dataId) >= 0);
    setState((oldState) => ({ ...oldState, entries }));
  };

  const save = () => {
    const { defaultLoopCount, defaultDuration, channelMask, repeatMode, masterGain } = state;
    const data = {
      version: 1,
      defaultLoopCount,
      defaultDuration,
      channelMask,
      masterGain,
      repeatMode,
    };
    localStorage.setItem("m3disp.playerContext", JSON.stringify(data));
  };

  useEffect(() => {
    save();
  }, [
    state.masterGain,
    state.defaultLoopCount,
    state.defaultDuration,
    state.channelMask,
    state.repeatMode,
  ]);

  const saveEntries = (entries: PlayListEntry[]) => {
    const data = JSON.stringify(entries);
    localStorage.setItem("m3disp.entries", data);
    if (entries.length == 0) {
      state.storage.clear();
    }
  };

  const onPlayerStateChange = (ev: CustomEvent<AudioPlayerState>) => {
    if (ev.detail == "stopped") {
      reducer.onPlayerStopped();
    }
  };

  const onWindowMessage = async (ev: MessageEvent) => {
    if (ev.data instanceof Uint8Array && ev.data.length <= 65536) {
      reducer.clearEntries();
      const file = new File([ev.data], "external.mgs");
      const entries = await loadEntriesFromFileList(state.storage, [
        new File([ev.data], file.name),
      ]);
      reducer.addEntries(entries, 0);
      reducer.resume();
      reducer.play(0);
    }
  };

  return (
    <PlayerContext.Provider
      value={{
        ...state,
        reducer,
      }}
    >
      {props.children}
    </PlayerContext.Provider>
  );
}
