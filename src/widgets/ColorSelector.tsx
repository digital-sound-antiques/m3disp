import {
  Box,
  ListSubheader,
  MenuItem,
  Select,
  SelectChangeEvent,
  Stack,
  Typography
} from "@mui/material";

import { Fragment, useState } from "react";

import * as Colors from "@mui/material/colors";

type PaletteName =
  | "red"
  | "pink"
  | "purple"
  | "deepPurple"
  | "indigo"
  | "blue"
  | "lightBlue"
  | "cyan"
  | "teal"
  | "green"
  | "lightGreen"
  | "yellow"
  | "lime"
  | "amber"
  | "orange"
  | "deepOrange"
  | "brown"
  | "grey"
  | "blueGrey";

type PaletteMap = { [key in PaletteName]: ColorPalette };
type ColorVariantName =
  | "50"
  | "100"
  | "200"
  | "300"
  | "400"
  | "500"
  | "600"
  | "700"
  | "800"
  | "900"
  | "A100"
  | "A200"
  | "A400"
  | "A700";

type ColorPalette = { [key in ColorVariantName]: string };

const palettes: PaletteMap = {
  red: Colors.red,
  pink: Colors.pink,
  purple: Colors.purple,
  deepPurple: Colors.deepPurple,
  indigo: Colors.indigo,
  blue: Colors.blue,
  lightBlue: Colors.lightBlue,
  cyan: Colors.cyan,
  teal: Colors.teal,
  green: Colors.green,
  lightGreen: Colors.lightGreen,
  yellow: Colors.yellow,
  lime: Colors.lime,
  amber: Colors.amber,
  orange: Colors.orange,
  deepOrange: Colors.deepOrange,
  brown: Colors.brown,
  grey: Colors.grey,
  blueGrey: Colors.blueGrey,
};

const variants: ColorVariantName[] = [
  "50",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
  "A100",
  "A200",
  "A400",
  "A700",
];

type ColorDef = {
  palette: PaletteName;
  variant: ColorVariantName;
};

const paletteNameToLabel = {
  red: "Red",
  pink: "Pink",
  purple: "Purple",
  deepPurple: "Deep Purple",
  indigo: "Indigo",
  blue: "Blue",
  lightBlue: "Light Blue",
  cyan: "Cyan",
  teal: "Teal",
  green: "Green",
  lightGreen: "Light Green",
  yellow: "Yellow",
  lime: "Lime",
  amber: "Amber",
  orange: "Orange",
  deepOrange: "Deep Orange",
  brown: "Brown",
  grey: "Grey",
  blueGrey: "Blue Grey",
};

function colorDefToString(def: ColorDef): string {
  return palettes[def.palette][def.variant];
}

function stringToColorDef(value: string): ColorDef {
  for (const name in palettes) {
    const palette = palettes[name as PaletteName];
    for (const variant in palette) {
      const color = palette[variant as ColorVariantName];
      if (color == value) {
        return {
          palette: name as PaletteName,
          variant: variant as ColorVariantName,
        };
      }
    }
  }
  return { palette: "grey", variant: "500" };
}

function VariantSelector(props: {
  palette: PaletteName;
  value: ColorVariantName;
  variants: ColorVariantName[];
  onChange: (value: ColorVariantName) => void;
}) {
  const { palette, value, variants, onChange } = props;

  return (
    <Box sx={{ flexDirection: "row", gap: 1 }}>
      {variants.map((e) => {
        const variant = e as ColorVariantName;
        const color = colorDefToString({ palette, variant });
        const iconProps = {
          sx: {
            color: color,
          },
        };
        return (
          <ColorBall
            key={color}
            color={color}
            selected={value == e}
            onClick={() => onChange(variant)}
          />
        );
      })}
    </Box>
  );
}

function ColorBall(props: { color: string; selected?: boolean; onClick?: () => void }) {
  return (
    <Box
      style={{
        border: props.selected ? `2px solid ${props.color}` : undefined,
        width: "22px",
        height: "22px",
        marginRight: "8px",
        borderRadius: "11px",
        justifyContent: "center",
        alignItems: "center",
        display: "inline-flex",
      }}
    >
      <Box
        onClick={props.onClick}
        style={{
          width: "16px",
          height: "16px",
          borderRadius: "8px",
          backgroundColor: props.color,
        }}
      />
    </Box>
  );
}

function ColorLabel(props: { paletteId: PaletteName; variantId: ColorVariantName }) {
  const { paletteId, variantId } = props;
  const palette = palettes[paletteId];
  return (
    <Fragment>
      <ColorBall color={palette[variantId]} />
      <Typography>{paletteNameToLabel[paletteId]}</Typography>
    </Fragment>
  );
}

export function ColorSelector(props: {
  label: string;
  variants: ColorVariantName[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { value, variants, onChange } = props;

  const [colorDef, setColorDef] = useState(stringToColorDef(value));

  const onPaletteChange = (evt: SelectChangeEvent) => {
    const palette = evt.target.value as PaletteName;
    const def = { ...colorDef, palette };
    setColorDef(def);
    onChange(colorDefToString(def));
  };

  const onVariantChange = (variant: ColorVariantName) => {
    const def = { ...colorDef, variant };
    setColorDef(def);
    onChange(colorDefToString(def));
  };

  return (
    <Stack>
      <ListSubheader>{props.label}</ListSubheader>
      <Box sx={{ mx: 2 }}>
        <Select
          fullWidth
          size="small"
          value={colorDef.palette}
          onChange={onPaletteChange}
          renderValue={(paletteId) => {
            return (
              <MenuItem sx={{ p: 0 }}>
                <ColorLabel paletteId={paletteId} variantId={colorDef.variant} />
              </MenuItem>
            );
          }}
        >
          {Object.keys(palettes).map((e) => {
            const paletteId = e as PaletteName;
            const color = palettes[paletteId][colorDef.variant];
            return (
              <MenuItem key={paletteId} value={paletteId}>
                <ColorBall color={color} />
                <Typography>{paletteNameToLabel[paletteId]}</Typography>
              </MenuItem>
            );
          })}
        </Select>
      </Box>
      <Box sx={{ display: "flex", mx: 4, my: 2 }}>
        <VariantSelector
          palette={colorDef.palette}
          value={colorDef.variant}
          variants={variants}
          onChange={onVariantChange}
        />
      </Box>
    </Stack>
  );
}
