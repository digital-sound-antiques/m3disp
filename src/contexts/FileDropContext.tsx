import { PropsWithChildren, useContext, useRef, useState } from "react";
import { PlayerContext } from "./PlayerContext";
import { FileDrop } from "react-file-drop";
import { Box, useTheme } from "@mui/material";

export function useFileDrop(playOnDrop: boolean, clearOnDrop: boolean = false) {
  const context = useContext(PlayerContext);

  const [isDraggingOver, setDraggingOver] = useState(false);

  const fileDropRef = useRef(null);
  const fileDropProps = {
    onDragOver: (ev: React.DragEvent<HTMLDivElement>) => {
      if (ev.defaultPrevented) {
        setDraggingOver(false);
        return;
      }
      setDraggingOver(true);
      ev.preventDefault();
    },
    onDragLeave: (ev: React.DragEvent<HTMLDivElement>) => {
      setDraggingOver(false);
    },
    onDrop: (files: FileList | null, ev: React.DragEvent<HTMLDivElement>) => {
      setDraggingOver(false);
      if (ev.defaultPrevented) {
        return;
      }
      let insertionIndex = context.entries.length;
      if (ev.target instanceof HTMLElement) {
        const item = ev.target.closest(".MuiListItem-root");
        const list = ev.target.closest(".MuiList-root");
        const items = list?.querySelectorAll(".MuiListItem-root") ?? [];
        for (let i = 0; i < items.length; i++) {
          if (items[i] == item) {
            insertionIndex = i;
            break;
          }
        }
      }
      if (files != null) {
        context.loadFiles(files, insertionIndex, { play: playOnDrop, clear: clearOnDrop });
      }
      ev.preventDefault();
    },
  };

  const onFileInputChange = (ev: any) => {
    const { files } = ev.target;
    if (files != null) {
      context.loadFiles(files, 0, { play: true, clear: false });
      ev.preventDefault();
    }
  };

  return { fileDropRef, fileDropProps, isDraggingOver, onFileInputChange };
}

export function FileDropContext(props: PropsWithChildren) {
  const theme = useTheme();
  const { fileDropRef, fileDropProps, isDraggingOver } = useFileDrop(true, true);
  const outline = isDraggingOver ? `2px solid` : null;

  return (
    <FileDrop ref={fileDropRef} {...fileDropProps}>
      <Box
        sx={{
          outline: outline,
          outlineColor: theme.palette.secondary.main,
          borderRadius: "8px",
        }}
      >
        {props.children}
      </Box>
    </FileDrop>
  );
}
