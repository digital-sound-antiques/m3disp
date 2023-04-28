import { KSS } from "libkss-js";
import { MGSC, TextDecoderEncoding, detectEncoding } from "mgsc-js";
import React, { useContext, useEffect, useRef, useState } from "react";
import { AudioPlayerState } from "webaudio-stream-player";
import { KSSChannelMask } from "../kss/kss-device";
import { KSSPlayer } from "../kss/kss-player";
import { BinaryDataStorage } from "../utils/binary-data-storage";
import { isIOS, isSafari } from "../utils/platform-detect";
import { unmuteAudio } from "../utils/unmute";
import { AppProgressContext } from "./AppProgressContext";
import { parseM3U } from "../utils/m3u-parser";
import { compileIfRequired, loadFileAsText, loadUrls } from "../utils/load-urls";
import AppGlobal from "./AppGlobal";

export type PlayListEntry = {
  title?: string | null;
  filename: string;
  dataId: string; // sha1 for data
  duration?: number | null; // in ms
  fadeDuration?: number | null; // in ms
  song?: number | null; // sub song number
};

export type RepeatMode = "none" | "all" | "single";

export interface PlayerContextData {
  audioContext: AudioContext;
  gainNode: GainNode;
  storage: BinaryDataStorage;
  masterGain: number;
  player: KSSPlayer;
  repeatMode: RepeatMode;
  selectedIndex: number | null;
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

const createDefaultContextData = () => {
  const noop = (...args: any) => {
    throw new Error("Operation not attached");
  };
  const audioContext = new AudioContext({ sampleRate: 44100, latencyHint: "interactive" });
  const model: PlayerContextData = {
    audioContext: audioContext,
    gainNode: new GainNode(audioContext),
    storage: new BinaryDataStorage(),
    player: new KSSPlayer("worklet"),
    repeatMode: "none",
    selectedIndex: null,
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
    const json = data != null ? JSON.parse(data) : {};
    const pls = localStorage.getItem("m3disp.entries");
    const entries = pls != null ? JSON.parse(pls) : [];
    model.entries = entries;
    model.masterGain = json.masterGain ?? model.masterGain;
    model.gainNode.gain.value = model.masterGain;
    model.repeatMode = json.repeatMode ?? model.repeatMode;
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
  const stateRef = useRef(state);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    state.player.addEventListener("statechange", onPlayerStateChange);
    initialize();
    return () => {
      state.player.removeEventListener("statechange", onPlayerStateChange);
    };
  }, []);

  useEffect(() => {
    stateRef.current = state;
  });

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
          const [newEntry] = await loadUrls([openUrl], state.storage);
          if (newEntry != null) {
            setState((oldState) => {
              const newEntries = [...oldState.entries];
              if (newEntry?.dataId != newEntries[0]?.dataId) {
                newEntries.unshift(newEntry);
              }
              return {
                ...oldState,
                entries: newEntries,
              };
            });
          }
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
    if (entries.length == 0) {
      setState((oldState) => ({
        ...oldState,
        entries,
        selectedIndex: null,
      }));
    } else {
      setState((oldState) => ({
        ...oldState,
        entries,
        selectedIndex: selectedIndex ?? oldState.selectedIndex,
      }));
    }

    if (playIndex != null && playIndex < entries.length) {
      await play(entries[playIndex]);
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
      switch (stateRef.current.repeatMode) {
        case "single":
          play();
          break;
        case "all":
          next(true);
          break;
        default:
          next(false);
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

  const createPlayListEntry = async (
    data: Uint8Array,
    filename: string
  ): Promise<PlayListEntry> => {
    const kss = new KSS(data, filename);
    let title = kss.getTitle();
    if (title == "") title = filename;
    kss.release();
    const dataId = await state.storage.put(data);
    return {
      title,
      filename,
      dataId,
    };
  };

  const registerFile = async (file: Blob): Promise<{ title: string; dataId: string }> => {
    const data = await loadFromFile(file);
    if (data instanceof Uint8Array) {
      const kss = new KSS(data, file.name);
      const title = kss.getTitle();
      kss.release();
      const dataId = await state.storage.put(data);
      return { title, dataId };
    }
    throw new Error(`Can't load ${file.name}`);
  };

  const getFilename = (path: string): string => {
    return path.split(/[/\\]/).pop()!;
  };

  const getBasename = (path: string) => {
    const filename = path.split(/[/\\]/).pop();
    const fragments = filename!.split(".");
    fragments.pop();
    return fragments.join(".");
  };

  const loadEntriesFromM3U = async (m3u: File, files: FileList): Promise<PlayListEntry[]> => {
    const text = await loadFileAsText(m3u);
    if (typeof text !== "string") {
      throw new Error("Not a text file");
    }
    const items = parseM3U(text);
    const dataIds = items.map((e) => e.dataId);
    const dataMap: {
      [key: string]: {
        dataId: string;
        title: string;
      };
    } = {};

    const processed = new Set<string>();

    for (const id of dataIds) {
      if (id.startsWith("ref://")) {
        if (processed.has(id)) continue;
        const refName = id.substring(6).toLowerCase();
        const refBasename = getBasename(refName);
        for (const file of files) {
          const name = getFilename(file.name).toLowerCase();
          if (refName == name || refBasename + ".kss" == name) {
            try {
            dataMap[id] = await registerFile(file);
            processed.add(id);
            } catch (e) {
              console.error(`Can't load: ${file.name}`);
            }
          }
        }
      }
    }

    const res: PlayListEntry[] = [];
    for (const item of items) {
      const { title, dataId } = dataMap[item.dataId] ?? {};
      if (dataId != null) {
        res.push({ ...item, title: item.title ?? title, dataId });
      }
    }
    return res;
  };

  const progressContext = useContext(AppProgressContext);

  const loadEntriesFromFileList = async (files: FileList): Promise<PlayListEntry[]> => {
    const { setProgress } = progressContext;
    const res: PlayListEntry[] = [];
    setProgress(0.0);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const data = await loadFromFile(file);
        if (data instanceof Uint8Array) {
          const filename = file.name.split(/[/\\]/).pop() ?? "Unknown";
          const entry = await createPlayListEntry(data, filename);
          res.push(entry);
        }
      } catch (e) {
        console.warn(e);
      }
      if (i % 10 == 0) {
        setProgress(i / files.length);
      }
    }
    setProgress(null);
    return res;
  };

