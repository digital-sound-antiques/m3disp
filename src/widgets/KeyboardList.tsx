import { Card, Stack, useMediaQuery, useTheme } from "@mui/material";
import { useContext } from "react";
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
      <Stack
        direction="row"
        key={`${i}`}
        sx={{
          position: "relative",
          aspectRatio: props.keyboardAspectRatio ?? "640 / 22",
          width: "100%",
          overflow: "hidden",
          mb: "1px",
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
      </Stack>
    );
  }

  if (props.small) {
    return <Stack spacing="1px">{res}</Stack>;
  }

  return (
    <Card>
      <Stack>{res}</Stack>
    </Card>
  );
}

export function KeyboardList(props: { spacing?: any }) {
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down("sm"));
  const aspect = isSmall ? "640/22" : "640/28";

  return (
    <Stack spacing={props.spacing}>
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
    </Stack>
  );
}
