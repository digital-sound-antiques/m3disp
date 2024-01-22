import { EditNote, PlaylistAdd, SaveAlt, Share } from "@mui/icons-material";
import {
  Box,
  Button,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  SxProps,
  Theme
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
      <MenuItem onClick={() => props.onClick("open-file")}>Add File...</MenuItem>
      <MenuItem onClick={() => props.onClick("open-url")}>Add URL...</MenuItem>
      <Divider />
      <MenuItem onClick={() => props.onClick("open-sample")}>Open Samples...</MenuItem>
    </Menu>
  );
}

function PlayListSaveMenu(props: {
  anchorEl?: HTMLElement | null;
  onClick: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Menu open={props.anchorEl != null} anchorEl={props.anchorEl} onClose={props.onClose}>
      <MenuItem onClick={() => props.onClick("export")}>Save As Zip...</MenuItem>
    </Menu>
  );
}

export function PlayListToolBar(props: {
  deleteMode: boolean;
  setEditMode: (flag: boolean) => void;
  onAddClick: () => void;
  onExportClick: () => void;
  sx?: SxProps<Theme> | null;
}) {
  const app = useContext(AppContext);
  const context = useContext(PlayerContext);

  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [addMenuAnchorEl, setAddMenuAnchorEl] = useState<HTMLElement | null>(null);
  const onAddButtonClick = () => {
    setAddMenuAnchorEl(addButtonRef.current);
  };
  const onAddMenuClick = (id: string) => {
    setAddMenuAnchorEl(null);
    if (id == "open-file") {
      props.onAddClick();
    } else if (id == "open-url") {
      app.openDialog("open-url-dialog");
    } else if (id == "open-sample") {
      app.openDialog("sample-dialog");
    }
  };
  const onAddMenuClose = () => {
    setAddMenuAnchorEl(null);
  };

  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const [saveMenuAnchorEl, setSaveMenuAnchorEl] = useState<HTMLElement | null>(null);

  const onSaveButtonClick = () => {
    setSaveMenuAnchorEl(saveButtonRef.current);
  };

  const onSaveMenuClick = (id: string) => {
    setSaveMenuAnchorEl(null);
    if (id == "export") {
      props.onExportClick();
    }
  };

  const onSaveMenuClose = () => {
    setSaveMenuAnchorEl(null);
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
      <PlayListAddMenu
        anchorEl={addMenuAnchorEl}
        onClick={onAddMenuClick}
        onClose={onAddMenuClose}
      />
      <PlayListSaveMenu
        anchorEl={saveMenuAnchorEl}
        onClick={onSaveMenuClick}
        onClose={onSaveMenuClose}
      />

      <Stack sx={{ flexDirection: "row", gap: 1 }}>
        <IconButton ref={addButtonRef} onClick={onAddButtonClick}>
          <PlaylistAdd />
        </IconButton>
        <IconButton ref={saveButtonRef} onClick={onSaveButtonClick}>
          <SaveAlt />
        </IconButton>
      </Stack>
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
          <EditNote />
        </IconButton>
      )}
    </Box>
  );
}
