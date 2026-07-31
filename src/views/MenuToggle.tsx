import { ReactNode } from "react";

/** A menu row whose on/off state is shown as a small switch (the whole row is
 *  the toggle button). Replaces the plain "ON/OFF" text state. */
export function MenuToggle(props: {
  icon: ReactNode;
  label: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button className={`menu-item${props.on ? " active" : ""}`} onClick={props.onToggle}>
      <span className="menu-ico">{props.icon}</span>
      <span className="menu-label">{props.label}</span>
      <span className={`menu-switch${props.on ? " on" : ""}`} aria-hidden>
        <span className="menu-switch-knob" />
      </span>
    </button>
  );
}
