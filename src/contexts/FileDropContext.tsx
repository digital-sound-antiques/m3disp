import { Box, useTheme } from "@mui/material";
import { PropsWithChildren, useContext, useRef, useState } from "react";
import { FileDrop } from "react-file-drop";
import { BinaryDataStorage } from "../utils/binary-data-storage";
import { createEntriesFromFileList } from "../utils/loader";
import { PlayerContext } from "./PlayerContext";

export function useFileDrop(playOnDrop: boolean, clearOnDrop: boolean = false) {
  const context = useContext(PlayerContext);

  const [isDraggingOver, setDraggingOver] = useState(false);

  const highlightListItem = (target: HTMLElement): HTMLElement | null => {
    if (target instanceof HTMLElement) {
      const item = target.closest(".MuiListItem-root");
      const list = target.closest(".MuiList-root");
      const items = list?.querySelectorAll(".MuiListItem-root") ?? [];
      for (let i = 0; i < items.length; i++) {
        if (items[i] == item) {
          items[i].classList.add("fileDragOver");
        } else {
          items[i].classList.remove("fileDragOver");
        }
      }
    }
    return null;
  };

  const clearHighlight = () => {
    const list = document.querySelector(".MuiList-root");
    const items = list?.querySelectorAll(".MuiListItem-root") ?? [];
    for (let i = 0; i < items.length; i++) {
      items[i].classList.remove("fileDragOver");
    }
  };

  const loadFiles = async (storage: BinaryDataStorage, files: FileList, insertionIndex: number) => {
    const entries = await createEntriesFromFileList(storage, files);
    context.reducer.addEntries(entries, insertionIndex);
    if (playOnDrop) {
      context.reducer.play(insertionIndex);
    }
  };

  const fileDropRef = useRef(null);
  const fileDropProps = {
    onDragOver: (ev: React.DragEvent<HTMLDivElement>) => {
      if (ev.defaultPrevented) {
        setDraggingOver(false);
        return;
      }
      setDraggingOver(true);
      highlightListItem(ev.target as HTMLElement);
      ev.preventDefault();
    },
    onDragLeave: (ev: React.DragEvent<HTMLDivElement>) => {
      setDraggingOver(false);
      clearHighlight();
    },
    onDrop: (files: FileList | null, ev: React.DragEvent<HTMLDivElement>) => {
      clearHighlight();
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
        if (clearOnDrop) {
          context.reducer.setEntries([]);
        }
        loadFiles(context.storage, files, insertionIndex);
      }
      ev.preventDefault();
    },
  };

  const onFileInputChange = (ev: any) => {
    const { files } = ev.target;
    if (files != null) {
      loadFiles(context.storage, files, 0);
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
      <style>{`.fileDragOver { border-top: 2px solid ${theme.palette.secondary.main};  }`}</style>
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
