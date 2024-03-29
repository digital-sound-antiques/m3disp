import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  Divider,
  ListSubheader,
  MenuItem,
  Select,
  Tab,
  Tabs,
  Typography,
  useTheme,
} from "@mui/material";
import Grid2 from "@mui/material/Unstable_Grid2/Grid2";
import React, { Fragment, useContext, useState } from "react";
import { AppContext, KeyHighlightColorType } from "../contexts/AppContext";
import { SettingsContext, SettingsContextProvider } from "../contexts/SettingsContext";
import { ColorBall, ColorSelector } from "../widgets/ColorSelector";
import { NumberSelector } from "../widgets/NumberSelector";

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div role="tabpanel" hidden={value !== index} id={`simple-tabpanel-${index}`} {...other}>
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
}

function ChannelMaskSheet(props: {
  channels: string[];
  value: number;
  onChange: (ch: number, checked: boolean) => void;
}) {
  const { channels, value } = props;
  const widgets = [];

  for (let i = 0; i < channels.length; i++) {
    const channel = channels[i];
    const checked = (value & (1 << i)) == 0;
    widgets.push(
      <Grid2 xs={1} key={channel}>
        <Box
          sx={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "start",
            alignItems: "center",
          }}
        >
          <Checkbox
            size="small"
            checked={checked}
            onChange={(evt) => {
              props.onChange(i, evt.target.checked);
            }}
          />
          <Typography variant="caption">{channel}</Typography>
        </Box>
      </Grid2>
    );
  }
  return (
    <Grid2 container columns={3} sx={{ px: 2 }}>
      {widgets}
    </Grid2>
  );
}

function MaskPanel(props: TabPanelProps) {
  const psgs = ["PSG1", "PSG2", "PSG3"];
  const sccs = ["SCC1", "SCC2", "SCC3", "SCC4", "SCC5"];
  const oplls = ["OPLL1", "OPLL2", "OPLL3", "OPLL4", "OPLL5", "OPLL6", "OPLL7", "OPLL8", "OPLL9"];

  const context = useContext(SettingsContext);

  const onOpllChange = (ch: number, checked: boolean) => {
    let newMask;
    if (checked) {
      newMask = context.channelMask.opll &= ~(1 << ch);
    } else {
      newMask = context.channelMask.opll |= 1 << ch;
    }
    /* Copy FM mask to rhythm mask. */
    if (ch == 6) {
      // copy bit6 to bit 13
      const m = 1 << 13;
      if (newMask & (1 << 6)) {
        newMask |= m;
      } else {
        newMask &= ~m;
      }
    } else if (ch == 7) {
      // copy bit7 to bit 9, 12 (HH/SD)
      const m = (1 << 9) | (1 << 12);
      if (newMask & (1 << 7)) {
        newMask |= m;
      } else {
        newMask &= ~m;
      }
    } else if (ch == 8) {
      // copy bit8 to bit 10, 11 (CYM/TOM)
      const m = (1 << 10) | (1 << 11);
      if (newMask & (1 << 8)) {
        newMask |= m;
      } else {
        newMask &= ~m;
      }
    }
    context.setChannelMask({ ...context.channelMask, opll: newMask });
  };

  const onPsgChange = (ch: number, checked: boolean) => {
    let newMask;
    if (checked) {
      newMask = context.channelMask.psg &= ~(1 << ch);
    } else {
      newMask = context.channelMask.psg |= 1 << ch;
    }
    context.setChannelMask({ ...context.channelMask, psg: newMask });
  };

  const onSccChange = (ch: number, checked: boolean) => {
    let newMask;
    if (checked) {
      newMask = context.channelMask.scc &= ~(1 << ch);
    } else {
      newMask = context.channelMask.scc |= 1 << ch;
    }
    context.setChannelMask({ ...context.channelMask, scc: newMask });
  };

  return (
    <TabPanel value={props.value} index={props.index}>
      <ChannelMaskSheet value={context.channelMask.opll} channels={oplls} onChange={onOpllChange} />
      <Divider />
      <ChannelMaskSheet value={context.channelMask.psg} channels={psgs} onChange={onPsgChange} />
      <Divider />
      <ChannelMaskSheet value={context.channelMask.scc} channels={sccs} onChange={onSccChange} />
    </TabPanel>
  );
}

