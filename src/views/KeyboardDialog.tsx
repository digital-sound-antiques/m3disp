import { useContext, useEffect, useRef, useState } from "react";
import { AppContext } from "../contexts/AppContext";
import { KeyboardList } from "../widgets/KeyboardList";

export const keyboardDialogId = "keyboard-dialog";

export function KeyboardDialog() {
  const app = useContext(AppContext);
  const open = app.isOpen(keyboardDialogId);

  // floating position (modeless window); size is handled by CSS `resize`
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 120, y: 96 });
  const dragRef = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  // The keyboard content renders at a fixed 800x640 canvas and is scaled to fit
  // the dialog's (content-box) width; vertical overflow scrolls in the body.
  const KBD_W = 800;
  const KBD_H = 640;
  const bodyRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!open) return;
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      // clientWidth excludes the (gutter-stable) scrollbar; subtract padding.
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

  if (!open) return null;

  const onHeadDown = (e: React.PointerEvent) => {
    // don't start a drag from the close button
    if ((e.target as HTMLElement).closest(".kbd-close")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
  };
  const onHeadMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const x = Math.max(0, Math.min(window.innerWidth - 60, d.x + (e.clientX - d.px)));
    const y = Math.max(0, Math.min(window.innerHeight - 40, d.y + (e.clientY - d.py)));
    setPos({ x, y });
  };
  const onHeadUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div className="kbd-panel" style={{ left: pos.x, top: pos.y }}>
      <div
        className="kbd-panel-head"
        onPointerDown={onHeadDown}
        onPointerMove={onHeadMove}
        onPointerUp={onHeadUp}
      >
        <span>Keyboard</span>
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
    </div>
  );
}
