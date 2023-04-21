import React, { Fragment, RefObject, useContext, useState } from "react";
import {
  useTheme,
  Box,
  Tab,
  Tabs,
  Typography,
  Button,
  Dialog,
  DialogContent,
  DialogActions,
  Checkbox,
  Divider,
  List,
  ListItem,
  Switch,
  ListItemText,
} from "@mui/material";
import { AppContext } from "./AppContext";
import { ColorSelector } from "./ColorSelector";
import Grid2 from "@mui/material/Unstable_Grid2/Grid2";
import { SettingsContext, SettingsContextProvider } from "./SettingsContext";
import { ArrowDropDown } from "@mui/icons-material";

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
  const oplls = [
    "OPLL1",
    "OPLL2",
    "OPLL3",
    "OPLL4",
    "OPLL5",
    "OPLL6",
    "OPLL7",
    "OPLL8",
    "OPLL9",
    "BD",
    "SD",
    "TOM",
    "CYM",
    "HH",
  ];

  const context = useContext(SettingsContext);

  const onOpllChange = (ch: number, checked: boolean) => {
    let newMask;
    if (checked) {
      newMask = context.channelMask.opll &= ~(1 << ch);
    } else {
      newMask = context.channelMask.opll |= 1 << ch;
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
          variants={["200", "300", "400", "500", "600", "700"]}
          value={primaryColor}
          onChange={updatePrimaryColor}
        />
        <ColorSelector
          label="Secondary Color"
          variants={["A100", "A200", "A400", "A700"]}
          value={secondaryColor}
          onChange={updateSecondaryColor}
        />
      </Box>
    </TabPanel>
  );
}

function SettingsDialogBody(props: { id: string }) {
  const app = useContext(AppContext);
  const settings = useContext(SettingsContext);
  const theme = useTheme();
  const [value, setValue] = useState(0);

  const [savedPrimaryColor] = useState(theme.palette.primary.main);
  const [savedSecondaryColor] = useState(theme.palette.secondary.main);

  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
  };

  const onCancel = () => {
    app.setPrimaryColor(savedPrimaryColor);
    app.setSecondaryColor(savedSecondaryColor);
    app.closeDialog(props.id);
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
          height: { xs: "480px", sm: "400px" },
          p: 0,
          backgroundColor: "background.paper",
        }}
      >
        <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Tabs value={value} onChange={handleChange} variant="fullWidth">
            <Tab label="Theme" />
            <Tab label="Channels" />
          </Tabs>
        </Box>
        <ColorPanel value={value} index={0} />
        <MaskPanel value={value} index={1} />
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
