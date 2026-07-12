import { useState } from "react";
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

type ColorDef = {
  palette: PaletteName;
  variant: ColorVariantName;
};

const paletteNameToLabel: { [key in PaletteName]: string } = {
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
        return { palette: name as PaletteName, variant: variant as ColorVariantName };
      }
    }
  }
  return { palette: "grey", variant: "500" };
}

export function ColorBall(props: {
  color: string;
  selected?: boolean;
  size?: number;
  onClick?: () => void;
}) {
  const inner = props.size ?? 16;
  const outer = inner + 6;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: `${outer}px`,
        height: `${outer}px`,
        borderRadius: `${outer / 2}px`,
        border: props.selected ? `2px solid ${props.color}` : "2px solid transparent",
        cursor: props.onClick ? "pointer" : undefined,
      }}
      onClick={props.onClick}
    >
      <span
        style={{
          width: `${inner}px`,
          height: `${inner}px`,
          borderRadius: `${inner / 2}px`,
          backgroundColor: props.color,
        }}
      />
    </span>
  );
}

export function ColorSelector(props: {
  label: string;
  variants: ColorVariantName[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { label, value, variants, onChange } = props;

  const [colorDef, setColorDef] = useState(stringToColorDef(value));

  const onPaletteChange = (palette: PaletteName) => {
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
    <div className="crd-field">
      <div className="crd-field-label">{label}</div>
      <div className="crd-field-row">
        <ColorBall color={colorDefToString(colorDef)} />
        <select
          className="crd-select"
          value={colorDef.palette}
          onChange={(e) => onPaletteChange(e.target.value as PaletteName)}
        >
          {Object.keys(palettes).map((e) => (
            <option key={e} value={e}>
              {paletteNameToLabel[e as PaletteName]}
            </option>
          ))}
        </select>
      </div>
      <div className="crd-balls">
        {variants.map((v) => (
          <ColorBall
            key={v}
            color={colorDefToString({ palette: colorDef.palette, variant: v })}
            selected={colorDef.variant == v}
            onClick={() => onVariantChange(v)}
          />
        ))}
      </div>
    </div>
  );
}
