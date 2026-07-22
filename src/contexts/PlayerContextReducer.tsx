import { KSSChannelMask } from "../kss/kss-device";
import { SurroundMode } from "../utils/surround";
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

  setSurroundMode(value: SurroundMode): void {
    this.setState((oldState) => {
      return { ...oldState, surroundMode: value };
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

  setAutoAdvanceGap(value: number) {
    this.setState((state) => {
      return { ...state, autoAdvanceGap: value };
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

  /** Update the channel mask in state only, WITHOUT restarting playback. The
   *  caller pushes the mask to the running decoder via player.setChannelMask(). */
  setChannelMaskLive(channelMask: KSSChannelMask) {
    this.setState((state) => ({ ...state, channelMask: { ...channelMask } }));
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
    if (currentIndex >= 0) {
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
    if (currentIndex >= 0) {
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
      let next: PlayerContextState;
      switch (state.repeatMode) {
        case "single":
          next = this._playReducer(state);
          break;
        case "all":
          next = this._nextReducer(state, true);
          break;
        default:
          next = this._nextReducer(state, false);
      }
      if (next != state) {
        return next;
      }
      // No track to advance to (end of playlist): leave the playing state.
      return {
        ...state,
        playState: "stopped",
        playStateChangeCount: state.playStateChangeCount + 1,
      };
    });
  }
}
