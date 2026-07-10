import { useContext } from "react";
import { useTheme } from "@mui/material/styles";
import { PlayerContext } from "../contexts/PlayerContext";
import { ChannelId } from "../kss/channel-status";
import { KSSDeviceName } from "../kss/kss-device";
import { Keyboard } from "./Keyboard";
import { TrackInfoPanel, VolumeInfoPanel } from "./TrackInfo";
import { AppContext } from "../contexts/AppContext";

type DeviceCardProps = {
  name: string;
  device: KSSDeviceName;
  targets: Array<number[] | number>;
  small?: boolean;
  keyboardAspectRatio?: string;
};

function DeviceCard(props: DeviceCardProps) {
  const theme = useTheme();
  const app = useContext(AppContext);
  const context = useContext(PlayerContext);
  const masks = context.channelMask[props.device];

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
        style={{
          display: "flex",
          flexDirection: "row",
          position: "relative",
          aspectRatio: props.keyboardAspectRatio ?? "640 / 22",
          width: "100%",
          overflow: "hidden",
          marginBottom: "1px",
          opacity: mask ? 0.5 : 1.0,
        }}
      >
        {props.small ? (
          <VolumeInfoPanel
            variant="horizontal"
            targets={channels}
            disabled={mask}
            sx={{ width: "72px" }}
          />
        ) : (
          <TrackInfoPanel title={props.name} targets={channels} disabled={mask} />
        )}

        <Keyboard
          targets={channels}
          disabled={mask}
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

export function KeyboardList(props: { isSmall?: boolean | null; aspect?: string | null }) {
  const isSmall =
    props.isSmall ?? (typeof window !== "undefined" && window.innerWidth < 600);
  const aspect = props.aspect ?? (isSmall ? "640/22" : "640/28");

  return (
    <div className="kbd-list">
      <DeviceCard
        keyboardAspectRatio={aspect}
        small={isSmall}
        name="OPLL"
        device="opll"
        targets={[0, 1, 2, 3, 4, 5, [6, 9], [7, 10, 13], [8, 11, 12]]}
      />
      <DeviceCard
        keyboardAspectRatio={aspect}
        small={isSmall}
        name="PSG"
        device="psg"
        targets={[
          [0, 3],
          [1, 4],
          [2, 5],
        ]}
      />
      <DeviceCard
        keyboardAspectRatio={aspect}
        small={isSmall}
        name="SCC"
        device="scc"
        targets={[0, 1, 2, 3, 4]}
      />
    </div>
  );
}
