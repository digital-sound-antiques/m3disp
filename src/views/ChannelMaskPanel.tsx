import { useContext, useEffect, useRef, useState } from "react";
import { useTheme } from "@mui/material/styles";
import { PlayerContext } from "../contexts/PlayerContext";
import { KSSChannelMask } from "../kss/kss-device";
import { ChannelId } from "../kss/channel-status";
import { IconVolume, IconVolumeOff } from "../widgets/icons";
import { setPianoRollHighlight } from "../widgets/piano-roll-highlight";
import { VolumeIndicator, WaveIndicator } from "../widgets/TrackInfo";

type Dev = "opll" | "psg" | "scc";
// A row may cover several channels (OPLL 7/8/9 double as rhythm). `maskBits` are
// the device-mask bits it toggles together, `targets` the channels whose voice/
// level it shows, `hi` the flat channelIds indices to spotlight (opll 0-13,
// psg 14-19, scc 20-24).
type Row = { label: string; maskBits: number[]; targets: ChannelId[]; hi: number[] };
type Section = { key: string; dev: Dev; label: string; rows: Row[]; bits: number };

// Rhythm channel (index 9-13) -> its mute bit (BD=13 … HH=9); melody index == bit.
const opllBit = (ch: number) => (ch < 9 ? ch : 22 - ch);

// OPLL: 1-6 are plain FM; 7/8/9 also drive the rhythm channels sharing physical
// ch 6/7/8 — OPLL7=BD, OPLL8=SD&HH, OPLL9=TOM&CYM (channels 9 / 10,13 / 11,12).
const OPLL_CHANNELS = [[0], [1], [2], [3], [4], [5], [6, 9], [7, 10, 13], [8, 11, 12]];

const SECTIONS: Section[] = [
  {
    key: "opll",
    dev: "opll",
    label: "OPLL",
    rows: OPLL_CHANNELS.map((chs, i) => ({
      label: String(i + 1),
      maskBits: chs.map(opllBit),
      targets: chs.map((c) => ({ device: "opll", index: c } as ChannelId)),
      hi: chs, // opll flat channelIds index == channel index
    })),
    bits: 0x3fff, // all melody + rhythm bits
  },
  {
    key: "psg",
    dev: "psg",
    label: "PSG",
    rows: [0, 1, 2].map((i) => ({
      label: String(i + 1),
      maskBits: [i],
      targets: [
        { device: "psg", index: i } as ChannelId,
        { device: "psg", index: i + 3 } as ChannelId,
      ],
      hi: [14 + i, 17 + i],
    })),
    bits: 0x7,
  },
  {
    key: "scc",
    dev: "scc",
    label: "SCC",
    rows: [0, 1, 2, 3, 4].map((i) => ({
      label: String(i + 1),
      maskBits: [i],
      targets: [{ device: "scc", index: i } as ChannelId],
      hi: [20 + i],
    })),
    bits: 0x1f,
  },
];

const ALL: KSSChannelMask = { opll: 0x3fff, psg: 0x7, scc: 0x1f, opl: 0 };
const NONE: KSSChannelMask = { opll: 0, psg: 0, scc: 0, opl: 0 };
const maskEq = (a: KSSChannelMask, b: KSSChannelMask) =>
  a.opll === b.opll && a.psg === b.psg && a.scc === b.scc && a.opl === b.opl;
const soloMask = (dev: Dev, bits: number): KSSChannelMask => ({ ...ALL, [dev]: ALL[dev] & ~bits });
const bitsOf = (arr: number[]) => arr.reduce((m, b) => m | (1 << b), 0);

/** A channel row: number + voice name (or SCC waveform) + mute/solo on the main
 *  line, and a 2px level meter along the bottom edge. Reads status each frame. */
