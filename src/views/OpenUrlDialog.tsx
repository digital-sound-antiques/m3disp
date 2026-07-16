import { useContext, useState } from "react";
import { AppContext } from "../contexts/AppContext";
import { AppProgressContext } from "../contexts/AppProgressContext";
import { PlayerContext } from "../contexts/PlayerContext";
import { loadEntriesFromUrl } from "../utils/loader";
import { FloatingDialog } from "./FloatingDialog";

export function OpenUrlDialog() {
  const app = useContext(AppContext);
  const progress = useContext(AppProgressContext);
  const context = useContext(PlayerContext);
  const id = "open-url-dialog";

  const [url, setUrl] = useState("");

  const onOk = async () => {
    app.closeDialog(id);
    if (url.length > 0) {
      const entries = await loadEntriesFromUrl(url, context.storage, progress.setProgress);
      context.reducer.addEntries(entries, entries.length);
    }
  };

  return (
    <FloatingDialog id={id} title="Open URL" className="fdlg-input-dlg">
      <div className="crd-body">
        <label className="crd-field-label">URL</label>
        <input
          className="fdlg-input"
          type="text"
          value={url}
          autoFocus
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onOk();
          }}
        />
      </div>
      <div className="fdlg-foot">
        <button className="fdlg-txtbtn" onClick={() => app.closeDialog(id)}>
          Cancel
        </button>
        <button className="fdlg-txtbtn" onClick={onOk}>
          OK
        </button>
      </div>
    </FloatingDialog>
  );
}
