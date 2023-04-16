import * as React from "react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { default as MenuIcon } from "@mui/icons-material/Menu";
import { KSSPlayer } from "./kss/kss-player";
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
  Card,
  Divider,
} from "@mui/material";

import "./App.css";
import { PlayControl, PlayControlCard } from "./PlayerControl";
import { PlayList, PlayListCard } from "./PlayList";
import { KeyboardList } from "./KeyboardList";
import { WaveSliderCard } from "./WavePreview";
import { FileDropContext } from "./FileDropContext";
import { MoreVert } from "@mui/icons-material";
import { VolumeCard } from "./VolumeCard";
import { TimeSlider } from "./TimeSlider";

const context = new AudioContext();
const player = new KSSPlayer("worklet");

const appTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#00D0BE",
      // main: "#0080FF",
    },
    secondary: {
      main: "#FF66BA",
    },
    background: {
      default: "#121212",
      paper: "#404040",
    },
  },
  breakpoints: {
    values: {
      xs: 0,
      sm: 600,
      md: 960,
      lg: 1200,
      xl: 1536,
    },
  },
});

const gap = { xs: 0, sm: 1, md: 1.5, lg: 2 };

export function App() {
  const theme = useTheme();
  const isXs = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      {isXs ? <AppRootMobile /> : <AppRootDesktop />}
    </ThemeProvider>
  );
}

function AppRootMobile() {
  return (
    <FileDropContext>
      <Box sx={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, margin: 2 }}>
        <Card sx={{ height: "100%", borderRadius: "22px" }}>
          <Toolbar variant="dense">
            <IconButton edge="start" color="inherit" aria-label="menu" sx={{ mr: 2 }}>
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" color="inherit" component="div" sx={{ flexGrow: 1 }}>
              M3disp
            </Typography>
            <IconButton edge="end">
              <MoreVert />
            </IconButton>
          </Toolbar>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              position: "absolute",
              top: 48,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          >
            <KeyboardList spacing={0} />
            <TimeSlider/>
            <PlayControl small={true} />
            <Box sx={{ pt: 2 }} />
            <Divider />
            <Box sx={{ position: "relative", flexGrow: 1 }}>
              <PlayList toolbarAlignment="bottom" />
            </Box>
          </Box>
        </Card>
      </Box>
    </FileDropContext>
  );
}

function DesktopAppBar() {
  return (
    <AppBar component="nav" sx={{ backgroundColor: appTheme.palette.background.default }}>
      <Container maxWidth="xl" sx={{ minWidth: "320px" }}>
        <Toolbar variant="regular">
          <IconButton edge="start" color="inherit" aria-label="menu" sx={{ mr: 2 }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" color="inherit" component="div">
            M3disp
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <IconButton edge="end">
            <MoreVert />
          </IconButton>
        </Toolbar>
      </Container>
    </AppBar>
  );
}

function AppRootDesktop() {
  const [panelHeight, setPanelHeight] = React.useState<number | null>(null);
  const leftPaneRef = React.useRef<HTMLDivElement>(null);

  const onResize = () => setPanelHeight(leftPaneRef.current!.clientHeight);
  const resizeObserver = new ResizeObserver(onResize);
  React.useEffect(() => {
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
            <Grid xs={12} sm={7} md={8}>
              <Stack ref={leftPaneRef} sx={{ gap }}>
                <KeyboardList spacing={gap} />
                <WaveSliderCard />
              </Stack>
            </Grid>
            <Grid xs={12} sm={5} md={4}>
              <Stack
                sx={{
                  gap,
                  height: panelHeight,
                }}
              >
                <VolumeCard />
                <PlayControlCard />
                <PlayListCard />
              </Stack>
            </Grid>
          </Grid>
        </FileDropContext>
        <Divider sx={{ marginY: 2 }} />
        <Box
          component="footer"
          sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}
        >
          <Typography variant="caption">
            M3disp - Copyright (C) 2023 Digital Sound Antiques.
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}
