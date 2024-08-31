import { Divider, Link, Menu, MenuItem } from "@mui/material";
import { AppContext } from "../contexts/AppContext";
import { useContext } from "react";

export function OptionMenu(props: { id: string }) {
  const app = useContext(AppContext);
  return (
    <Menu
      open={app.isOpen(props.id)}
      anchorEl={app.anchorElMap[props.id]}
      onClose={() => {
        app.closePopup(props.id);
      }}
    >
      <MenuItem
        onClick={() => {
          app.closePopup(props.id);
          app.openDialog("settings-dialog");
        }}
      >
        Settings
      </MenuItem>
      <Divider />
      <MenuItem>
        <Link href="https://github.com/digital-sound-antiques/m3disp/wiki" target="help" underline="none" color="white">
          Help
        </Link>
      </MenuItem>
      <MenuItem
        onClick={() => {
          app.closePopup(props.id);
          app.openDialog("about-dialog");
        }}
      >
        About
      </MenuItem>
    </Menu>
  );
}
