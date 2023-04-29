import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  Typography
} from "@mui/material";
import { useContext } from "react";
import { AppContext } from "../contexts/AppContext";

import logo from "../assets/m3disp.svg";
import packageJson from "../../package.json";

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
          <Box sx={{ p:1 }}><img src={logo} width="128px" /></Box>
          <Typography variant="caption">A realtime MSX sound player for the Web<br/></Typography>
          <Typography variant="caption">v{packageJson.version}<br/></Typography>
          <Typography variant="caption">
            This software uses following drivers.
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
            {acknowledgements.map((e) => (
              <Typography key={e} variant="caption">
                {e}
              </Typography>
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
