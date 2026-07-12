import { HelpOutline, InfoOutlined, MoreVert, RestartAlt, Settings } from "@mui/icons-material";
import { useContext, useEffect, useRef, useState } from "react";
import { AppContext } from "../contexts/AppContext";

/** App-wide options dropdown (the ⋮ button in the header). Plain React, styled
 *  with the shared `.menu-*` classes to match the piano-roll / playlist menus. */
export function OptionMenu() {
  const app = useContext(AppContext);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="opt-menu-wrap" ref={ref}>
      <button
        className={`hbtn${open ? " active" : ""}`}
        title="Options"
        onClick={() => setOpen((o) => !o)}
      >
        <MoreVert sx={{ fontSize: 20 }} />
      </button>
      {open && (
        <div className="opt-menu">
          <div className="menu-list">
            <button
              className="menu-item"
              onClick={() => {
                setOpen(false);
                app.openDialog("settings-dialog");
              }}
            >
              <span className="menu-ico">
                <Settings sx={{ fontSize: 18 }} />
              </span>
              <span className="menu-label">Settings</span>
            </button>
            <button
              className="menu-item"
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(new Event("m3disp:reset-layout"));
              }}
            >
              <span className="menu-ico">
                <RestartAlt sx={{ fontSize: 18 }} />
              </span>
              <span className="menu-label">Reset Window Layout</span>
            </button>
            <div className="menu-sep" />
            <a
              className="menu-item"
              href="https://github.com/digital-sound-antiques/m3disp/wiki"
              target="help"
              rel="noreferrer"
              onClick={() => setOpen(false)}
            >
              <span className="menu-ico">
                <HelpOutline sx={{ fontSize: 18 }} />
              </span>
              <span className="menu-label">Help</span>
            </a>
            <button
              className="menu-item"
              onClick={() => {
                setOpen(false);
                app.openDialog("about-dialog");
              }}
            >
              <span className="menu-ico">
                <InfoOutlined sx={{ fontSize: 18 }} />
              </span>
              <span className="menu-label">About</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
