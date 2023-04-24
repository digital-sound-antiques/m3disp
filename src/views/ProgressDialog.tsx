import { Box, Dialog, DialogContent, LinearProgress } from "@mui/material";
import { PlayerContext } from "../contexts/PlayerContext";
import { useContext } from "react";
import { AppProgressContext } from "../contexts/AppProgressContext";

export function AppProgressDialog() {
  const context = useContext(AppProgressContext);
  return (
    <Dialog open={context.progress != null}>
      <DialogContent>
        <Box sx={{ width: "256px" }}>
          <LinearProgress variant="determinate" value={(context.progress ?? 0) * 100} />
        </Box>
      </DialogContent>
    </Dialog>
  );
}
