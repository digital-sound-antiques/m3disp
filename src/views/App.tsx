import { ThemeProvider, useTheme } from "@mui/material/styles";

import MenuIcon from "@mui/icons-material/Menu";

import {
  AppBar,
  Box,
  Container,
  CssBaseline,
  Divider,
  Drawer,
  Unstable_Grid2 as Grid,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";

import { Info, MoreVert } from "@mui/icons-material";
import { Fragment, useContext, useEffect, useRef, useState } from "react";
import { AppContext } from "../contexts/AppContext";
import { FileDropContext } from "../contexts/FileDropContext";
import { PlayerContext } from "../contexts/PlayerContext";
import { KeyboardList } from "../widgets/KeyboardList";
import { VolumeControl } from "../widgets/VolumeControl";
import { WaveSliderCard } from "../widgets/WavePreview";
import "./App.css";
import { OptionMenu } from "./OptionMenu";
import { PlayListCard, PlayListView } from "./PlayListView";
import { PlayControl, PlayControlCard } from "./PlayerControl";
import { AppProgressDialog } from "./ProgressDialog";
import { SettingsDialog } from "./SettingsDialog";

import logo from "..//assets/m3disp.svg";
import { AppProgressContextProvider } from "../contexts/AppProgressContext";
import { AboutDialog } from "./AboutDialog";

const gap = { xs: 0, sm: 1, md: 1.5, lg: 2 };

export function App() {
  const app = useContext(AppContext);
  return (
    <ThemeProvider theme={app.theme}>
      <CssBaseline />
      <AppRoot />
    </ThemeProvider>
  );
}

function AppDrawer({ id }: { id: string }) {
  const app = useContext(AppContext);
  return (
    <Drawer
      anchor="left"
      open={app.isOpen(id)}
      onClose={() => app.closeDialog(id)}
      sx={{ minWidth: "388px" }}
    >
      <List disablePadding>
        <Box
          sx={{
            py: 1,
            display: "flex",
            justifyContent: "center",
            aspectRatio: "16/9",
            backgroundColor: "background.default",
          }}
        >
          <img src={logo} alt="m3disp" />
        </Box>
        <ListItem key="about" disablePadding>
          <ListItemButton>
            <ListItemIcon>
              <Info />
            </ListItemIcon>
            <ListItemText>About</ListItemText>
          </ListItemButton>
        </ListItem>
      </List>
    </Drawer>
  );
}

function AppRoot() {
  const theme = useTheme();
  const isXs = useMediaQuery(theme.breakpoints.down("sm"));
  return (
    <Fragment>
      <SettingsDialog id="settings-dialog" />
      <OptionMenu id="option-menu" />
      <AboutDialog />
      <AppProgressDialog />
      {isXs ? <AppRootMobile /> : <AppRootDesktop />}
      <AppDrawer id="app-drawer" />
    </Fragment>
  );
}

function MobileAppBar() {
  const theme = useTheme();
  const app = useContext(AppContext);
  const moreIconRef = useRef(null);

  return (
    <AppBar component="nav" sx={{ backgroundColor: theme.palette.background.default }}>
      <Toolbar>
        <IconButton
          edge="start"
          color="inherit"
          aria-label="menu"
          sx={{ mr: 2 }}
          onClick={() => app.openDialog("app-drawer")}
        >
          <MenuIcon />
        </IconButton>
        <Box sx={{ flexGrow: 1 }}></Box>
        <IconButton
          ref={moreIconRef}
          edge="end"
          onClick={() => {
            app.openPopup("option-menu", moreIconRef.current!);
          }}
        >
          <MoreVert />
        </IconButton>
      </Toolbar>
    </AppBar>
  );
}

function AppRootMobile() {
  return (
    <Box sx={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}>
      <MobileAppBar />
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "#444",
        }}
      >
        <Toolbar />
        <KeyboardList spacing={0} />
        <Box sx={{ position: "relative", flexGrow: 1 }}>
          <PlayListView />
        </Box>
        <Box sx={{ p: 1, boxShadow: "0 0 2px 0px #00000080" }}>
          <PlayControl small={true} />
        </Box>
      </Box>
    </Box>
  );
}

function DesktopAppBar() {
  const theme = useTheme();
  const moreIconRef = useRef(null);
  const app = useContext(AppContext);

  return (
    <AppBar component="nav" sx={{ backgroundColor: theme.palette.background.default }}>
      <Container maxWidth="xl" sx={{ minWidth: "320px" }}>
        <Toolbar variant="regular">
          <IconButton
            edge="start"
            color="inherit"
            aria-label="menu"
            sx={{ mr: 2 }}
            onClick={() => app.openDialog("app-drawer")}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" color="inherit" component="div">
            M<sub>3</sub>disp
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Box sx={{ width: "128px", mx: 2 }}>
            <VolumeControl />
          </Box>
          <IconButton
            ref={moreIconRef}
            edge="end"
            onClick={() => {
              app.openPopup("option-menu", moreIconRef.current!);
            }}
          >
            <MoreVert />
          </IconButton>
        </Toolbar>
      </Container>
    </AppBar>
  );
}

function AppRootDesktop() {
  const context = useContext(PlayerContext);
  const [panelHeight, setPanelHeight] = useState<number | null>(null);
  const leftPaneRef = useRef<HTMLDivElement>(null);

  const onResize = () => setPanelHeight(leftPaneRef.current!.clientHeight);
  const resizeObserver = new ResizeObserver(onResize);
  useEffect(() => {
    resizeObserver.observe(leftPaneRef.current!);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        alignItems: "center",
      }}
    >
      <DesktopAppBar />
      <Container
        component="main"
        maxWidth="xl"
        sx={{
          minWidth: "320px",
          mt: { sm: 2, md: 4, lg: 6 },
          paddingX: { xs: 0, sm: 2, md: 6, lg: 8 },
        }}
      >
        <Toolbar />
        <FileDropContext>
          <Grid container spacing={gap} sx={{ height: "100%" }}>
            <Grid xs={12} sm={7} md={8} lg={8.5} xl={9}>
              <Stack ref={leftPaneRef} spacing={gap}>
                <KeyboardList spacing={gap} />
              </Stack>
            </Grid>
            <Grid xs={12} sm={5} md={4} lg={3.5} xl={3}>
              <Stack
                sx={{
                  gap,
                  minHeight: { sm: "580px", md: null },
                  height: panelHeight,
                }}
              >
                <WaveSliderCard />
                <PlayControlCard />
                <PlayListCard />
              </Stack>
            </Grid>
          </Grid>
        </FileDropContext>
        <Divider sx={{ mt: 4, mb: 2 }} />
        <Box
          component="footer"
          sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}
        >
          <Stack direction="row" sx={{ width: "100%", justifyContent: "space-between" }}>
            <Typography variant="caption">
              M<sub>3</sub>disp - Copyright (C) 2023 Digital Sound Antiques.
            </Typography>
            <Typography variant="caption">
              Audio Latency: {context.player.outputLatency}ms
            </Typography>
          </Stack>
        </Box>
      </Container>
    </Box>
  );
}
