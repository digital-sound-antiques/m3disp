import React, { useContext, useEffect, useRef, useState } from "react";
import { KSSPlayer } from "../kss/kss-player";
import { MGSC, detectEncoding } from "mgsc-js";
import { AudioPlayerState } from "webaudio-stream-player";
import { KSS, KSSPlay } from "libkss-js";
import { isIOS, isSafari } from "../utils/platform-detect";
import { unmuteAudio } from "../utils/unmute";
import { KSSChannelMask } from "../kss/kss-device";
import { BinaryDataStorage } from "../utils/binary-data-storage";
import { AppProgressContext } from "./AppProgressContext";

export type PlayListEntry = {
  title: string;
  filename: string;
  dataId: string; // sha1 for data
};

export type RepeatMode = "all" | "single";

export interface PlayerContextData {
  audioContext: AudioContext;
  gainNode: GainNode;
  storage: BinaryDataStorage;
  masterGain: number;
  player: KSSPlayer;
  repeatMode: RepeatMode;
  selectedIndex: number;
  entries: PlayListEntry[];
  isPlaying: boolean;
  channelMask: KSSChannelMask;
  setMasterGain(value: number): void;
  setRepeatMode(mode: RepeatMode): Promise<void> | void;
  setSelectedIndex(index: number): Promise<void> | void;
  setChannelMask(channelMask: KSSChannelMask): void;
  setEntries(
    entries: PlayListEntry[],
    selectedIndex?: number | null,
    playIndex?: number | null
  ): Promise<void> | void;
  setPlaying(flag: boolean): Promise<void> | void;
  reorderEntry(srcIndex: number, dstIndex: number): Promise<void> | void;
  loadFiles(
    files: FileList,
    insertionIndex: number,
    options: { play?: boolean; clear?: boolean }
  ): Promise<void> | void;
  play(index?: number | null): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  prev(): Promise<void>;
  next(): Promise<void>;
  stop(): Promise<void>;
}

const emptyProgress = {
  currentFrame: 0,
  currentTime: 0,
  bufferedFrames: 0,
  bufferedTime: 0,
  isFulFilled: false,
};

function autoResumeAudioContext(audioContext: AudioContext) {
  if (isIOS && isSafari) {
    document.addEventListener("visibilitychange", () => {
      console.debug(`${audioContext.state}`);
      if ((audioContext.state as any) == "interrupted") {
        console.debug("resume AudioContext");
        /* unawaited */ audioContext.resume();
      }
    });
  }
}

const createDefaultContextData = () => {
  const noop = (...args: any) => {
    throw new Error("Operation ndt attached");
  };
  const audioContext = new AudioContext({ sampleRate: 44100, latencyHint: "interactive" });
  const model: PlayerContextData = {
    audioContext: audioContext,
    gainNode: new GainNode(audioContext),
    storage: new BinaryDataStorage(),
    player: new KSSPlayer("worklet"),
    repeatMode: "all",
    selectedIndex: 0,
    entries: [],
    isPlaying: false,
    masterGain: 4.0,
    channelMask: {
      psg: 0,
      opl: 0,
      opll: 0,
      scc: 0,
    },
    setMasterGain: noop,
    setRepeatMode: noop,
    setSelectedIndex: noop,
    setEntries: noop,
    setPlaying: noop,
    reorderEntry: noop,
    loadFiles: noop,
    setChannelMask: noop,
    play: noop,
    pause: noop,
    resume: noop,
    prev: noop,
    next: noop,
    stop: noop,
  };
  model.gainNode.gain.value = model.masterGain;
  model.gainNode.connect(model.audioContext.destination);
  model.player.connect(model.gainNode);
  autoResumeAudioContext(model.audioContext);

  try {
    const data = localStorage.getItem("m3disp.playerContext");
    const json = data != null ? JSON.parse(data) : undefined;
    const pls = localStorage.getItem("m3disp.entries");
    const entries = pls != null ? JSON.parse(pls) : [];
    model.entries = entries;
    model.masterGain = json.masterGain;
    model.gainNode.gain.value = model.masterGain;
  } catch (e) {
    console.error(e);
    localStorage.clear();
  }
  return model;
};

const defaultContextData: PlayerContextData = createDefaultContextData();

export const PlayerContext = React.createContext(defaultContextData);

