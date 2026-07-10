import { useContext, useRef, useState } from "react";

import { DragDropContext, Draggable, Droppable, DropResult } from "@hello-pangea/dnd";
import { PlayListEntry, PlayerContext } from "../contexts/PlayerContext";

import { FileDrop } from "react-file-drop";
import { useFileDrop } from "../contexts/FileDropContext";
import { AppContext } from "../contexts/AppContext";

export function PlayListView() {
  const app = useContext(AppContext);
  const context = useContext(PlayerContext);
  const { fileDropRef, fileDropProps, isDraggingOver, onFileInputChange } = useFileDrop(false);
  const [editMode, setEditMode] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onAddClick = () => {
    fileInputRef.current!.value = "";
    fileInputRef.current!.click();
  };

  const onDragEnd = (result: DropResult) => {
    setDragging(false);
    const { source, destination } = result;
    if (destination) context.reducer.reorderEntry(source.index, destination.index);
  };

  const onItemClick = async (entry: PlayListEntry) => {
    if (context.currentEntry == entry) {
      if (context.playState == "paused") return context.reducer.resume();
      if (context.playState == "playing") return context.reducer.pause();
    }
    await context.unmute();
    context.reducer.play(entry);
  };

  const entries = context.entries;

  return (
    <div className="pl">
      <div className="pl-toolbar">
        <button className="pl-open" onClick={onAddClick}>
          Open…
        </button>
        <button onClick={() => app.openDialog("sample-dialog")}>Samples</button>
        <span className="pl-spacer" />
        {entries.length > 0 && (
          <>
            <button onClick={() => app.openDialog("save-as-zip-dialog")}>Save</button>
            <button className={editMode ? "active" : ""} onClick={() => setEditMode(!editMode)}>
              {editMode ? "Done" : "Edit"}
            </button>
            {editMode && <button onClick={() => context.reducer.clearEntries()}>Clear</button>}
          </>
        )}
      </div>
      <FileDrop
        ref={fileDropRef}
        {...fileDropProps}
        className={`pl-drop${isDraggingOver ? " over" : ""}`}
      >
        {entries.length == 0 ? (
          <div className="pl-empty">Drag &amp; drop MGS / KSS files here, or use Open…</div>
        ) : (
          <DragDropContext onDragStart={() => setDragging(true)} onDragEnd={onDragEnd}>
            <Droppable droppableId="pl-list">
              {(provided) => (
                <ol className="playlist" ref={provided.innerRef} {...provided.droppableProps}>
                  {entries.map((e, index) => {
                    const selected = !dragging && e == context.currentEntry;
                    const playing = selected && context.playState == "playing";
                    return (
                      <Draggable
                        key={index}
                        draggableId={`${index}`}
                        index={index}
                        isDragDisabled={!editMode}
                      >
                        {(p) => (
                          <li
                            ref={p.innerRef}
                            {...p.draggableProps}
                            {...p.dragHandleProps}
                            className={selected ? "active" : ""}
                            onClick={() => onItemClick(e)}
                            title={e.title ?? e.filename}
                          >
                            <span className="num">{index + 1}</span>
                            <span className="pl-title">{e.title || e.filename}</span>
                            {editMode ? (
                              <button
                                className="pl-act del"
                                title="Remove"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  context.reducer.removeEntry(e);
                                }}
                              >
                                ✕
                              </button>
                            ) : (
                              <span className="pl-act">{playing ? "⏸" : "▶"}</span>
                            )}
                          </li>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </ol>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </FileDrop>
      <input
        onChange={onFileInputChange}
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
      />
    </div>
  );
}
