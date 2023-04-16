import React from "react";
import { KSSPlayer } from "./kss/kss-player";
import { MGSC, detectEncoding } from "mgsc-js";
import { AudioPlayerState } from "webaudio-stream-player";
import { KSS, KSSPlay } from "libkss-js";

export type PlayListEntry = {
  name: string;
  url: string;
};

export type RepeatMode = "all" | "single";

export interface PlayerContextData {
  audioContext: AudioContext;
  gainNode: GainNode;
  masterGain: number;
  player: KSSPlayer;
  repeatMode: RepeatMode;
  selectedIndex: number;
  entries: PlayListEntry[];
  isPlaying: boolean;
  setMasterGain(value: number): void;
  setRepeatMode(mode: RepeatMode): Promise<void> | void;
  setSelectedIndex(index: number): Promise<void> | void;
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

const createDefaultContextData = () => {
  const noop = (...args: any) => {
    throw new Error("Operation ndt attached");
  };
  const audioContext = new AudioContext({sampleRate: 44100});
  const model: PlayerContextData = {
    audioContext: audioContext,
    gainNode: new GainNode(audioContext),
    player: new KSSPlayer("worklet"),
    repeatMode: "all",
    selectedIndex: 0,
    entries: [],
    isPlaying: false,
    masterGain: 2.0,
    setMasterGain: noop,
    setRepeatMode: noop,
    setSelectedIndex: noop,
    setEntries: noop,
    setPlaying: noop,
    reorderEntry: noop,
    loadFiles: noop,
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
  return model;
};

const defaultContextData: PlayerContextData = createDefaultContextData();

export const PlayerContext = React.createContext(defaultContextData);

export class PlayerContextProvider extends React.Component<React.PropsWithChildren> {
  constructor(props: React.PropsWithChildren) {
    super(props);
  }

  state = defaultContextData;

  componentDidMount(): void {
    this.state.player.addEventListener("statechange", this.onPlayerStateChange);
  }

  componentWillUnmount(): void {
    this.state.player.removeEventListener("statechange", this.onPlayerStateChange);
  }

  setMasterGain = (value: number) => {
    this.state.gainNode.gain.value = value;
    this.setState({ ...this.state, masterGain: value });
  };

  setPlaying = (value: boolean) => {
    if (this.state.isPlaying != value) {
      this.setState({ ...this.state, isPlaying: value });
    }
  };

  setSelectedIndex = (value: number) => {
    if (this.state.selectedIndex != value) {
      this.setState({ ...this.state, selectedIndex: value });
    }
  };

  setEntries = async (
    entries: PlayListEntry[],
    selectedIndex?: number | null,
    playIndex?: number | null
  ) => {
    await new Promise<void>((resolve) => {
      this.setState({ ...this.state, entries, selectedIndex }, () => resolve());
    });
    if (playIndex != null) {
      await this.play(playIndex);
    }
  };

  setRepeatMode = (value: RepeatMode) => {
    if (this.state.repeatMode != value) {
      this.setState({ ...this.state, repeatMode: value });
    }
  };

  onPlayerStateChange = (ev: CustomEvent<AudioPlayerState>) => {
    if (ev.detail == "stopped") {
      this.setPlaying(false);
      switch (this.state.repeatMode) {
        case "single":
          this.play();
          break;
        case "all":
          if (this.state.entries.length >= 1) {
            const nextIndex = (this.state.selectedIndex + 1) % this.state.entries.length;
            this.play(nextIndex);
          }
          break;
      }
    }
  };

  reorderEntry = (srcIndex: number, dstIndex: number) => {
    const newEntries = Array.from(this.state.entries);
    const [removed] = newEntries.splice(srcIndex, 1);
    newEntries.splice(dstIndex, 0, removed);

    if (this.state.selectedIndex == srcIndex) {
      this.setState({ ...this.state, entries: newEntries, selectedIndex: dstIndex });
    } else {
      this.setState({ ...this.state, entries: newEntries });
    }
  };

  loadFiles = async (
    files: FileList,
    insertionIndex: number,
    options: { play?: boolean; clear?: boolean } = {}
  ) => {
    await KSSPlay.initialize();
    const incomingEntries: PlayListEntry[] = [];

    for (const file of files) {
      try {
        const u8 = await loadFromFile(file);
        const base64EncodedData = btoa(String.fromCharCode.apply(null, u8 as any));
        const mimeType = "application/octet-binary";
        const dataURI = `data:${mimeType};base64,${base64EncodedData}`;
        const kss = new KSS(u8, '');
        let name = kss.getTitle();
        if (name == '') name = 'No Title';
        kss.release();
        incomingEntries.push({ name, url: dataURI });
      } catch (e) {
        console.warn(e);
      }
    }

    let newEntries;
    let newSelectedIndex;
    let playIndex;

    if (options.clear) {
      newEntries = incomingEntries;
      newSelectedIndex = 0;
      playIndex = 0;
    } else {
      newEntries = [...this.state.entries];
      newEntries.splice(insertionIndex, 0, ...incomingEntries);
      newSelectedIndex =
        insertionIndex <= this.state.selectedIndex
          ? this.state.selectedIndex + incomingEntries.length
          : this.state.selectedIndex;
      playIndex = options.play ? insertionIndex : null;
    }
    this.setEntries(newEntries, newSelectedIndex, playIndex);
  };

  play = async (index?: number | null) => {
    if (index != null) {
      this.setSelectedIndex(index);
    }
    const url = this.state.entries[index ?? this.state.selectedIndex]?.url;
    if (url == null) {
      return;
    }
    this.state.audioContext.resume();
    const res = await fetch(url);
    const data = await res.arrayBuffer();
    await this.state.player.play({ data });
    this.setState({
      ...this.state,
      isPlaying: true,
    });
  };

  pause = async () => {
    await this.state.player.pause();
    this.setPlaying(this.state.player.state == "playing");
  };

  resume = async () => {
    await this.state.player.resume();
    this.setPlaying(this.state.player.state == "playing");
  };

  next = async () => {
    if (this.state.selectedIndex < this.state.entries.length - 1) {
      await this.play(this.state.selectedIndex + 1);
    }
  };

  prev = async () => {
    if (this.state.selectedIndex > 0) {
      await this.play(this.state.selectedIndex - 1);
    }
  };

  stop = async () => {
    await this.state.player.abort();
  };

  render() {
    return (
      <PlayerContext.Provider
        value={{
          ...this.state,
          setMasterGain: this.setMasterGain,
          setSelectedIndex: this.setSelectedIndex,
          setPlaying: this.setPlaying,
          setRepeatMode: this.setRepeatMode,
          setEntries: this.setEntries,
          reorderEntry: this.reorderEntry,
          loadFiles: this.loadFiles,
          play: this.play,
          pause: this.pause,
          resume: this.resume,
          next: this.next,
          prev: this.prev,
          stop: this.stop,
        }}
      >
        {this.props.children}
      </PlayerContext.Provider>
    );
  }
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
