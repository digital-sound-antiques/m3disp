import {
  Box,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Card,
  Typography,
  Button,
  Stack,
  useTheme,
  SxProps,
  Theme,
} from "@mui/material";
import { DeleteSweepOutlined, Pause, PlayArrow, PlaylistAdd, Remove } from "@mui/icons-material";

import { useContext, useRef, useState } from "react";

import { PlayerContext } from "../contexts/PlayerContext";
import { DragDropContext, Draggable, DropResult } from "react-beautiful-dnd";
import { StrictModeDroppable as Droppable } from "../widgets/StrictModeDroppable";

import { FileDrop } from "react-file-drop";
import { useFileDrop } from "../contexts/FileDropContext";
import { Marquee } from "../widgets/Marquee";

export function PlayListBody(props: { deleteMode: boolean; sx?: SxProps<Theme> | null }) {
  const context = useContext(PlayerContext);

  const _play = async (index: number) => {
    context.play(index);
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
                    props.deleteMode,
                    props.deleteMode
                      ? () => {
                          _delete(index);
                        }
                      : () => {
                          _play(index);
                        }
                  );

                  return (
                    <Draggable key={index} draggableId={`${index}`} index={index}>
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
                            <ListItemText disableTypography={true}>
                              <Marquee play={selected}>
                                <Typography
                                  sx={{
                                    fontWeight: "bold",
                                    fontSize: { xs: "1rem", sm: "0.8rem" },
                                  }}
                                  noWrap={true}
                                >
                                  {e.title}
                                </Typography>
                              </Marquee>
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

export function PlayListToolBar(props: {
  deleteMode: boolean;
  setDeleteMode: (flag: boolean) => void;
  onAddClick: () => void;
  sx?: SxProps<Theme> | null;
}) {
  const context = useContext(PlayerContext);
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
      <IconButton onClick={props.onAddClick}>
        <PlaylistAdd />
      </IconButton>
      {props.deleteMode ? (
        <Stack sx={{ flexDirection: "row", gap: 1 }}>
          <Button
            variant="outlined"
            color="error"
            onClick={() => {
              context.setEntries([]);
              props.setDeleteMode(false);
            }}
          >
            Clear all
          </Button>
          <Button
            variant="outlined"
            onClick={() => {
              props.setDeleteMode(false);
            }}
          >
            Done
          </Button>
        </Stack>
      ) : (
        <IconButton
          onClick={() => {
            props.setDeleteMode(true);
          }}
        >
          <DeleteSweepOutlined />
        </IconButton>
      )}
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
          setDeleteMode={setDeleteMode}
          onAddClick={onTargetClick}
          sx={{ boxShadow: "0 0 2px 0 #00000080", ...barSx }}
        />
        <PlayListBody deleteMode={deleteMode} sx={bodySx} />
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
