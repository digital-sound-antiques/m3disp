import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  Divider,
  FormControlLabel,
  ListSubheader,
  Radio,
  RadioGroup,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import Grid2 from "@mui/material/Unstable_Grid2/Grid2";
import React, { Fragment, useContext, useState } from "react";
import { AppContext, PianoRollColorModeMap } from "../contexts/AppContext";
import { ColorBall } from "../widgets/ColorSelector";
import { pianoRollColorDialogId } from "../widgets/PianoRollControl";
import { defaultChannelColors, type PianoRollColorMode } from "../widgets/piano-roll-painter";

// Channel labels, aligned 1:1 with channelIds[] in piano-roll-painter.ts.
const oplFmLabels = ["OPLL1", "OPLL2", "OPLL3", "OPLL4", "OPLL5", "OPLL6", "OPLL7", "OPLL8", "OPLL9"];
const oplRhythmLabels = ["BD", "SD", "TOM", "CYM", "HH"];
const psgLabels = ["PSG1", "PSG2", "PSG3", "NOISE1", "NOISE2", "NOISE3"];
const sccLabels = ["SCC1", "SCC2", "SCC3", "SCC4", "SCC5"];

type ChannelGroup = { device: keyof PianoRollColorModeMap; name: string; labels: string[]; base: number };

// base = starting index into channelIds[] / the channel color arrays.
const channelGroups: ChannelGroup[] = [
  { device: "opll", name: "OPLL", labels: [...oplFmLabels, ...oplRhythmLabels], base: 0 },
  { device: "psg", name: "PSG", labels: psgLabels, base: 14 },
  { device: "scc", name: "SCC", labels: sccLabels, base: 20 },
];

/** Normalize an arbitrary stored color into the #rrggbb form <input type="color"> requires. */
function toHex6(color: string): string {
  return color.slice(0, 7).toLowerCase();
}

const BALL_SIZE = 26; // inner circle diameter; outer wrapper is +6.

function ColorPickerBall(props: { color: string; disabled?: boolean; onChange: (c: string) => void }) {
  return (
    <Box sx={{ position: "relative", display: "inline-flex" }}>
      <ColorBall color={props.color} size={BALL_SIZE} />
      {!props.disabled && (
        <input
          type="color"
          value={toHex6(props.color)}
          onChange={(e) => props.onChange(e.target.value)}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: `${BALL_SIZE + 6}px`,
            height: `${BALL_SIZE + 6}px`,
            opacity: 0,
            cursor: "pointer",
          }}
        />
      )}
    </Box>
  );
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index } = props;
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
}

function ChipPanel(props: {
  value: number;
  index: number;
  group: ChannelGroup;
  mode: PianoRollColorMode;
  colors: string[];
  onModeChange: (value: PianoRollColorMode) => void;
  onColorChange: (index: number, color: string) => void;
  onReset: () => void;
}) {
  const { group } = props;
  // Channel colors only apply in "By Channel" mode; dim + disable otherwise.
  const disabled = props.mode === "voice";
  return (
    <TabPanel value={props.value} index={props.index}>
      <ListSubheader>Coloring Mode</ListSubheader>
      <RadioGroup
        row
        sx={{ px: 2 }}
        value={props.mode}
        onChange={(_evt, value) => props.onModeChange(value as PianoRollColorMode)}
      >
        <FormControlLabel value="voice" control={<Radio size="small" />} label="By Tone" />
        <FormControlLabel value="channel" control={<Radio size="small" />} label="By Channel" />
      </RadioGroup>

      <Box sx={{ opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? "none" : "auto" }}>
        <ListSubheader>Channel Colors</ListSubheader>
        <Grid2 container columns={3} sx={{ px: 2 }}>
          {group.labels.map((label, i) => {
            const index = group.base + i;
            return (
              <Grid2 xs={1} key={label}>
                <Box sx={{ display: "flex", alignItems: "center", my: 0.5 }}>
                  <ColorPickerBall
                    color={props.colors[index]}
                    disabled={disabled}
                    onChange={(c) => props.onColorChange(index, c)}
                  />
                  <Typography variant="body2">{label}</Typography>
                </Box>
              </Grid2>
            );
          })}
        </Grid2>
        <Box sx={{ px: 2, mt: 1 }}>
          <Button size="small" disabled={disabled} onClick={props.onReset}>
            Reset to Default
          </Button>
        </Box>
      </Box>
    </TabPanel>
  );
}

function DialogBody(props: { id: string }) {
  const app = useContext(AppContext);
  const [tab, setTab] = useState(0);

  // Snapshot of the values when the dialog opened, restored on Cancel.
  const [savedMode] = useState(app.pianoRollColorMode);
  const [savedChannelColors] = useState(app.pianoRollChannelColors);

  // Working copies driving the UI; edits are applied live (and persisted).
  const [mode, setMode] = useState<PianoRollColorModeMap>(app.pianoRollColorMode);
  const [channelColors, setChannelColors] = useState<string[]>(app.pianoRollChannelColors);

  const updateMode = (device: keyof PianoRollColorModeMap, value: PianoRollColorMode) => {
    const next = { ...mode, [device]: value };
    setMode(next);
    app.setPianoRollColorMode(next);
  };

  const updateChannelColorAt = (index: number, color: string) => {
    const next = channelColors.slice();
    next[index] = color;
    setChannelColors(next);
    app.setPianoRollChannelColors(next);
  };

  const resetChannelColors = (group: ChannelGroup) => {
    const next = channelColors.slice();
    for (let i = 0; i < group.labels.length; i++) {
      next[group.base + i] = defaultChannelColors[group.base + i];
    }
    setChannelColors(next);
    app.setPianoRollChannelColors(next);
  };

  const onCancel = () => {
    app.setPianoRollColorMode(savedMode);
    app.setPianoRollChannelColors(savedChannelColors);
    app.closeDialog(props.id);
  };

  const onOk = () => app.closeDialog(props.id);

  return (
    <Fragment>
      <DialogContent
        sx={{
          minWidth: "300px",
          width: { sm: "480px" },
          height: { xs: "440px", sm: "480px" },
          p: 1,
          backgroundColor: "background.paper",
        }}
      >
        <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Tabs value={tab} onChange={(_evt, value) => setTab(value)} variant="fullWidth">
            {channelGroups.map((g) => (
              <Tab key={g.device} label={g.name} />
            ))}
          </Tabs>
        </Box>
        {channelGroups.map((g, i) => (
          <ChipPanel
            key={g.device}
            value={tab}
            index={i}
            group={g}
            mode={mode[g.device]}
            colors={channelColors}
            onModeChange={(value) => updateMode(g.device, value)}
            onColorChange={updateChannelColorAt}
            onReset={() => resetChannelColors(g)}
          />
        ))}
      </DialogContent>
      <DialogActions sx={{ backgroundColor: "background.paper" }}>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={onOk}>Ok</Button>
      </DialogActions>
    </Fragment>
  );
}

export function PianoRollColorDialog() {
  const app = useContext(AppContext);
  const open = app.isOpen(pianoRollColorDialogId);
  return <Dialog open={open}>{open && <DialogBody id={pianoRollColorDialogId} />}</Dialog>;
}