export function PlayerContextProvider(props: React.PropsWithChildren) {
  const [state, setState] = useState(defaultContextData);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    state.player.addEventListener("statechange", onPlayerStateChange);
    initialize();
    return () => {
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
      if (state.entries.length == 0) {
        const entries = await loadUrls([
          "./mgs/captain.mgs",
          "./mgs/captain2.mgs",
          "./mgs/blue_skies.mgs",
        ]);
        await setEntries(entries);
      }
      setInitialized(true);
    }
  };

  const pruneEntries = async () => {
    const keys = await state.storage.getAllKeys();
    console.log(`${keys.length} keys in indexedDB`);
    const ids = state.entries.map((e) => e.dataId);
    await state.storage.gc(ids);
    console.log(`db=${state.storage.db}`);
    const entries = state.entries.filter((e) => keys.indexOf(e.dataId) >= 0);
    console.log(`prune entries: ${state.entries.length} => ${entries.length}`);
    setState((oldState) => ({ ...oldState, entries }));
  };

  const save = () => {
    const { channelMask, repeatMode, masterGain } = state;
    const data = { version: 1, channelMask, masterGain, repeatMode };
    localStorage.setItem("m3disp.playerContext", JSON.stringify(data));
  };

  useEffect(() => {
    save();
  }, [state.masterGain, state.channelMask, state.repeatMode]);

  const saveEntries = (entries: PlayListEntry[]) => {
    const data = JSON.stringify(entries);
    localStorage.setItem("m3disp.entries", data);
    if (entries.length == 0) {
      state.storage.clear();
    }
  };

  const setMasterGain = (value: number) => {
    state.gainNode.gain.value = value;
    setState((oldState) => ({ ...oldState, masterGain: value }));
  };

  const setPlaying = (value: boolean) => {
    if (state.isPlaying != value) {
      setState((oldState) => ({ ...oldState, isPlaying: value }));
    }
  };

  const setSelectedIndex = (value: number) => {
    if (state.selectedIndex != value) {
      setState((oldState) => ({ ...oldState, selectedIndex: value }));
    }
  };

  const setEntries = async (
    entries: PlayListEntry[],
    selectedIndex?: number | null,
    playIndex?: number | null
  ) => {
    setState((oldState) => ({
      ...oldState,
      entries,
      selectedIndex: selectedIndex ?? oldState.selectedIndex,
    }));
    if (playIndex != null) {
      await play(entries[playIndex].dataId);
    }
  };

  const setRepeatMode = (value: RepeatMode) => {
    if (state.repeatMode != value) {
      setState((oldState) => ({ ...oldState, repeatMode: value }));
    }
  };

  const onPlayerStateChange = (ev: CustomEvent<AudioPlayerState>) => {
    if (ev.detail == "stopped") {
      setPlaying(false);
      switch (state.repeatMode) {
        case "single":
          play();
          break;
        case "all":
          if (state.entries.length >= 1) {
            const nextIndex = (state.selectedIndex + 1) % state.entries.length;
            play(nextIndex);
          }
          break;
      }
    }
  };

  const reorderEntry = (srcIndex: number, dstIndex: number) => {
    const newEntries = Array.from(state.entries);
    const [removed] = newEntries.splice(srcIndex, 1);
    newEntries.splice(dstIndex, 0, removed);

    if (state.selectedIndex == srcIndex) {
      setEntries(newEntries, dstIndex);
    } else {
      setEntries(newEntries);
    }
  };

  const setChannelMask = async (channelMask: KSSChannelMask) => {
    if (
      state.channelMask.psg != channelMask.psg ||
      state.channelMask.scc != channelMask.scc ||
      state.channelMask.opll != channelMask.opll
    ) {
      await stop();
      setState((oldState: PlayerContextData) => ({ ...oldState, channelMask: { ...channelMask } }));
    }
  };

  const loadUrls = async (urls: string[]): Promise<PlayListEntry[]> => {
    const entries: PlayListEntry[] = [];
    for (const url of urls) {
      try {
        const res = await fetch(url);
        const filename = url.split(/[/\\]/).pop() ?? "Unknown";
        const data = new Uint8Array(await res.arrayBuffer());
        const entry = await createPlayListEntry(data, filename);
        entries.push(entry);
      } catch (e) {
        console.warn(e);
      }
    }
    return entries;
  };

  const createPlayListEntry = async (
    data: Uint8Array,
    filename: string
  ): Promise<PlayListEntry> => {
    const kss = new KSS(data, filename);
    let title = kss.getTitle();
    if (title == "") title = filename;
    kss.release();
    let start = Date.now();
    const dataId = await state.storage.put(data);
    console.log(`put: ${Date.now() - start}ms`);
    return {
      title,
      filename,
      dataId,
    };
  };

  const progressContext = useContext(AppProgressContext);

  const loadFiles = async (
    files: FileList,
    insertionIndex: number,
    options: { play?: boolean; clear?: boolean } = {}
  ) => {
    const incomingEntries: PlayListEntry[] = [];
    const { setProgress } = progressContext;
    setProgress(0.0);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const data = await loadFromFile(file);
        const filename = file.name.split(/[/\\]/).pop() ?? "Unknown";
        const entry = await createPlayListEntry(data, filename);
        incomingEntries.push(entry);
      } catch (e) {
        console.warn(e);
      }
      if (i % 10 == 0) {
        setProgress(i / files.length);
      }
    }
    setProgress(null);

    let newEntries;
    let newSelectedIndex;
    let playIndex;

    if (options.clear) {
      newEntries = incomingEntries;
      newSelectedIndex = 0;
      playIndex = 0;
    } else {
      newEntries = [...state.entries];
      newEntries.splice(insertionIndex, 0, ...incomingEntries);
      newSelectedIndex =
        insertionIndex <= state.selectedIndex
          ? state.selectedIndex + incomingEntries.length
          : state.selectedIndex;
      playIndex = options.play ? insertionIndex : null;
    }
    setEntries(newEntries, newSelectedIndex, playIndex);
  };

  const play = async (indexOrDataId?: number | string | null) => {
    unmuteAudio();

    if (state.audioContext.state != "running") {
      await state.audioContext.resume();
    }

    let dataId;
    if (typeof indexOrDataId === "number") {
      setSelectedIndex(indexOrDataId);
      dataId = state.entries[indexOrDataId ?? state.selectedIndex]?.dataId;
    } else if (typeof indexOrDataId === "string") {
      dataId = indexOrDataId;
    } else {
      return;
    }

    const data = await state.storage.get(dataId);
    await state.player.play({ data, channelMask: state.channelMask });

    setState((oldState) => ({ ...oldState, isPlaying: true }));
  };

  const pause = async () => {
    await state.player.pause();
    setPlaying(state.player.state == "playing");
  };

  const resume = async () => {
    state.player.resume();
    setPlaying(state.player.state == "playing");
  };

  const next = async () => {
    if (state.selectedIndex < state.entries.length - 1) {
      await play(state.selectedIndex + 1);
    }
  };

  const prev = async () => {
    if (state.selectedIndex > 0) {
      await play(state.selectedIndex - 1);
    }
  };

  const stop = async () => {
    await state.player.abort();
    setState((oldState) => ({ ...oldState, isPlaying: false }));
  };

  return (
    <PlayerContext.Provider
      value={{
        ...state,
        setMasterGain: setMasterGain,
        setSelectedIndex: setSelectedIndex,
        setPlaying: setPlaying,
        setRepeatMode: setRepeatMode,
        setEntries: setEntries,
        reorderEntry: reorderEntry,
        setChannelMask: setChannelMask,
        loadFiles: loadFiles,
        play: play,
        pause: pause,
        resume: resume,
        next: next,
        prev: prev,
        stop: stop,
      }}
    >
      {props.children}
    </PlayerContext.Provider>
  );
}

async function loadFromFile(blob: Blob): Promise<Uint8Array> {
  await MGSC.initialize();

  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      try {
        const u8 = new Uint8Array(reader.result as ArrayBuffer);

        let encoding = detectEncoding(u8);
        if (encoding == "ascii") {
          encoding = "utf-8";
        }
        if (encoding == "shift-jis" || encoding == "utf-8") {
          const text = new TextDecoder(encoding).decode(u8);
          if (text.indexOf("#opll_mode") >= 0) {
            const { mgs } = MGSC.compile(text);
            resolve(mgs);
            return;
          }
        }
        resolve(u8);
      } catch (e) {
        reject(e);
      }
    };
    reader.readAsArrayBuffer(blob);
  });
}
