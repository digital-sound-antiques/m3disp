import { AutoAwesome, Layers, MoreVert, Piano, ThreeDRotation, ZoomIn } from "@mui/icons-material";
import { Box, IconButton, Menu, MenuItem, Slider, Switch } from "@mui/material";
import { useContext, useRef } from "react";
import { AppContext } from "../contexts/AppContext";
import { styled } from "@mui/material/styles";

export const pianoRollColorDialogId = "piano-roll-color-dialog";
const pianoRollMenuId = "piano-roll-menu";

const TimeSlider = styled(Slider)(({ theme }) => ({
  "&": {
    color: "#999",
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

const AntSwitch = styled(Switch)(({ theme }) => ({
  width: 24,
  height: 12,
  padding: 0,
  display: "flex",
  "& .MuiSwitch-switchBase": {
    padding: 2,
    "&.Mui-checked": {
      transform: "translateX(12px)",
      color: "#fff",
      "& + .MuiSwitch-track": {
        opacity: 0.7,
        backgroundColor: theme.palette.primary,
      },
    },
  },
  "& .MuiSwitch-thumb": {
    boxShadow: "0 2px 4px 0 rgb(0 35 11 / 20%)",
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  "& .MuiSwitch-track": {
    borderRadius: 16 / 2,
    opacity: 0.7,
    backgroundColor: "rgba(255,255,255,.25)",
    boxSizing: "border-box",
  },
}));

export function PianoRollControl() {
  const context = useContext(AppContext);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const onRangeChange = (value: number) => {
    context.setPianoRollRangeInSec(value);
  };

  const onModeClick = () => {
    context.setPianoRollMode(context.pianoRollMode == "3d" ? "2d" : "3d");
  };

  const onLayerClick = () => {
    context.setPianoRollLayered(!context.pianoRollLayered);
  };

  const onShowKeyboardClick = () => {
    context.setPianoRollShowKeyboard(!context.pianoRollShowKeyboard);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
      <ZoomIn sx={{ fontSize: 16 }} />
      <TimeSlider
        min={1}
        max={16}
        onChange={(event, value) => onRangeChange(value as number)}
        value={context.pianoRollRangeInSec}
        sx={{ ml: 0.5, mr: 0.5, width: "64px" }}
        size="small"
        aria-label="Small"
        valueLabelFormat={(value) => `${value}s`}
        valueLabelDisplay="auto"
      />
      <Layers sx={{ ml: 1, fontSize: 16 }} />
      <AntSwitch
        checked={context.pianoRollLayered}
        sx={{ ml: 0.5, mr: 1 }}
        onClick={onLayerClick}
      />
      <AutoAwesome sx={{ ml: 1, fontSize: 16 }} />
      <AntSwitch
        checked={context.pianoRollShowParticles}
        sx={{ ml: 0.5, mr: 1 }}
        onClick={() => context.setPianoRollShowParticles(!context.pianoRollShowParticles)}
      />
      <Piano sx={{ ml: 1, fontSize: 16 }} />
      <AntSwitch
        checked={context.pianoRollShowKeyboard}
        sx={{ ml: 0.5, mr: 1 }}
        onClick={onShowKeyboardClick}
      />
      <ThreeDRotation sx={{ ml: 1, fontSize: 16 }} />
      <AntSwitch
        checked={context.pianoRollMode == "3d"}
        sx={{ ml: 0.5, mr: 1 }}
        onClick={onModeClick}
      />
      <IconButton
        ref={menuButtonRef}
        size="small"
        sx={{ ml: 0.5 }}
        onClick={() => context.openPopup(pianoRollMenuId, menuButtonRef.current!)}
      >
        <MoreVert sx={{ fontSize: 18 }} />
      </IconButton>
      <Menu
        open={context.isOpen(pianoRollMenuId)}
        anchorEl={context.anchorElMap[pianoRollMenuId]}
        onClose={() => context.closePopup(pianoRollMenuId)}
      >
        <MenuItem
          onClick={() => {
            context.closePopup(pianoRollMenuId);
            context.openDialog(pianoRollColorDialogId);
          }}
        >
          Color Settings…
        </MenuItem>
      </Menu>
    </Box>
  );
}
