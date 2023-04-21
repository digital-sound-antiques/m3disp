import { ThemeProvider, useTheme } from "@mui/material/styles";

import MenuIcon from "@mui/icons-material/Menu";

import {
  AppBar,
  Box,
  Container,
  CssBaseline,
  IconButton,
  Toolbar,
  Typography,
  Unstable_Grid2 as Grid,
  Stack,
  Divider,
  useMediaQuery,
} from "@mui/material";

import "./App.css";
import { PlayControl, PlayControlCard } from "./PlayerControl";
import { PlayList, PlayListCard } from "./PlayList";
import { KeyboardList } from "./KeyboardList";
import { WaveSliderCard } from "./WavePreview";
import { FileDropContext } from "./FileDropContext";
import { MoreVert } from "@mui/icons-material";
import { VolumeControl } from "./VolumeControl";
import { PlayerContext } from "./PlayerContext";
import { SettingsDialog } from "./SettingsDialog";
import { AppContext } from "./AppContext";
import { Fragment, useContext, useEffect, useRef, useState } from "react";
import { OptionMenu } from "./OptionMenu";

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

function AppRoot() {
  const theme = useTheme();
  const isXs = useMediaQuery(theme.breakpoints.down("sm"));
  return (
    <Fragment>
      <SettingsDialog id="settings-dialog" />
      <OptionMenu id="option-menu" />
      {isXs ? <AppRootMobile /> : <AppRootDesktop />};
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
        <IconButton edge="start" color="inherit" aria-label="menu" sx={{ mr: 2 }}>
          <MenuIcon />
        </IconButton>
        <Box sx={{ flexGrow: 1 }}></Box>
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
          <PlayList />
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
          <IconButton edge="start" color="inherit" aria-label="menu" sx={{ mr: 2 }}>
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
              Speaker Latency: {context.player.outputLatency}ms
            </Typography>
          </Stack>
        </Box>
      </Container>
    </Box>
  );
}
