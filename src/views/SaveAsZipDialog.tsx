import { useContext, useState } from "react";
import { AppContext } from "../contexts/AppContext";
import { AppProgressContext } from "../contexts/AppProgressContext";
import { PlayerContext } from "../contexts/PlayerContext";
import { saveEntriesAsZip } from "../utils/saver";
import { FloatingDialog } from "./FloatingDialog";

export function SaveAsZipDialog() {
  const app = useContext(AppContext);
  const context = useContext(PlayerContext);
  const progress = useContext(AppProgressContext);
  const id = "save-as-zip-dialog";

  const [zipName, setZipName] = useState("m3disp.zip");

  const onExport = async () => {
    if (zipName.length > 0) {
      saveEntriesAsZip(zipName, context.entries, context.storage, progress.setProgress);
      app.closeDialog(id);
    }
  };

  return (
    <FloatingDialog id={id} title="Save as ZIP" className="fdlg-input-dlg">
      <div className="crd-body">
        <label className="crd-field-label">Filename</label>
        <input
          className="fdlg-input"
          type="text"
          value={zipName}
          autoFocus
          onChange={(e) => setZipName(e.target.value.trim())}
          onKeyDown={(e) => {
            if (e.key === "Enter") onExport();
          }}
        />
      </div>
      <div className="fdlg-foot">
        <button className="fdlg-txtbtn" onClick={() => app.closeDialog(id)}>
          Cancel
        </button>
        <button className="fdlg-txtbtn" disabled={zipName.length === 0} onClick={onExport}>
          Export
        </button>
      </div>
    </FloatingDialog>
  );
}
