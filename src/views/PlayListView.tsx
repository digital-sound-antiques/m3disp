import { DragHandle, Pause, PlayArrow, Remove } from "@mui/icons-material";
import {
  Box,
  Button,
  Card,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  SxProps,
  Theme,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";

import { useContext, useRef, useState } from "react";

import { DragDropContext, Draggable, DropResult } from "react-beautiful-dnd";
import { PlayerContext } from "../contexts/PlayerContext";
import { StrictModeDroppable as Droppable } from "../widgets/StrictModeDroppable";

import { FileDrop } from "react-file-drop";
import { useFileDrop } from "../contexts/FileDropContext";
import { PlayListToolBar } from "../widgets/PlayListToolBar";
import { AppContext } from "../contexts/AppContext";

export function PlayListBody(props: {
  onAddClick: () => void;
  editMode: boolean;
  sx?: SxProps<Theme> | null;
}) {
  const context = useContext(PlayerContext);

  const _play = async (index: number) => {
    if (context.selectedIndex == index) {
      if (context.player.state == "paused") {
        context.resume();
      } else if (context.player.state == "playing") {
        context.pause();
      } else {
        context.play(index);
      }
    } else {
      context.play(index);
    }
  };

  const _delete = async (index: number) => {
    const entries = [...context.entries];
    entries.splice(index, 1);
    context.setEntries(entries);
  };

  const [isListItemDragging, setListItemDragging] = useState(false);

  const onListItemDragStart = () => {
    setListItemDragging(true);
  };

  const onListItemDragEnd = async (result: DropResult) => {
    setListItemDragging(false);
    const { source, destination } = result;
    if (!destination) {
      return;
    }
    context.reorderEntry(source.index, destination.index);
  };

  const theme = useTheme();
  const isXs = useMediaQuery(theme.breakpoints.down("sm"));
  const app = useContext(AppContext);

  if (context.entries.length == 0) {
    return (
      <Box
        sx={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          overflow: "auto",
          ...props.sx,
          justifyContent: "center",
          alignItems: "center",
          pb: 4,
        }}
      >
        {isXs ? (
          <Button variant="contained" onClick={props.onAddClick}>
            Open File...
          </Button>
        ) : null}
        {!isXs ? (
          <Box
            sx={{ m: 1, border: "2px dashed", borderColor: "primary.main", p: 3, borderRadius: 4 }}
          >
            <Typography variant="body2" color="primary.main" sx={{ m: 1 }}>
              Drag and Drop your MGS files here
            </Typography>
          </Box>
        ) : null}
        <Typography variant="body2" sx={{ m: 2 }}>
          Or
        </Typography>
        <Button variant="contained" onClick={() => app.openDialog("sample-dialog")}>
          Open Samples
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ flex: 1, overflow: "auto", ...props.sx }}>
      <DragDropContext onDragStart={onListItemDragStart} onDragEnd={onListItemDragEnd}>
        <Droppable droppableId="dnd-list">
          {(provided) => {
            return (
              <List ref={provided.innerRef} {...provided.droppableProps}>
                {context.entries.map((e, index) => {
                  const selected = !isListItemDragging && index == context.selectedIndex;
                  const isPlaying = selected && context.isPlaying;
                  const secondaryAction = createSecondaryAction(
                    isListItemDragging,
                    isPlaying,
                    props.editMode,
                    props.editMode
                      ? () => {
                          _delete(index);
                        }
                      : () => {
                          _play(index);
                        }
                  );

                  return (
                    <Draggable
                      isDragDisabled={!props.editMode}
                      key={index}
                      draggableId={`${index}`}
                      index={index}
                    >
                      {(provided) => (
                        <ListItem
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          disablePadding
                          secondaryAction={secondaryAction}
                        >
                          <ListItemButton
                            selected={selected}
                            onClick={() => {
                              _play(index);
                            }}
                          >
                            {props.editMode ? <DragHandle sx={{ mr: 1 }} /> : null}
                            <ListItemText disableTypography={true}>
                              <Typography
                                sx={{
                                  fontWeight: "bold",
                                  fontSize: { xs: "1rem", sm: "0.8rem" },
                                }}
                                noWrap={true}
                              >
                                {e.title}
                              </Typography>
                            </ListItemText>
                          </ListItemButton>
                        </ListItem>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </List>
            );
          }}
        </Droppable>
      </DragDropContext>
    </Box>
  );
}

function createSecondaryAction(
  isDragging: boolean,
  isPlaying: boolean,
  deleteMode: boolean,
  onClick: React.MouseEventHandler<HTMLButtonElement>
): React.ReactNode | null {
  if (deleteMode) {
    return (
      <IconButton
        onClick={onClick}
        color="default"
        sx={{
          borderRadius: "12px",
          width: "24px",
          height: "24px",
          backgroundColor: "red",
        }}
      >
        <Remove sx={{ fontSize: 16 }} />
      </IconButton>
    );
  }
  if (isPlaying) {
    return (
      <IconButton
        onClick={onClick}
        color="primary"
        sx={{
          borderRadius: "12px",
          width: "24px",
          height: "24px",
          backgroundColor: "white",
          opacity: isDragging ? 0.5 : undefined,
        }}
      >
        <Pause sx={{ fontSize: 16 }} />
      </IconButton>
    );
  }
  return (
    <IconButton
      onClick={onClick}
      sx={{
        borderRadius: "12px",
        width: "24px",
        height: "24px",
        backgroundColor: "primary.main",
        opacity: isDragging ? 0.5 : undefined,
      }}
    >
      <PlayArrow sx={{ fontSize: 16 }} />
    </IconButton>
  );
}

export function PlayListView(props: { toolbarAlignment?: "top" | "bottom" }) {
  const { fileDropRef, fileDropProps, isDraggingOver, onFileInputChange } = useFileDrop(false);
  const border = isDraggingOver ? `2px solid` : null;
  const [deleteMode, setDeleteMode] = useState(false);
  const theme = useTheme();

  let barSx;
  let bodySx;
  if (props.toolbarAlignment != "bottom") {
    barSx = { position: "absolute", top: 0, left: 0, right: 0 };
    bodySx = { position: "absolute", left: 0, right: 0, top: "48px", bottom: 0 };
  } else {
    barSx = { position: "absolute", bottom: 0, left: 0, right: 0 };
    bodySx = { position: "absolute", left: 0, right: 0, bottom: "48px", top: 0 };
  }

  const fileInputRef = useRef<HTMLInputElement>(null);
  const onTargetClick = () => {
    fileInputRef.current!.click();
  };

  return (
    <Box
      sx={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        border,
        borderColor: theme.palette.secondary.main,
      }}
    >
      <FileDrop ref={fileDropRef} {...fileDropProps}>
        <PlayListToolBar
          deleteMode={deleteMode}
          setEditMode={setDeleteMode}
          onAddClick={onTargetClick}
          sx={{ boxShadow: "0 0 2px 0 #00000080", ...barSx }}
        />
        <PlayListBody onAddClick={onTargetClick} editMode={deleteMode} sx={bodySx} />
      </FileDrop>
      <input
        onChange={onFileInputChange}
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
      />
    </Box>
  );
}

export function PlayListCard() {
  return (
    <Card
      sx={{
        position: "relative",
        flex: 1,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        alignItems: "stretch",
      }}
    >
      <PlayListView />
    </Card>
  );
}
