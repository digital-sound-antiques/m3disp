import { useContext, useSyncExternalStore } from "react";
import { useTheme } from "@mui/material/styles";
import { PlayerContext } from "../contexts/PlayerContext";
import { ChannelId } from "../kss/channel-status";
import { KSSDeviceName } from "../kss/kss-device";
import { Keyboard } from "./Keyboard";
import { TrackInfoPanel, VolumeInfoPanel } from "./TrackInfo";
import { AppContext } from "../contexts/AppContext";
import { getSectionOrder, subscribeSectionOrder } from "../views/channel-section-order";

type DeviceCardProps = {
  name: string;
  device: KSSDeviceName;
  targets: Array<number[] | number>;
  small?: boolean;
  keyboardAspectRatio?: string;
};

// OPLL rhythm channels (index 9-13) use reversed mute bits (BD=13 … HH=9);
// melody channels and other devices use the row index as the bit.
const opllBit = (ch: number) => (ch < 9 ? ch : 22 - ch);

function DeviceCard(props: DeviceCardProps) {
  const theme = useTheme();
  const app = useContext(AppContext);
  const context = useContext(PlayerContext);
  const masks = context.channelMask[props.device];

  // tap a row to toggle its mute; keeps the voice/meter/keyboard highlight live
  const toggleMute = (i: number) => {
    const dev = props.device;
    const cur = context.channelMask[dev];
    let t = props.targets[i];
    if (typeof t === "number") t = [t];
    const bits = dev === "opll" ? t.map(opllBit) : [i];
    const willMute = (cur & (1 << bits[0])) === 0;
    let next = cur;
    for (const b of bits) next = willMute ? next | (1 << b) : next & ~(1 << b);
    const mask = { ...context.channelMask, [dev]: next };
    context.player.setChannelMask(mask);
    context.reducer.setChannelMaskLive(mask);
  };

  const res = [];
  for (let i = 0; i < props.targets.length; i++) {
    const mask = (masks & (1 << i)) != 0;

    let target = props.targets[i];
    if (typeof target == "number") {
      target = [target];
    }

    const channels: ChannelId[] = target.map((e) => ({ device: props.device, index: e }));

    res.push(
      <div
        key={`${i}`}
        onClick={() => toggleMute(i)}
        title={mask ? "Unmute" : "Mute"}
        style={{
          display: "flex",
          flexDirection: "row",
          position: "relative",
          aspectRatio: props.keyboardAspectRatio ?? "640 / 22",
          width: "100%",
          overflow: "hidden",
          marginBottom: "1px",
          cursor: "pointer",
          // muted rows dim, but their voice/meter/keyboard stay live
          opacity: mask ? 0.5 : 1.0,
        }}
      >
        {props.small ? (
          <VolumeInfoPanel
            variant="horizontal"
            targets={channels}
            disabled={false}
            sx={{ width: "72px" }}
          />
        ) : (
          <TrackInfoPanel title={props.name} targets={channels} disabled={false} />
        )}

        <Keyboard
          targets={channels}
          highlightColor={
            app.keyHighlightColorType == "primary"
              ? theme.palette.primary.main
              : theme.palette.secondary.main
          }
          whiteKeyColor={theme.palette.text.primary}
        />
      </div>
    );
  }

  return <div className="kbd-device">{res}</div>;
}

// device-section cards keyed to match the channel list's section keys, so both
// can share the same (reorderable) display order
const DEVICE_CARDS: Record<
  string,
  { name: string; device: KSSDeviceName; targets: Array<number[] | number> }
> = {
  opll: { name: "OPLL", device: "opll", targets: [0, 1, 2, 3, 4, 5, [6, 9], [7, 10, 13], [8, 11, 12]] },
  psg: { name: "PSG", device: "psg", targets: [[0, 3], [1, 4], [2, 5]] },
  scc: { name: "SCC", device: "scc", targets: [0, 1, 2, 3, 4] },
};

export function KeyboardList(props: { isSmall?: boolean | null; aspect?: string | null }) {
  const isSmall =
    props.isSmall ?? (typeof window !== "undefined" && window.innerWidth < 600);
  const aspect = props.aspect ?? (isSmall ? "640/22" : "640/28");
  const order = useSyncExternalStore(subscribeSectionOrder, getSectionOrder);

  return (
    <div className="kbd-list">
      {order.map((key) => {
        const c = DEVICE_CARDS[key];
        if (c == null) return null;
        return (
          <DeviceCard
            key={key}
            keyboardAspectRatio={aspect}
            small={isSmall}
            name={c.name}
            device={c.device}
            targets={c.targets}
          />
        );
      })}
    </div>
  );
}
