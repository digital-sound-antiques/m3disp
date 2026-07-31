import { Check, ChevronRight, ExpandMore } from "@mui/icons-material";
import { ReactNode, useState } from "react";

/** A menu row that expands in place into a radio-style sub-list of choices
 *  (used instead of a click-to-cycle toggle when the value has several options).
 *  Styled with the shared `.menu-*` classes; the header keeps showing the
 *  current value so you can read it without opening. */
export function MenuSelect<T extends string | number>(props: {
  icon: ReactNode;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  /** header highlight (e.g. "not the default"); defaults to false */
  active?: boolean;
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = props.options.find((o) => o.value === props.value);
  return (
    <>
      <button
        className={`menu-item${props.active ? " active" : ""}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="menu-ico">{props.icon}</span>
        <span className="menu-label">{props.label}</span>
        <span className="menu-state">{current?.label ?? String(props.value)}</span>
        <span className="menu-caret">
          {open ? <ExpandMore sx={{ fontSize: 16 }} /> : <ChevronRight sx={{ fontSize: 16 }} />}
        </span>
      </button>
      {open && (
        <div className="menu-sublist">
          {props.options.map((o) => {
            const sel = o.value === props.value;
            return (
              <button
                key={String(o.value)}
                className={`menu-item menu-subitem${sel ? " active" : ""}`}
                onClick={() => {
                  props.onChange(o.value);
                  setOpen(false);
                }}
              >
                <span className="menu-ico">{sel ? <Check sx={{ fontSize: 16 }} /> : null}</span>
                <span className="menu-label">{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
