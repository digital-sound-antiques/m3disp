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
import { SurroundEffect, SurroundMode } from "../utils/surround";

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
  surround: SurroundEffect;
  surroundMode: SurroundMode;
  storage: BinaryDataStorage;
  masterGain: number;
  player: KSSPlayer;
  repeatMode: RepeatMode;
  entries: PlayListEntry[];
  currentEntry: PlayListEntry | null;
  playState: "playing" | "paused" | "stopped";
  playStateChangeCount: number;
  /** during an auto-advance gap: Date.now() deadline when audio starts; else null.
   *  Runtime-only (not persisted). Drives the negative countdown in the UI. */
  gapUntil: number | null;
  defaultLoopCount: number;
  defaultDuration: number;
  /** silence (ms) inserted before auto-advancing to the next track (0..5000) */
  autoAdvanceGap: number;
  /** Z80 clock passed to KSSPLAY_reset as a multiple of 3.58MHz; 0 = auto
   *  (libkss picks 7.16MHz for FMPAC/MSX-AUDIO songs, else 3.58MHz) */
  cpuSpeed: number;
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

export const DEFAULT_MASTER_GAIN = 4.0;
export const DEFAULT_SURROUND_MODE: SurroundMode = "off";
export const DEFAULT_REPEAT_MODE: RepeatMode = "none";
export const DEFAULT_LOOP_COUNT = 2;
export const DEFAULT_DURATION_MS = 300 * 1000;
export const DEFAULT_AUTO_ADVANCE_GAP_MS = 0;
export const MAX_AUTO_ADVANCE_GAP_MS = 5 * 1000;
/** Selectable Z80 clocks (multiples of MSX_CLK; 0 = auto). libkss accepts 1..8,
 *  but anything past 4x is far outside what real hardware and drivers expect. */
export const CPU_SPEED_VALUES = [0, 1, 2, 3, 4];
export const DEFAULT_CPU_SPEED = 0;

