import { Box, Button, Dialog, DialogActions, DialogContent, TextField } from "@mui/material";
import { ChangeEvent, useContext, useState } from "react";
import { AppContext } from "../contexts/AppContext";
import { AppProgressContext } from "../contexts/AppProgressContext";
import { PlayerContext } from "../contexts/PlayerContext";
import { saveEntriesAsZip } from "../utils/saver";

export function SaveAsZipDialog() {
  const app = useContext(AppContext);
  const context = useContext(PlayerContext);
  const progress = useContext(AppProgressContext);

  const id = "save-as-zip-dialog";

  const [zipName, setZipName] = useState<string>("m3disp.zip");

  const onChange = (evt: ChangeEvent<HTMLInputElement>) => {
    setZipName(evt.target.value.trim());
  };

  const onExport = async () => {
    if (zipName.length > 0) {
      saveEntriesAsZip(zipName, context.entries, context.storage, progress.setProgress);
      app.closeDialog(id);
    }
  };

  return (
    <Dialog open={app.isOpen(id)}>
      <DialogContent>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            minWidth: "288px",
          }}
        >
          <TextField label="Filename" variant="standard" value={zipName} onChange={onChange} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => app.closeDialog(id)}>Cancel</Button>
        <Button disabled={zipName.length == 0} onClick={onExport}>Export</Button>
      </DialogActions>
    </Dialog>
  );
}
