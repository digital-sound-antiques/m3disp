import { useContext } from "react";
import { PlayerContext } from "../contexts/PlayerContext";
import { IconButton, Slider, Stack, Tooltip } from "@mui/material";
import { SurroundSound, VolumeDown } from "@mui/icons-material";
import { SurroundMode } from "../utils/surround";

import { styled, useTheme } from "@mui/material/styles";

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

const NEXT_MODE: Record<SurroundMode, SurroundMode> = {
  off: "wide",
  wide: "wide-reverb",
  "wide-reverb": "off",
};

const MODE_LABEL: Record<SurroundMode, string> = {
  off: "Surround: Off",
  wide: "Surround: Wide",
  "wide-reverb": "Surround: Wide + Reverb",
};

export function VolumeControl() {
  const context = useContext(PlayerContext);
  const theme = useTheme();
  const mode = context.surroundMode;
  // Icon color signals the current mode: dim when off, white when widening,
  // theme-accented when reverb is added too.
  const modeColor: Record<SurroundMode, string> = {
    off: "rgba(255,255,255,0.4)",
    wide: "#e0e0e0",
    "wide-reverb": theme.palette.primary.main,
  };
  return (
    <Stack spacing={1} direction="row" alignItems="center">
      <Tooltip title={MODE_LABEL[mode]}>
        <IconButton
          size="small"
          sx={{ color: modeColor[mode], p: 0.25 }}
          onClick={() => context.reducer.setSurroundMode(NEXT_MODE[mode])}
        >
          <SurroundSound sx={{ fontSize: "20px" }} />
        </IconButton>
      </Tooltip>
      <VolumeDown sx={{ fontSize: "20px" }} />
      <WhiteSlider
        size="small"
        min={1.0}
        max={7.0}
        defaultValue={4.0}
        step={0.25}
        value={context.masterGain}
        onChange={(ev, value) => {
          context.reducer.setMasterGain(value as number);
        }}
      />
    </Stack>
  );
}