function ColorPanel(props: TabPanelProps) {
  const theme = useTheme();
  const app = useContext(AppContext);

  const [primaryColor, setPrimaryColor] = useState(theme.palette.primary.main);
  const [secondaryColor, setSecondaryColor] = useState(theme.palette.secondary.main);

  const updatePrimaryColor = (color: string) => {
    app.setPrimaryColor(color);
    setPrimaryColor(color);
  };
  const updateSecondaryColor = (color: string) => {
    app.setSecondaryColor(color);
    setSecondaryColor(color);
  };

  return (
    <TabPanel value={props.value} index={props.index}>
      <Box sx={{ px: { sm: 2 } }}>
        <ColorSelector
          label="Primary Color"
          variants={["200", "300", "400", "500"]}
          value={primaryColor}
          onChange={updatePrimaryColor}
        />
        <ColorSelector
          label="Accent Color"
          variants={["A100", "A200", "A400", "A700"]}
          value={secondaryColor}
          onChange={updateSecondaryColor}
        />
        <KeyColorTypeSelector value="primary" />
      </Box>
    </TabPanel>
  );
}

function PlayerPanel(props: TabPanelProps) {
  const context = useContext(SettingsContext);

  return (
    <TabPanel value={props.value} index={props.index}>
      <Box sx={{ px: { sm: 2 } }}>
        <NumberSelector
          label="Loop Count"
          values={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
          value={context.defaultLoopCount}
          onChange={context.setDefaultLoopCount}
        />
        <NumberSelector
          label="Maximum Duration"
          values={[120 * 1000, 180 * 1000, 300 * 1000, 600 * 1000, 900 * 1000, 1200 * 1000]}
          value={context.defaultDuration}
          valueLabelFn={(value) => `${(value / 60 / 1000).toFixed(0)} min.`}
          onChange={context.setDefaultDuration}
        />
      </Box>
    </TabPanel>
  );
}

function KeyColorTypeSelector(props: { value: KeyHighlightColorType }) {
  const theme = useTheme();
  const app = useContext(AppContext);

  const [value, setValue] = useState(app.keyHighlightColorType);

  const updateKeyHighlightColorType = (type: KeyHighlightColorType) => {
    app.setKeyHighlightColorType(type);
    setValue(type);
  };

  return (
    <Fragment>
      <ListSubheader>Keyboard Highlight</ListSubheader>
      <Box sx={{ mx: 2 }}>
        <Select
          fullWidth
          size="small"
          value={value}
          onChange={(evt) => updateKeyHighlightColorType(evt.target.value as KeyHighlightColorType)}
          renderValue={(value) => {
            return (
              <MenuItem sx={{ p: 0 }}>
                <ColorBall color={theme.palette[value].main} />
                <Typography>{value == "primary" ? "PrimaryColor" : "Accent Color"}</Typography>
              </MenuItem>
            );
          }}
        >
          {[
            { id: "primary", name: "PrimaryColor" },
            { id: "secondary", name: "Accent Color" },
          ].map((e) => {
            return (
              <MenuItem key={e.id} value={e.id}>
                <ColorBall color={theme.palette[e.id as KeyHighlightColorType].main} />
                <Typography>{e.name}</Typography>
              </MenuItem>
            );
          })}
        </Select>
      </Box>
    </Fragment>
  );
}

function SettingsDialogBody(props: { id: string }) {
  const app = useContext(AppContext);
  const settings = useContext(SettingsContext);
  const theme = useTheme();
  const [value, setValue] = useState(0);

  const [savedPrimaryColor] = useState(theme.palette.primary.main);
  const [savedSecondaryColor] = useState(theme.palette.secondary.main);
  const [savedKeyHighlightColorType] = useState(app.keyHighlightColorType);

  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
  };

  const onCancel = () => {
    app.setPrimaryColor(savedPrimaryColor);
    app.setSecondaryColor(savedSecondaryColor);
    app.setKeyHighlightColorType(savedKeyHighlightColorType);
    app.closeDialog(props.id);
    settings.revert();
  };
  const onOk = () => {
    app.closeDialog(props.id);
    settings.commit();
  };

  return (
    <Fragment>
      <DialogContent
        sx={{
          minWidth: "300px",
          width: { sm: "480px" },
          height: { xs: "480px", sm: "520px" },
          p: 1,
          backgroundColor: "background.paper",
        }}
      >
        <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Tabs value={value} onChange={handleChange} variant="fullWidth">
            <Tab label="Player" />
            <Tab label="Theme" />
            <Tab label="Channels" />
          </Tabs>
        </Box>
        <PlayerPanel value={value} index={0} />
        <ColorPanel value={value} index={1} />
        <MaskPanel value={value} index={2} />
      </DialogContent>
      <DialogActions sx={{ backgroundColor: "background.paper" }}>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={onOk}>Ok</Button>
      </DialogActions>
    </Fragment>
  );
}

export function SettingsDialog(props: { id: string }) {
  const app = useContext(AppContext);
  return (
    <SettingsContextProvider>
      <Dialog open={app.isOpen(props.id)}>
        <SettingsDialogBody id={props.id} />
      </Dialog>
    </SettingsContextProvider>
  );
}
