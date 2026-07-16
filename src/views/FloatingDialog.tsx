import { ReactNode, useContext, useEffect, useRef, useState } from "react";
import { AppContext } from "../contexts/AppContext";

/** The app's own floating dialog: a draggable, centered-until-moved panel that
 *  closes on Escape or the ✕ button. Shared by the non-MUI dialogs. */
export function FloatingDialog(props: {
  id: string;
  title: string;
  className?: string;
  children: ReactNode;
}) {
  const app = useContext(AppContext);
  const open = app.isOpen(props.id);
  // null = not yet dragged → render centered; once dragged, explicit position.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setPos(null); // always re-center when the dialog opens
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") app.closeDialog(props.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const onHeadDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest(".fdlg-close")) return;
    const rect = (e.currentTarget.closest(".fdlg") as HTMLElement).getBoundingClientRect();
    const start = pos ?? { x: rect.left, y: rect.top };
    if (!pos) setPos(start);
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, x: start.x, y: start.y };
  };
  const onHeadMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - 60, d.x + (e.clientX - d.px))),
      y: Math.max(0, Math.min(window.innerHeight - 40, d.y + (e.clientY - d.py))),
    });
  };
  const onHeadUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const style: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y }
    : { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };

  return (
    <div className={`fdlg ${props.className ?? ""}`} style={style}>
      <div className="fdlg-head" onPointerDown={onHeadDown} onPointerMove={onHeadMove} onPointerUp={onHeadUp}>
        <span>{props.title}</span>
        <button className="fdlg-close" onClick={() => app.closeDialog(props.id)} title="Close">
          ✕
        </button>
      </div>
      {props.children}
    </div>
  );
}
