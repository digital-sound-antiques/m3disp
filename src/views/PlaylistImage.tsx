import { ChevronRight, Delete, ExpandMore, MoreVert } from "@mui/icons-material";
import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { extractFirstImage } from "../utils/image-loader";
import { getDisplayImage, setDisplayImage, subscribeDisplayImage } from "./display-image";

/** Collapsible "Artwork" section below the playlist. Shows the first image found
 *  in dropped files / ZIPs; also accepts an image dropped directly onto it. */
export function PlaylistImage() {
  const image = useSyncExternalStore(subscribeDisplayImage, getDisplayImage);
  const [over, setOver] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("m3disp.artworkCollapsed") === "1"
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("m3disp.artworkCollapsed", next ? "1" : "0");
      return next;
    });

  // close the menu on an outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  // Handle images dropped directly onto the area, without touching the playlist.
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const img = await extractFirstImage(files);
      if (img) setDisplayImage(img);
    }
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(true);
  };
  const onDragLeave = () => setOver(false);

  const dropProps = { onDrop, onDragOver, onDragLeave };

  return (
    <div className="pl-art">
      <div className="pl-art-head" onClick={toggle}>
        <span className="pl-art-collapse">
          {collapsed ? <ChevronRight sx={{ fontSize: 16 }} /> : <ExpandMore sx={{ fontSize: 16 }} />}
        </span>
        <span className="pl-art-name">Artwork</span>
        <div className="pl-art-menu-wrap" ref={menuRef} onClick={(e) => e.stopPropagation()}>
          <button
            className={`pl-art-menu-btn${menuOpen ? " active" : ""}`}
            title="Artwork options"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <MoreVert sx={{ fontSize: 18 }} />
          </button>
          {menuOpen && (
            <div className="pl-art-menu">
              <div className="menu-list">
                <button
                  className="menu-item"
                  disabled={!image}
                  onClick={() => {
                    setMenuOpen(false);
                    setDisplayImage(null);
                  }}
                >
                  <span className="menu-ico">
                    <Delete sx={{ fontSize: 18 }} />
                  </span>
                  <span className="menu-label">Remove artwork</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {!collapsed &&
        (image ? (
          <div className={`pl-images${over ? " over" : ""}`} {...dropProps}>
            <img src={image.url} alt={image.name} title={image.name} loading="lazy" />
          </div>
        ) : (
          <div className={`pl-image-empty${over ? " over" : ""}`} {...dropProps}>
            <span className="pl-image-empty-text">Drop any image here to display.</span>
          </div>
        ))}
    </div>
  );
}
