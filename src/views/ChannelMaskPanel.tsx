import { useContext } from "react";
import { PlayerContext } from "../contexts/PlayerContext";
import { AppContext } from "../contexts/AppContext";
import { KSSChannelMask } from "../kss/kss-device";
import { IconVolume, IconVolumeOff } from "../widgets/icons";

type Dev = "opll" | "psg" | "scc";
type Row = { label: string; bit: number; colorIndex: number };
type Section = { key: string; dev: Dev; label: string; rows: Row[]; bits: number };

// Colour indices follow the flat pianoRollChannelColors layout in
// piano-roll-painter.ts: opll base 0 (0-13), psg base 14 (14-19), scc base 20 (20-24).
// OPLL rhythm (bits 9-13) is exposed as its own section so it mutes independently
// of the melody channels that share physical channels 6/7/8.
const RHYTHM = ["BD", "SD", "TOM", "CYM", "HH"]; // bits 9-13 (see channel-status.ts)

const SECTIONS: Section[] = [
  {
    key: "opll",
    dev: "opll",
    label: "OPLL",
    rows: Array.from({ length: 9 }, (_, i) => ({ label: `OPLL${i + 1}`, bit: i, colorIndex: i })),
    bits: 0x1ff, // bits 0-8
  },
  {
    key: "opll-rhythm",
    dev: "opll",
    // Mask bits run opposite to the status/colour index: BD=13, SD=12, TOM=11,
    // CYM=10, HH=9 (from the physical ch6/7/8 rhythm allocation). Colour still
    // follows the status index (9=BD … 13=HH), which the piano roll uses.
    label: "OPLL Rhythm",
    rows: RHYTHM.map((label, i) => ({ label, bit: 13 - i, colorIndex: 9 + i })),
    bits: 0x3e00, // bits 9-13
  },
  {
    key: "psg",
    dev: "psg",
    label: "PSG",
    rows: Array.from({ length: 3 }, (_, i) => ({ label: `PSG${i + 1}`, bit: i, colorIndex: 14 + i })),
    bits: 0x7,
  },
  {
    key: "scc",
    dev: "scc",
    label: "SCC",
    rows: Array.from({ length: 5 }, (_, i) => ({ label: `SCC${i + 1}`, bit: i, colorIndex: 20 + i })),
    bits: 0x1f,
  },
];

export function ChannelMaskPanel() {
  const context = useContext(PlayerContext);
  const app = useContext(AppContext);
  const colors = app.pianoRollChannelColors;
  const mask = context.channelMask;

  const apply = (next: KSSChannelMask) => {
    context.player.setChannelMask(next);
    context.reducer.setChannelMaskLive(next);
  };
  const setDevice = (dev: Dev, deviceMask: number) => apply({ ...mask, [dev]: deviceMask });
  const reset = () => apply({ psg: 0, scc: 0, opll: 0, opl: 0 });

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
          const on = (dmask & s.bits) === s.bits; // all rows in this section muted
          const partial = !on && (dmask & s.bits) !== 0;
          const toggleSection = () =>
            setDevice(s.dev, on ? dmask & ~s.bits : dmask | s.bits);
          return (
            <div className="ch-group" key={s.key}>
              <div className="ch-sec">
                <span className="ch-sec-label">{s.label}</span>
                <button
                  className={`ch-btn mute${on ? " on" : partial ? " partial" : ""}`}
                  onClick={toggleSection}
                  title={on ? "Unmute section" : "Mute section"}
                >
                  {on ? <IconVolumeOff /> : <IconVolume />}
                </button>
              </div>
              {s.rows.map((r) => {
                const muted = (dmask & (1 << r.bit)) !== 0;
                return (
                  <div className="ch-row" key={r.label}>
                    <span
                      className="ch-swatch"
                      style={{ background: colors[r.colorIndex] ?? "#888" }}
                    />
                    <span className="ch-label">{r.label}</span>
                    <button
                      className={`ch-btn mute${muted ? " on" : ""}`}
                      onClick={() => setDevice(s.dev, dmask ^ (1 << r.bit))}
                      title={muted ? "Unmute" : "Mute"}
                    >
                      {muted ? <IconVolumeOff /> : <IconVolume />}
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}
