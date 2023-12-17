import { ChangeEvent, useContext, useState } from "react";
import { AppContext } from "../contexts/AppContext";
import { Box, Button, Dialog, DialogActions, DialogContent, TextField } from "@mui/material";
import { PlayerContext } from "../contexts/PlayerContext";
import { loadEntriesFromUrl } from "../utils/load-urls";
import { AppProgressContext } from "../contexts/AppProgressContext";

export function OpenUrlDialog() {
  const app = useContext(AppContext);
  const progress = useContext(AppProgressContext);
  const context = useContext(PlayerContext);
  const id = "open-url-dialog";

  const [url, setUrl] = useState<string | null>(null);

  const onChange = (evt: ChangeEvent<HTMLInputElement>) => {
    setUrl(evt.target.value);
  };
  const onOk = async () => {
    app.closeDialog(id);
    if (url != null) {
      const entries = await loadEntriesFromUrl(url, context.storage, progress.setProgress);
      context.reducer.setEntries(entries);
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
          <TextField label="URL" variant="standard" onChange={onChange} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => app.closeDialog(id)}>Cancel</Button>
        <Button onClick={onOk}>Ok</Button>
      </DialogActions>
    </Dialog>
  );
}