const createDefaultContextState = () => {
  const audioContext = new AudioContext({ sampleRate: 44100, latencyHint: "interactive" });
  const state: PlayerContextState = {
    audioContext: audioContext,
    gainNode: new GainNode(audioContext),
    surround: new SurroundEffect(audioContext),
    surroundMode: DEFAULT_SURROUND_MODE,
    storage: new BinaryDataStorage(),
    // Workaround: AudioWorklet's playback is broken in iOS 17.5.1
    player: new KSSPlayer(isIOS ? "script" : "worklet"),
    repeatMode: DEFAULT_REPEAT_MODE,
    entries: [],
    currentEntry: null,
    playStateChangeCount: 0,
    playState: "stopped",
    gapUntil: null,
    masterGain: DEFAULT_MASTER_GAIN,
    defaultLoopCount: DEFAULT_LOOP_COUNT,
    defaultDuration: DEFAULT_DURATION_MS,
    autoAdvanceGap: DEFAULT_AUTO_ADVANCE_GAP_MS,
    cpuSpeed: DEFAULT_CPU_SPEED,
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
  state.gainNode.connect(state.surround.input);
  state.surround.output.connect(state.audioContext.destination);
  state.player.connect(state.gainNode);
  autoResumeAudioContext(state.audioContext);

  try {
    const data = localStorage.getItem("m3disp.playerContext");
    const json = data != null ? JSON.parse(data) : {};
    const pls = localStorage.getItem("m3disp.entries");
    const entries = pls != null ? JSON.parse(pls) : [];
    state.entries = entries;
    // clamp against the current slider range: a value persisted under an older,
    // wider range (was 1.0–7.0) could otherwise land out of bounds
    state.masterGain = Math.min(7.0, Math.max(0.0, json.masterGain ?? state.masterGain));
    state.gainNode.gain.value = state.masterGain;
    state.repeatMode = json.repeatMode ?? state.repeatMode;
    state.surroundMode = json.surroundMode ?? state.surroundMode;
    state.surround.setMode(state.surroundMode);
    state.defaultLoopCount = json.defaultLoopCount ?? state.defaultLoopCount;
    state.defaultDuration = json.defaultDuration ?? state.defaultDuration;
    state.autoAdvanceGap = Math.min(
      MAX_AUTO_ADVANCE_GAP_MS,
      Math.max(0, json.autoAdvanceGap ?? state.autoAdvanceGap)
    );
    state.cpuSpeed = CPU_SPEED_VALUES.includes(json.cpuSpeed) ? json.cpuSpeed : state.cpuSpeed;
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
  /** cut an in-progress auto-advance gap short and start the next track now */
  skipGap: () => {},
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
  state: PlayerContextState,
  autoAdvanceGapMs: number = 0,
  isCurrent: () => boolean = () => true,
  setGapUntil: (until: number | null) => void = () => {},
  gapSkipRef: { current: (() => void) | null } = { current: null }
) {
  const ctx = state.audioContext;
  const gain = state.gainNode.gain;

  // Stop a playing stream without a click.
  const fadeOutAndAbort = async () => {
    const t = ctx.currentTime;
    gain.cancelScheduledValues(t);
    gain.setValueAtTime(gain.value, t);
    gain.linearRampToValueAtTime(0, t + 0.05);
    await new Promise((r) => setTimeout(r, 100));
    await state.player.abort();
    const tr = ctx.currentTime;
    gain.cancelScheduledValues(tr);
    gain.setValueAtTime(state.masterGain, tr);
  };

  const play = async (entry: PlayListEntry) => {
    // A switch from a playing track fades it out and aborts it first, so the new
    // track begins from real silence with the gain steady at full -- identical
    // to a fresh start from stopped, and click-free. A fresh start (not playing)
    // skips this: it already begins from silence at full gain.
    if (state.player.state === "playing") {
      await fadeOutAndAbort();
    }

    // Auto-advance gap: we've already advanced to the next track (its title is
    // shown), so drop the player to its head (abort -> 0:00) and wait before
    // starting audio. The pause thus reads as "waiting at the head of the next
    // track", not "stuck at the end of the previous one". Skipped for manual
    // next/prev/select (gap is 0 there). If the user changes tracks during the
    // wait, playStateChangeCount moves and isCurrent() aborts this start.
    if (autoAdvanceGapMs > 0) {
      await state.player.abort();
      // Wait out the remainder of the deadline armed at track-end. The wait is
      // skippable: gapSkipRef.current, exposed as context.skipGap(), resolves it
      // early (e.g. when the user taps the seek bar) so playback starts at once.
      const until = state.gapUntil ?? Date.now() + autoAdvanceGapMs;
      const remaining = until - Date.now();
      if (remaining > 0) {
        await new Promise<void>((resolve) => {
          const finish = () => {
            clearTimeout(timer);
            gapSkipRef.current = null;
            resolve();
          };
          const timer = setTimeout(finish, remaining);
          gapSkipRef.current = finish;
        });
      }
      setGapUntil(null);
      if (!isCurrent()) return;
    }

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
      cpu: state.cpuSpeed,
    };
    await state.player.play(options);
  };

  // A non-gap transition (manual next/prev/select/stop) cancels any pending gap
  // countdown. The gap transition itself (autoAdvanceGapMs > 0) keeps the
  // deadline that was armed at track-end. (No-op when already clear.)
  if (autoAdvanceGapMs === 0) setGapUntil(null);

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
    // Fade out first when actually playing; otherwise (paused) just abort.
    if (state.player.state === "playing") {
      return fadeOutAndAbort();
    }
    return state.player.abort();
  }
}

