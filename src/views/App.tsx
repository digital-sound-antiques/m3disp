import { ThemeProvider, useTheme } from "@mui/material/styles";

import {
  AppBar,
  Box,
  Container,
  CssBaseline,
  Divider,
  Unstable_Grid2 as Grid,
  IconButton,
  Stack,
  Tab,
  Tabs,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";

import { MoreVert } from "@mui/icons-material";
import React, { Fragment, useContext, useEffect, useRef, useState } from "react";
import { AppContext } from "../contexts/AppContext";
import { FileDropContext } from "../contexts/FileDropContext";
import { PlayerContext } from "../contexts/PlayerContext";
import { KeyboardList } from "../widgets/KeyboardList";
import { VolumeControl } from "../widgets/VolumeControl";
import { WaveSliderCard } from "../widgets/WavePreview";
import "./App.css";
import { AppProgressDialog } from "./AppProgressDialog";
import { OptionMenu } from "./OptionMenu";
import { PlayListCard, PlayListView } from "./PlayListView";
import { PlayControl, PlayControlCard } from "./PlayerControl";
import { SettingsDialog } from "./SettingsDialog";

import packageJson from "../../package.json";
import ghlogo from "../assets/github-mark-white.svg";
import { PianoRoll } from "../widgets/PianoRoll";
import { PianoRollControl } from "../widgets/PianoRollControl";
import { TimeSlider } from "../widgets/TimeSlider";
import { AboutDialog } from "./AboutDialog";
import { OpenUrlDialog } from "./OpenUrlDialog";
import { SampleDialog } from "./SampleDialog";

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
      <AboutDialog />
      <AppProgressDialog />
      <OpenUrlDialog />
      <SampleDialog />
      {isXs ? <AppRootMobile /> : <AppRootDesktop />}
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
        <Typography variant="h6" component="div">
          M<sup>3</sup>disp
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <IconButton
          ref={moreIconRef}
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
    <Box sx={{ position: "fixed", top: 0, bottom: 0, left: 0, right: 0 }}>
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
        }}
      >
        <Toolbar />
        <KeyboardList spacing={0} />
        <TimeSlider />
        <Box sx={{ p: 1, boxShadow: "0 0 2px 0px #00000080" }}>
          <PlayControl small={true} />
        </Box>
        <Box sx={{ position: "relative", flexGrow: 1 }}>
          <PlayListView toolbarAlignment="bottom" />
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
          <Typography variant="h6" color="inherit" component="div">
            M<sup>3</sup>disp
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
  const appContext = useContext(AppContext);
  const context = useContext(PlayerContext);
  const [panelHeight, setPanelHeight] = useState<number | null>(null);
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const onResize = () => setPanelHeight(leftPaneRef.current!.clientHeight);
  const resizeObserver = new ResizeObserver(onResize);

  const theme = useTheme();
  const isMd = useMediaQuery(theme.breakpoints.down("md"));

  useEffect(() => {
    resizeObserver.observe(leftPaneRef.current!);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const [tabIndex, setTabIndex] = useState(0);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabIndex(newValue);
  };

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
          mt: { sm: 2, md: 2, lg: 4 },
          paddingX: { xs: 0, sm: 2, md: 6, lg: 8 },
        }}
      >
        <Toolbar />
        <FileDropContext>
          <Grid container spacing={gap} sx={{ height: "100%" }}>
            <Grid xs={12} sm={7} md={8} lg={8} xl={8}>
              <Stack ref={leftPaneRef} spacing={gap}>
                <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
                  <Box sx={{ display: "flex", flexDirection: "row" }}>
                    <Tabs value={tabIndex} onChange={handleTabChange} sx={{ flex: 2 }}>
                      <Tab label="Keyboard" value={0} />
                      <Tab
                        label={<Typography variant="inherit">Piano Roll</Typography>}
                        value={1}
                      />
                    </Tabs>
                    <Box
                      sx={{ display: "flex", flex: 1, justifyContent: "end", alignItems: "center" }}
                    >
                      {tabIndex == 1 ? <PianoRollControl /> : null}
                    </Box>
                  </Box>
                </Box>
                <TabPanel value={tabIndex} index={0}>
                  <KeyboardList spacing={gap} />
                </TabPanel>
                <TabPanel value={tabIndex} index={1}>
                  <PianoRoll mode={appContext.pianoRollMode} />
                </TabPanel>
                {isMd ? <WaveSliderCard /> : null}
              </Stack>
            </Grid>
            <Grid xs={12} sm={5} md={4} lg={4} xl={4}>
              <Stack
                sx={{
                  gap,
                  height: panelHeight,
                }}
              >
                {!isMd ? <WaveSliderCard /> : null}
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
            <a href="https://github.com/digital-sound-antiques/m3disp" target="github">
              <img src={ghlogo} width={16} height={16} />
            </a>
            <Box sx={{ width: "12px" }}></Box>
            <Typography variant="caption">v{packageJson.version}</Typography>
            <Box sx={{ flex: 1 }}></Box>
            <Typography variant="caption">
              Output Latency: {context.player.outputLatency}ms
            </Typography>
          </Stack>
        </Box>
      </Container>
    </Box>
  );
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div role="tabpanel" hidden={value !== index} id={`tabpanel-${index}`} {...other}>
      {value === index && children}
    </div>
  );
}

function BetaSign() {
  return (
    <Typography variant="caption" sx={{ textTransform: "none" }}>
      (Beta)
    </Typography>
  );
}
