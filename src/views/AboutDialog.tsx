import { Button, Dialog, DialogActions, DialogContent } from "@mui/material";
import { useContext } from "react";
import { AppContext } from "../contexts/AppContext";

import logo from "../assets/m3disp.svg";

export function AboutDialog() {
  const app = useContext(AppContext);
  return (
    <Dialog open={app.isOpen("about-dialog")}>
      <DialogContent>
        <img src={logo} />
      </DialogContent>
      <DialogActions>
        <Button onClick={()=>app.closeDialog('about-dialog')}>Ok</Button>
      </DialogActions>
    </Dialog>
  );
}
