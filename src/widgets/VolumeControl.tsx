import { useContext } from "react";
import { PlayerContext } from "../contexts/PlayerContext";
import { Card, Slider, Stack } from "@mui/material";
import { VolumeDown, VolumeUp } from "@mui/icons-material";

import { styled } from "@mui/material/styles";

const WhiteSlider = styled(Slider)(({ theme }) => ({
  "&": {
    color: "#e0e0e0",
  },
  "& .MuiSlider-thumb": {
    width: 8,
    height: 8,
    transition: "none",
  },
  "& .MuiSlider-thumb:hover": {
    width: 12,
    height: 12,
  },
  "& .MuiSlider-track": {
    transition: "none",
  },
}));

export function VolumeControl() {
  const context = useContext(PlayerContext);
  return (
    <Stack spacing={1} direction="row" alignItems="center">
      <VolumeDown sx={{ fontSize: "20px" }} />
      <WhiteSlider      
        size="small"
        min={1.0}
        max={7.0}
        defaultValue={4.0}
        step={0.25}
        value={context.masterGain}
        onChange={(ev, value) => {
          context.setMasterGain(value as number);
        }}
      />
    </Stack>
  );
}