function ChannelRow(props: {
  label: string;
  targets: ChannelId[];
  hi: number[];
  muted: boolean;
  soloed: boolean;
  onMute: () => void;
  onSolo: () => void;
}) {
  const theme = useTheme();
  const context = useContext(PlayerContext);
  const [info, setInfo] = useState<{
    vol: number;
    kcode: number | null;
    kkf: number;
    voice: string | Uint8Array | null;
  }>({ vol: 0, kcode: null, kkf: 0, voice: null });
  const mutedRef = useRef(props.muted);
  mutedRef.current = props.muted;
  const targetsRef = useRef(props.targets);
  targetsRef.current = props.targets;

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const p = context.player;
      if (!mutedRef.current && (p.state === "playing" || p.state === "paused")) {
        let vol = 0;
        let kcode: number | null = null;
        let kkf = Infinity;
        let voice: string | Uint8Array | null = null;
        for (const t of targetsRef.current) {
          const s = p.getChannelStatus(t);
          if (s == null) continue;
          if (s.vol > vol) vol = s.vol;
          if (s.kcode != null) kcode = s.kcode;
          if ((s.keyKeepFrames ?? 0) < kkf) kkf = s.keyKeepFrames ?? 0;
          if (voice == null && s.voice != null) voice = s.voice as string | Uint8Array;
        }
        setInfo({ vol, kcode, kkf: isFinite(kkf) ? kkf : 0, voice });
      } else {
        setInfo({ vol: 0, kcode: null, kkf: 0, voice: null });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [context.player]);

  return (
    <div
      className="ch-row"
      onMouseEnter={() => setPianoRollHighlight(props.hi)}
      onMouseLeave={() => setPianoRollHighlight(null)}
    >
      <span className="ch-label">{props.label}</span>
      <div className="ch-voice-col">
        <div className="ch-voice">
          {info.voice instanceof Uint8Array ? (
            <div className="ch-wave">
              <WaveIndicator wave={info.voice} color={theme.palette.primary.main} />
            </div>
          ) : (
            <span className="ch-voice-name">
              {typeof info.voice === "string" ? info.voice : ""}
            </span>
          )}
        </div>
        <div className="ch-meter">
          <VolumeIndicator
            volume={info.vol}
            kcode={info.kcode}
            keyKeepFrames={info.kkf}
            primaryColor={theme.palette.primary.main}
            secondaryColor={theme.palette.secondary.main}
            variant="horizontal"
          />
        </div>
      </div>
      <button
        className={`ch-btn mute${props.muted ? " on" : ""}`}
        onClick={props.onMute}
        title={props.muted ? "Unmute" : "Mute"}
      >
        {props.muted ? <IconVolumeOff /> : <IconVolume />}
      </button>
      <button
        className={`ch-btn solo${props.soloed ? " active" : ""}`}
        onClick={props.onSolo}
        title="Solo"
      >
        S
      </button>
    </div>
  );
}

export function ChannelMaskPanel() {
  const context = useContext(PlayerContext);
  const mask = context.channelMask;

  const apply = (next: KSSChannelMask) => {
    context.player.setChannelMask(next);
    context.reducer.setChannelMaskLive(next);
  };
  const setDevice = (dev: Dev, deviceMask: number) => apply({ ...mask, [dev]: deviceMask });
  const reset = () => apply({ ...NONE });

  const toggleRow = (dev: Dev, maskBits: number[]) => {
    const willMute = (mask[dev] & (1 << maskBits[0])) === 0;
    let dm = mask[dev];
    for (const b of maskBits) dm = willMute ? dm | (1 << b) : dm & ~(1 << b);
    setDevice(dev, dm);
  };
  const solo = (dev: Dev, bits: number) => {
    const s = soloMask(dev, bits);
    apply(maskEq(mask, s) ? { ...NONE } : s);
  };
  const isSoloed = (dev: Dev, bits: number) => maskEq(mask, soloMask(dev, bits));

  return (
    <>
      <div className="ch-head">
        <span>Channels</span>
        <span className="ch-actions">
          <button onClick={reset} title="Unmute all channels">
            Reset
          </button>
        </span>
      </div>
      <div className="ch-list">
        {SECTIONS.map((s) => {
          const dmask = mask[s.dev];
          const on = (dmask & s.bits) === s.bits;
          const partial = !on && (dmask & s.bits) !== 0;
          const secHi = s.rows.flatMap((r) => r.hi);
          return (
            <div className="ch-group" key={s.key}>
              <div
                className="ch-sec"
                onMouseEnter={() => setPianoRollHighlight(secHi)}
                onMouseLeave={() => setPianoRollHighlight(null)}
              >
                <span className="ch-sec-label">{s.label}</span>
                <button
                  className={`ch-btn mute${on ? " on" : partial ? " partial" : ""}`}
                  onClick={() => setDevice(s.dev, on ? dmask & ~s.bits : dmask | s.bits)}
                  title={on ? "Unmute section" : "Mute section"}
                >
                  {on ? <IconVolumeOff /> : <IconVolume />}
                </button>
                <button
                  className={`ch-btn solo${isSoloed(s.dev, s.bits) ? " active" : ""}`}
                  onClick={() => solo(s.dev, s.bits)}
                  title="Solo section"
                >
                  S
                </button>
              </div>
              {s.rows.map((r) => {
                const rowBits = bitsOf(r.maskBits);
                const muted = (dmask & (1 << r.maskBits[0])) !== 0;
                return (
                  <ChannelRow
                    key={r.label}
                    label={r.label}
                    targets={r.targets}
                    hi={r.hi}
                    muted={muted}
                    soloed={isSoloed(s.dev, rowBits)}
                    onMute={() => toggleRow(s.dev, r.maskBits)}
                    onSolo={() => solo(s.dev, rowBits)}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}
