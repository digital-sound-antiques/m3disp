import { useContext } from "react";
import { PlayerContext } from "./PlayerContext";
import { Card, Slider, Stack } from "@mui/material";
import { VolumeDown, VolumeUp } from "@mui/icons-material";

export function VolumeControl() {
  const context = useContext(PlayerContext);
  return (
    <Stack
      spacing={2}
      direction="row"
      alignItems="center"
    >
      <VolumeDown />
      <Slider
        size="small"
        min={0.5}
        max={6.0}
        defaultValue={2.0}
        step={0.1}
        value={context.masterGain}
        onChange={(ev, value) => {
          context.setMasterGain(value as number);
        }}
      />
      <VolumeUp />
    </Stack>
  );
}

export function VolumeCard() {
  return (
    <Card sx={{ paddingY: 2, paddingX: 2 }}>
      <VolumeControl />
    </Card>
  );
}
