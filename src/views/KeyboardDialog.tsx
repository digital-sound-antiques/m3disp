import { useContext, useEffect, useRef, useState } from "react";
import { AppContext } from "../contexts/AppContext";
import { KeyboardList } from "../widgets/KeyboardList";

export const keyboardDialogId = "keyboard-dialog";

const KBD_W = 800; // fixed keyboard canvas width (scaled to the panel width)
const KBD_H = 640;
const MIN_W = 280;
const MIN_H = 80;

const RESIZE_DIRS = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;
type ResizeDir = (typeof RESIZE_DIRS)[number];

export function KeyboardDialog() {
  const app = useContext(AppContext);
  const open = app.isOpen(keyboardDialogId);

  // modeless floating window: dragged by its header, resizable from any edge
  const [rect, setRect] = useState({ x: 120, y: 96, w: 760, h: 430 });
  const bodyRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // scale the fixed 800x640 keyboard canvas to the body's content width
  useEffect(() => {
    if (!open) return;
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const cs = getComputedStyle(el);
      const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const w = el.clientWidth - pad;
      if (w > 0) setScale(w / KBD_W);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") app.closeDialog(keyboardDialogId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, app]);

  // --- move by dragging the header ---
  const dragRef = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const onHeadDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest(".kbd-close")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, x: rect.x, y: rect.y };
  };
  const onHeadMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setRect((r) => ({ ...r, x: d.x + (e.clientX - d.px), y: d.y + (e.clientY - d.py) }));
  };
  const onHeadUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  };

  // --- resize from any edge/corner ---
  const resizeRef = useRef<{
    dir: ResizeDir;
    sx: number;
    sy: number;
    rect: { x: number; y: number; w: number; h: number };
  } | null>(null);
  const startResize = (dir: ResizeDir) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeRef.current = { dir, sx: e.clientX, sy: e.clientY, rect: { ...rect } };
  };
  const onResizeMove = (e: React.PointerEvent) => {
    const r = resizeRef.current;
    if (!r) return;
    const dx = e.clientX - r.sx;
    const dy = e.clientY - r.sy;
    let { x, y, w, h } = r.rect;
    if (r.dir.includes("e")) w = Math.max(MIN_W, r.rect.w + dx);
    if (r.dir.includes("s")) h = Math.max(MIN_H, r.rect.h + dy);
    if (r.dir.includes("w")) {
      w = Math.max(MIN_W, r.rect.w - dx);
      x = r.rect.x + (r.rect.w - w);
    }
    if (r.dir.includes("n")) {
      h = Math.max(MIN_H, r.rect.h - dy);
      y = r.rect.y + (r.rect.h - h);
    }
    setRect({ x, y, w, h });
  };
  const endResize = (e: React.PointerEvent) => {
    resizeRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  };

  if (!open) return null;

  return (
    <div className="kbd-panel" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
      <div
        className="kbd-panel-head"
        onPointerDown={onHeadDown}
        onPointerMove={onHeadMove}
        onPointerUp={onHeadUp}
      >
        <button
          className="kbd-close"
          onClick={() => app.closeDialog(keyboardDialogId)}
          title="Close"
        >
          ✕
        </button>
      </div>
      <div className="kbd-panel-body" ref={bodyRef}>
        <div className="kbd-scale-outer" style={{ height: KBD_H * scale }}>
          <div
            className="kbd-scale-inner"
            style={{ width: KBD_W, height: KBD_H, transform: `scale(${scale})` }}
          >
            <KeyboardList isSmall={false} />
          </div>
        </div>
      </div>
      {RESIZE_DIRS.map((dir) => (
        <div
          key={dir}
          className={`kbd-rz kbd-rz-${dir}`}
          onPointerDown={startResize(dir)}
          onPointerMove={onResizeMove}
          onPointerUp={endResize}
        />
      ))}
    </div>
  );
}
