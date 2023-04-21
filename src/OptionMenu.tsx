import { useTheme } from "@emotion/react";
import { Menu, MenuItem } from "@mui/material";
import { AppContext } from "./AppContext";
import { useContext } from "react";

export function OptionMenu(props: { id: string }) {
  const app = useContext(AppContext);
  return (
    <Menu
      open={app.isOpen(props.id)}
      anchorEl={app.anchorElMap[props.id]}
      onClick={() => {
        app.closePopup(props.id);
        app.openDialog('settings-dialog');
      }}
      onClose={() => {
        app.closePopup(props.id);
      }}
    >
      <MenuItem>Settings</MenuItem>
    </Menu>
  );
}
