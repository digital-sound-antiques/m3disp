import { useContext } from "react";
import { AppProgressContext } from "../contexts/AppProgressContext";

export function AppProgressDialog() {
  const context = useContext(AppProgressContext);
  if (context.progress == null) return null;
  const indeterminate = context.progress === 0;
  return (
    <div
      className="fdlg fdlg-progress"
      style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
    >
      <div className="prg-track">
        <div
          className={`prg-bar${indeterminate ? " indeterminate" : ""}`}
          style={indeterminate ? undefined : { width: `${(context.progress ?? 1) * 100}%` }}
        />
      </div>
    </div>
  );
}
