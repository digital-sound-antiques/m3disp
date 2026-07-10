import { useContext, useEffect } from "react";
import { AppContext } from "../contexts/AppContext";
import { KeyboardList } from "../widgets/KeyboardList";

export const keyboardDialogId = "keyboard-dialog";

export function KeyboardDialog() {
  const app = useContext(AppContext);
  const open = app.isOpen(keyboardDialogId);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") app.closeDialog(keyboardDialogId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, app]);

  if (!open) return null;

  return (
    <div className="kbd-overlay" onClick={() => app.closeDialog(keyboardDialogId)}>
      <div className="kbd-panel" onClick={(e) => e.stopPropagation()}>
        <div className="kbd-panel-head">
          <span>Keyboard</span>
          <button className="kbd-close" onClick={() => app.closeDialog(keyboardDialogId)} title="Close">
            ✕
          </button>
        </div>
        <div className="kbd-panel-body">
          <KeyboardList />
        </div>
      </div>
    </div>
  );
}
