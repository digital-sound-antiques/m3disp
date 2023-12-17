import { Close, LibraryMusic } from "@mui/icons-material";
import {
  AppBar,
  Dialog,
  DialogActions,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme
} from "@mui/material";
import { useContext } from "react";
import { AppContext } from "../contexts/AppContext";
import { AppProgressContext } from "../contexts/AppProgressContext";
import { PlayerContext } from "../contexts/PlayerContext";
import { loadFilesFromUrls } from "../utils/loader";

function getUrls(id: string) {
  const res: string[] = [];
  if (id == "ys") {
    for (let i = 1; i < 30; i++) {
      res.push(
        `https://raw.githubusercontent.com/mmlbox/ys2413/main/fm_psg/mgs/ys1ex_${
          i < 10 ? "0" + i : i
        }.mgs`
      );
    }
  } else if (id == "ys2") {
    for (let i = 0; i <= 30; i++) {
      res.push(
        `https://raw.githubusercontent.com/mmlbox/ys2413/main/fm_psg/mgs/ys2ex_${
          i < 10 ? "0" + i : i
        }.mgs`
      );
    }
  } else if (id == "ys3") {
    for (let i of [2, 17, 21, 29]) {
      res.push(
        `https://raw.githubusercontent.com/mmlbox/ys2413/main/fm_psg/mgs/ys368_${
          i < 10 ? "0" + i : i
        }.mgs`
      );
    }
  } else if (id == "sor") {
    for (let i = 0; i <= 60; i++) {
      res.push(
        `https://raw.githubusercontent.com/mmlbox/sor2413/main/fm_psg/mgs/en/soe${
          i < 10 ? "00" + i : "0" + i
        }.mgs`
      );
    }
  } else if (id == "bwv816") {
    for (let i = 1; i <= 7; i++) {
      res.push(`https://raw.githubusercontent.com/mmlbox/bwv816/main/bwv816_${i}.mgs`);
    }
  } else if (id == "ntt") {
    res.push(...["./mgs/captain.mgs", "./mgs/captain2.mgs"]);
  }
  return res;
}

const vanillaEntries = [
  {
    id: "ntt",
    title: "80's CAPTAIN SYSTEM MUSIC",
    desc: "Author Unknown",
  },
  {
    id: "bwv816",
    title: "Französische Suiten Nr.5 BWV816",
    desc: "J.S. Bach",
  },
];

const falcomEntries = [
  {
    id: "ys",
    title: "YS",
    desc: "Music from YS / (C) Nihon Falcom Corporation",
  },
  {
    id: "ys2",
    title: "YS II",
    desc: "Music from YSII / (C) Nihon Falcom Corporation",
  },
  // { id: "ys3", title: "YS III", desc: "Music from YSIII / (C) Nihon Falcom Corporation" },
  {
    id: "sor",
    title: "SORCERIAN",
    desc: "Music from SORCERIAN / (C) Nihon Falcom Corporation",
  },
];

export function SampleDialog() {
  const app = useContext(AppContext);
  const context = useContext(PlayerContext);

  const p = useContext(AppProgressContext);

  const onClickItem = async (id: string) => {
    await context.unmute();
    app.closeDialog("sample-dialog");
    const entries = await loadFilesFromUrls(getUrls(id), context.storage, p.setProgress);
    context.reducer.stop();
    context.reducer.setEntries(entries);
    context.reducer.play(0);     
  };

  const handleClose = () => app.closeDialog("sample-dialog");

  const theme = useTheme();
  const isXs = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <Dialog open={app.isOpen("sample-dialog")} fullScreen={isXs}>
      <AppBar sx={{ position: "relative" }}>
        <Toolbar>
          <IconButton edge="start" color="inherit" onClick={handleClose} aria-label="close">
            <Close />
          </IconButton>
          <Typography sx={{ ml: 2, flex: 1 }} variant="h6" component="div">
            Samples
          </Typography>
        </Toolbar>
      </AppBar>
      <List sx={{ mt: 2 }}>
        <ListSubheader>Vanilla YM2413</ListSubheader>
        {vanillaEntries.map((e) => (
          <ListItem key={e.id} disablePadding>
            <ListItemButton onClick={() => onClickItem(e.id)}>
              <ListItemIcon>
                <LibraryMusic />
              </ListItemIcon>
              <ListItemText primary={e.title} secondary={e.desc} />
            </ListItemButton>
          </ListItem>
        ))}
        <ListSubheader>VGMs, YM2413+PSG</ListSubheader>
        {falcomEntries.map((e) => (
          <ListItem key={e.id} disablePadding>
            <ListItemButton onClick={() => onClickItem(e.id)}>
              <ListItemIcon>
                <LibraryMusic />
              </ListItemIcon>
              <ListItemText primary={e.title} secondary={e.desc} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <Divider sx={{ mb: 2 }} />
      <Typography variant="caption" sx={{ mx: 2 }}>
        These songs are published in accordance with Falcom's Free Music Use Declaration.
      </Typography>
      <DialogActions></DialogActions>
    </Dialog>
  );
}
