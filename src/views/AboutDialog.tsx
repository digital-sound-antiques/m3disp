import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  Stack,
  Typography,
} from "@mui/material";
import { useContext } from "react";
import { AppContext } from "../contexts/AppContext";

import logo from "../assets/m3disp.svg";

export function AboutDialog() {
  const app = useContext(AppContext);
  const acknowledgements = [
    "MGSDRV by GIGAMIX/Ain",
    "KINROU5 by Keiichi Kuroda",
    "OPLLDriver by Ring",
    "MPK by K-KAZ",
    "MoonBlaster by Moonsoft",
  ];
  return (
    <Dialog open={app.isOpen("about-dialog")}>
      <DialogContent sx={{ minWidth: "288px", backgroundColor: "background.paper" }}>
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
          <img src={logo} />
          <Typography variant="caption">Copyright (c) 2023 Digital Sound Antiques</Typography>
          <br />
          <Typography variant="caption">
            This software uses following MSX driver binaries.
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
            {acknowledgements.map((e) => (
              <Typography key={e} variant="caption">{e}</Typography>
            ))}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ backgroundColor: "background.paper" }}>
        <Button onClick={() => app.closeDialog("about-dialog")}>Ok</Button>
      </DialogActions>
    </Dialog>
  );
}