  const loadFiles = async (
    files: FileList,
    insertionIndex: number,
    options: { play?: boolean; clear?: boolean } = {}
  ) => {
    let m3u = false;
    for (let i = 0; i < files.length; i++) {
      if (/\.(pls|m3u)$/i.test(files[i].name)) {
        m3u = true;
      }
    }

    let incomingEntries: PlayListEntry[] = [];
    if (m3u) {
      for (let i = 0; i < files.length; i++) {
        if (/\.(pls|m3u)$/i.test(files[i].name)) {
          incomingEntries = [...incomingEntries, ...(await loadEntriesFromM3U(files[i], files))];
        }
      }
    } else {
      incomingEntries = await loadEntriesFromFileList(files);
    }

    const state = stateRef.current!;

    let newEntries;
    let newSelectedIndex;
    let playIndex;

    if (options.clear) {
      newEntries = incomingEntries;
      newSelectedIndex = incomingEntries.length > 0 ? 0 : null;
      playIndex = newSelectedIndex;
    } else {
      newEntries = [...state.entries];
      newEntries.splice(insertionIndex, 0, ...incomingEntries);
      newSelectedIndex =
        state.selectedIndex != null && insertionIndex <= state.selectedIndex
          ? state.selectedIndex + incomingEntries.length
          : state.selectedIndex;
      playIndex = options.play ? insertionIndex : null;
    }
    setEntries(newEntries, newSelectedIndex, playIndex);
  };

  const play = async (indexOrEntry?: number | PlayListEntry | null) => {
    const state = stateRef.current!;
    unmuteAudio();

    if (state.audioContext.state != "running") {
      await state.audioContext.resume();
    }

    let entry: PlayListEntry;

    if (typeof indexOrEntry === "number") {
      setSelectedIndex(indexOrEntry);
      entry = state.entries[indexOrEntry ?? state.selectedIndex];
    } else if (typeof indexOrEntry === "object") {
      entry = indexOrEntry as PlayListEntry;
    } else if (state.entries.length > 0) {
      const index = state.selectedIndex ?? 0;
      setSelectedIndex(index);
      entry = state.entries[index];
    } else {
      return;
    }

    const data = await state.storage.get(entry.dataId);
    const { song, duration, fadeDuration } = entry;
    await state.player.play({ data, song, channelMask: state.channelMask, duration, fadeDuration });

    setState((oldState) => ({ ...oldState, isPlaying: true }));
  };

  const pause = async () => {
    await state.player.pause();
    setPlaying(state.player.state == "playing");
  };

  const resume = async () => {
    await state.player.resume();
    setPlaying(state.player.state == "playing");
  };

  const next = async (loop: boolean = false) => {
    const state = stateRef.current!;
    if (state.selectedIndex != null && state.entries.length > 0) {
      if (loop) {
        await play((state.selectedIndex + 1) % state.entries.length);
      } else if (state.selectedIndex < state.entries.length - 1) {
        await play(state.selectedIndex + 1);
      }
    }
  };

  const prev = async (loop: boolean = false) => {
    const state = stateRef.current!;
    if (state.selectedIndex != null && state.entries.length > 0) {
      if (loop) {
        await play((state.selectedIndex + state.entries.length - 1) % state.entries.length);
      } else if (state.selectedIndex > 0) {
        await play(state.selectedIndex - 1);
      }
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

async function loadFromFile(blob: Blob): Promise<Uint8Array | string> {
  return new Promise<Uint8Array | string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      try {
        const u8 = new Uint8Array(reader.result as ArrayBuffer);
        resolve(compileIfRequired(u8));
      } catch (e) {
        reject(e);
      }
    };
    reader.readAsArrayBuffer(blob);
  });
}
