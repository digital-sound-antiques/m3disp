import { Edit, PlaylistAdd } from "@mui/icons-material";
import {
  Box,
  Button,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  SxProps,
  Theme,
} from "@mui/material";
import { useContext, useRef, useState } from "react";
import { AppContext } from "../contexts/AppContext";
import { PlayerContext } from "../contexts/PlayerContext";

function PlayListAddMenu(props: {
  anchorEl?: HTMLElement | null;
  onClick: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Menu open={props.anchorEl != null} anchorEl={props.anchorEl} onClose={props.onClose}>
      <MenuItem onClick={() => props.onClick("open-file")}>Open File...</MenuItem>
      {/* <MenuItem onClick={() => props.onClick("open-url")}>Open Url...</MenuItem>
      <Divider /> */}
      <MenuItem onClick={() => props.onClick("open-sample")}>Open Sample...</MenuItem>
    </Menu>
  );
}

export function PlayListToolBar(props: {
  deleteMode: boolean;
  setEditMode: (flag: boolean) => void;
  onAddClick: () => void;
  sx?: SxProps<Theme> | null;
}) {
  const app = useContext(AppContext);
  const context = useContext(PlayerContext);

  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null);

  const onAddButtonClick = () => {
    setMenuAnchorEl(addButtonRef.current);
  };

  const onMenuClick = (id: string) => {
    setMenuAnchorEl(null);
    if (id == "open-file") {
      props.onAddClick();
    } else if (id == "open-url") {
      app.openDialog("open-url-dialog");
    } else if (id == "open-sample") {
      app.openDialog("sample-dialog");
    }
  };

  const onMenuClose = () => {
    setMenuAnchorEl(null);
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        height: "48px",
        pl: 1,
        pr: 1,
        ...props.sx,
      }}
    >
      <PlayListAddMenu anchorEl={menuAnchorEl} onClick={onMenuClick} onClose={onMenuClose} />
      <IconButton ref={addButtonRef} onClick={onAddButtonClick}>
        <PlaylistAdd />
      </IconButton>
      {props.deleteMode ? (
        <Stack sx={{ flexDirection: "row", gap: 1 }}>
          <Button
            variant="outlined"
            color="error"
            onClick={() => {
              context.reducer.setEntries([]);
              props.setEditMode(false);
            }}
          >
            Clear all
          </Button>
          <Button
            variant="outlined"
            onClick={() => {
              props.setEditMode(false);
            }}
          >
            Done
          </Button>
        </Stack>
      ) : (
        <IconButton
          onClick={() => {
            props.setEditMode(true);
          }}
        >
          <Edit />
        </IconButton>
      )}
    </Box>
  );
}
