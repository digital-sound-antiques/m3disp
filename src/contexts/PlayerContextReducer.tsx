import { KSSChannelMask } from "../kss/kss-device";
import { PlayListEntry, PlayerContextState, RepeatMode } from "./PlayerContext";

export class PlayerContextReducer {
  constructor(setState: React.Dispatch<React.SetStateAction<PlayerContextState>>) {
    this.setState = setState;
  }

  setState: React.Dispatch<React.SetStateAction<PlayerContextState>>;

  setMasterGain(value: number): void {
    this.setState((oldState) => {
      return { ...oldState, masterGain: value };
    });
  }

  setPlaying(value: boolean): void {
    this.setState((oldState) => ({ ...oldState, isPlaying: value }));
  }

  setSelectedIndex(value: number) {
    this.setState((oldState) => {
      return { ...oldState, selectedIndex: value };
    });
  }

  setRepeatMode = (value: RepeatMode) => {
    this.setState((oldState) => ({ ...oldState, repeatMode: value }));
  };

  setEntries(entries: PlayListEntry[]) {
    this.setState((oldState) => {
      return { ...oldState, entries };
    });
  }

  addEntries(entries: PlayListEntry[], insertionIndex: number) {
    this.setState((state) => {
      const newEntries = [...state.entries];
      newEntries.splice(insertionIndex, 0, ...entries);
      return { ...state, entries: newEntries };
    });
  }

  clearEntries() {
    this.setEntries([]);
  }

  removeEntry(target: PlayListEntry | number) {
    this.setState((state) => {
      let index;
      if (typeof target === "number") {
        index = target;
      } else {
        index = state.entries.findIndex((e) => e == target);
      }
      if (index >= 0) {
        const entries = [...state.entries];
        entries.splice(index, 1);
        return { ...state, entries };
      }
      return state;
    });
  }

  reorderEntry(srcIndex: number, dstIndex: number) {
    this.setState((oldState) => {
      const newEntries = Array.from(oldState.entries);
      const [removed] = newEntries.splice(srcIndex, 1);
      newEntries.splice(dstIndex, 0, removed);
      const currentIndex = oldState.entries.findIndex((e) => e == oldState.currentEntry);
      if (currentIndex == srcIndex) {
        return { ...oldState, entries: newEntries, playIndex: dstIndex };
      } else {
        return { ...oldState, entries: newEntries };
      }
    });
  }

  setDefaultLoopCount(value: number) {
    this.setState((state) => {
      return { ...state, defaultLoopCount: value };
    });
  }

  setDefaultDuration(value: number) {
    this.setState((state) => {
      return { ...state, defaultDuration: value };
    });
  }

  setChannelMask(channelMask: KSSChannelMask) {
    this.setState((state) => {
      if (
        state.channelMask.psg != channelMask.psg ||
        state.channelMask.scc != channelMask.scc ||
        state.channelMask.opll != channelMask.opll
      ) {
        return {
          ...state,
          playState: "stopped",
          playStateChangeCount: state.playStateChangeCount + 1,
          channelMask: { ...channelMask },
        };
      }
      return state;
    });
  }

  _playReducer(
    state: PlayerContextState,
    target?: PlayListEntry | number | null
  ): PlayerContextState {
    let entry;
    if (typeof target === "number") {
      entry = state.entries[target as number];
    } else {
      entry = (target as PlayListEntry) ?? state.currentEntry ?? state.entries[0];
    }

    let nextPlayState = entry != null ? "playing" : "stopped";

    return {
      ...state,
      currentEntry: entry,
      playState: nextPlayState as any,
      playStateChangeCount: state.playStateChangeCount + 1,
    };
  }

  play(target?: PlayListEntry | number | null) {
    this.setState((state) => {
      return this._playReducer(state, target);
    });
  }

  pause() {
    this.setState((state) => {
      if (state.playState == "playing") {
        return {
          ...state,
          playState: "paused",
          playStateChangeCount: state.playStateChangeCount + 1,
        };
      }
      return state;
    });
  }

  resume() {
    this.setState((state) => {
      if (state.playState == "paused") {
        return {
          ...state,
          playState: "playing",
          playStateChangeCount: state.playStateChangeCount + 1,
        };
      }
      return state;
    });
  }

  _nextReducer(state: PlayerContextState, loop: boolean = false): PlayerContextState {
    const currentIndex = state.entries.findIndex((e) => e == state.currentEntry);
    if (currentIndex != null) {
      if (loop || currentIndex < state.entries.length - 1) {
        const nextEntry = state.entries[(currentIndex + 1) % state.entries.length];
        return this._playReducer(state, nextEntry);
      }
    }
    return state;
  }

  next(loop: boolean = false) {
    this.setState((state) => this._nextReducer(state, loop));
  }

  _prevReducer(state: PlayerContextState, loop: boolean = false): PlayerContextState {
    const currentIndex = state.entries.findIndex((e) => e == state.currentEntry);
    if (currentIndex != null) {
      if (loop || currentIndex > 0) {
        const nextEntry =
          state.entries[(currentIndex + state.entries.length - 1) % state.entries.length];
        return this._playReducer(state, nextEntry);
      }
    }
    return state;
  }

  prev(loop: boolean = false) {
    this.setState((state) => this._prevReducer(state, loop));
  }

  stop() {
    this.setState((state) => ({
      ...state,
      playState: "stopped",
      playStateChangeCount: state.playStateChangeCount + 1,
    }));
  }

  onPlayerStopped() {
    this.setState((state) => {
      switch (state.repeatMode) {
        case "single":
          return this._playReducer(state);
        case "all":
          return this._nextReducer(state, true);
        default:
          return this._nextReducer(state, false);
      }
    });
  }
}