export function PlayerContextProvider(props: React.PropsWithChildren) {
  const [state, setState] = useState(defaultContextState);
  const oldState = usePrevious(state);
  const p = useContext(AppProgressContext);

  // Latest-value mirrors read from the (once-registered) statechange listener,
  // which would otherwise close over stale state.
  const autoAdvanceGapRef = useRef(state.autoAdvanceGap);
  autoAdvanceGapRef.current = state.autoAdvanceGap;
  const playStateChangeCountRef = useRef(state.playStateChangeCount);
  playStateChangeCountRef.current = state.playStateChangeCount;
  // Set when a track ends and we auto-advance; makes the *next* play() insert
  // the gap. Consumed (cleared) on the next applyPlayStateChange so manual
  // transitions never inherit it.
  const pendingAutoGapRef = useRef(0);
  // Resolver for an in-progress gap wait; calling it ends the gap immediately.
  const gapSkipRef = useRef<(() => void) | null>(null);
  const skipGap = () => gapSkipRef.current?.();

  useEffect(() => {
    const gapMs = pendingAutoGapRef.current;
    pendingAutoGapRef.current = 0;
    const changeCount = state.playStateChangeCount;
    applyPlayStateChange(
      oldState,
      state,
      gapMs,
      () => playStateChangeCountRef.current === changeCount,
      (until) => setState((s) => (s.gapUntil === until ? s : { ...s, gapUntil: until })),
      gapSkipRef
    );
  }, [state.playStateChangeCount]);

  useEffect(() => {
    state.gainNode.gain.value = state.masterGain;
  }, [state.masterGain]);

  useEffect(() => {
    state.surround.setMode(state.surroundMode);
  }, [state.surroundMode]);

  // "Reset all settings" (dispatched from AppContext) also restores the
  // player-side settings: volume, surround, repeat, loop count, duration.
  // Listens to the player-specific event, NOT m3disp:reset-layout, so the
  // standalone "Reset Window Layout" command leaves volume et al. untouched.
  useEffect(() => {
    const onReset = () =>
      setState((s) => ({
        ...s,
        masterGain: DEFAULT_MASTER_GAIN,
        surroundMode: DEFAULT_SURROUND_MODE,
        repeatMode: DEFAULT_REPEAT_MODE,
        defaultLoopCount: DEFAULT_LOOP_COUNT,
        defaultDuration: DEFAULT_DURATION_MS,
        autoAdvanceGap: DEFAULT_AUTO_ADVANCE_GAP_MS,
        cpuSpeed: DEFAULT_CPU_SPEED,
      }));
    window.addEventListener("m3disp:reset-player", onReset);
    return () => window.removeEventListener("m3disp:reset-player", onReset);
  }, []);

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
    const {
      defaultLoopCount,
      defaultDuration,
      autoAdvanceGap,
      cpuSpeed,
      channelMask,
      repeatMode,
      masterGain,
      surroundMode,
    } = state;
    const data = {
      version: 1,
      defaultLoopCount,
      defaultDuration,
      autoAdvanceGap,
      cpuSpeed,
      channelMask,
      masterGain,
      repeatMode,
      surroundMode,
    };
    localStorage.setItem("m3disp.playerContext", JSON.stringify(data));
  };

  useEffect(() => {
    save();
  }, [
    state.masterGain,
    state.defaultLoopCount,
    state.defaultDuration,
    state.autoAdvanceGap,
    state.cpuSpeed,
    state.channelMask,
    state.repeatMode,
    state.surroundMode,
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
      // Advance to the next track immediately (so its title shows), but arm the
      // auto-advance gap so the resulting play() waits at the new track's head
      // before starting audio.
      const gap = autoAdvanceGapRef.current ?? 0;
      pendingAutoGapRef.current = gap;
      // Set the gap deadline NOW (same render as the advance) so the seek bar is
      // disabled for the whole gap. Until play() actually starts the new track,
      // the player still holds the previous track, so a seek here would replay
      // it — disabling from the first frame avoids that window.
      if (gap > 0) setState((s) => ({ ...s, gapUntil: Date.now() + gap }));
      reducer.onPlayerStopped();
    }
  };

  const onWindowMessage = async (ev: MessageEvent) => {
    if (ev.data instanceof Uint8Array && ev.data.length <= 65536) {
      reducer.clearEntries();
      const entries = await loadEntriesFromFileList(state.storage, [
        new File([ev.data as BlobPart], "external.mgs"),
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
        skipGap,
      }}
    >
      {props.children}
    </PlayerContext.Provider>
  );
}
