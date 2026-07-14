import { useContext, useEffect, useRef, useState } from "react";
import {
  EditNote,
  FileOpen,
  LibraryMusic,
  Link as LinkIcon,
  Pause,
  PlayArrow,
  PlaylistAdd,
  SaveAlt,
} from "@mui/icons-material";

import { DragDropContext, Draggable, Droppable, DropResult } from "@hello-pangea/dnd";
import { PlayListEntry, PlayerContext } from "../contexts/PlayerContext";

import { FileDrop } from "react-file-drop";
import { useFileDrop } from "../contexts/FileDropContext";
import { AppContext } from "../contexts/AppContext";
import { PlaylistImage } from "./PlaylistImage";
import { setDisplayImage } from "./display-image";

export function PlayListView() {
  const app = useContext(AppContext);
  const context = useContext(PlayerContext);
  const { fileDropRef, fileDropProps, isDraggingOver, onFileInputChange } = useFileDrop(false);
  const [editMode, setEditMode] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addWrapRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // when playback moves to another track, scroll it into view if it's off-screen
  // (block: "nearest" leaves it alone when already visible)
  useEffect(() => {
    const el = rootRef.current?.querySelector("li.active");
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [context.currentEntry]);

  const onAddClick = () => {
    fileInputRef.current!.value = "";
    fileInputRef.current!.click();
  };

  // close the add menu on an outside click
  useEffect(() => {
    if (!addOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!addWrapRef.current?.contains(e.target as Node)) setAddOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [addOpen]);

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
    <div className="pl" ref={rootRef}>
      <div className="pl-toolbar">
        {editMode ? (
          <>
            <button
              className="pl-text-btn danger"
              onClick={() => {
                context.reducer.clearEntries();
                setDisplayImage(null);
              }}
            >
              CLEAR
            </button>
            <span className="pl-spacer" />
            <button className="pl-text-btn ok" onClick={() => setEditMode(false)}>
              DONE
            </button>
          </>
        ) : (
          <>
            <div className="pl-menu-wrap" ref={addWrapRef}>
              <button
                className={`pl-icon-btn${addOpen ? " active" : ""}`}
                title="Add tracks"
                onClick={() => setAddOpen((o) => !o)}
              >
                <PlaylistAdd sx={{ fontSize: 20 }} />
              </button>
              {addOpen && (
                <div className="pl-menu">
                  <div className="menu-list">
                    <button
                      className="menu-item"
                      onClick={() => {
                        setAddOpen(false);
                        onAddClick();
                      }}
                    >
                      <span className="menu-ico">
                        <FileOpen sx={{ fontSize: 18 }} />
                      </span>
                      <span className="menu-label">Open file…</span>
                    </button>
                    <button
                      className="menu-item"
                      onClick={() => {
                        setAddOpen(false);
                        app.openDialog("open-url-dialog");
                      }}
                    >
                      <span className="menu-ico">
                        <LinkIcon sx={{ fontSize: 18 }} />
                      </span>
                      <span className="menu-label">Open URL…</span>
                    </button>
                    <button
                      className="menu-item"
                      onClick={() => {
                        setAddOpen(false);
                        app.openDialog("sample-dialog");
                      }}
                    >
                      <span className="menu-ico">
                        <LibraryMusic sx={{ fontSize: 18 }} />
                      </span>
                      <span className="menu-label">Open samples…</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
            <span className="pl-spacer" />
            {entries.length > 0 && (
              <>
                <button
                  className="pl-icon-btn"
                  title="Save as ZIP"
                  onClick={() => app.openDialog("save-as-zip-dialog")}
                >
                  <SaveAlt sx={{ fontSize: 18 }} />
                </button>
                <button
                  className="pl-icon-btn"
                  title="Edit"
                  onClick={() => setEditMode(true)}
                >
                  <EditNote sx={{ fontSize: 20 }} />
                </button>
              </>
            )}
          </>
        )}
      </div>
      <FileDrop
        ref={fileDropRef}
        {...fileDropProps}
        className={`pl-drop${isDraggingOver ? " over" : ""}`}
      >
        {entries.length == 0 ? (
          <div className="pl-empty">
            <span className="pl-empty-hint">Drag &amp; drop MGS / KSS files here, or</span>
            <div className="pl-empty-actions">
              <button onClick={onAddClick}>Open File…</button>
              <button onClick={() => app.openDialog("sample-dialog")}>Open Samples</button>
            </div>
          </div>
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
                            ) : selected ? (
                              <span className="pl-act">
                                {playing ? (
                                  <Pause sx={{ fontSize: 16 }} />
                                ) : (
                                  <PlayArrow sx={{ fontSize: 16 }} />
                                )}
                              </span>
                            ) : null}
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
      <PlaylistImage />
    </div>
  );
}
