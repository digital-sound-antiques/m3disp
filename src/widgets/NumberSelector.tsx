import { Box, ListSubheader, MenuItem, Select, SelectChangeEvent, Stack } from "@mui/material";

export function NumberSelector(props: {
  label: string;
  values: number[];
  value: number;
  valueLabelFn?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const { value, values, onChange } = props;
  function valueToLabel(value: number) {
    return props.valueLabelFn?.(value) ?? value.toString();
  }
  const items = [];
  for (const i in values) {
    items.push(
      <MenuItem key={i} value={values[i]}>
        {valueToLabel(values[i])}
      </MenuItem>
    );
  }
  return (
    <Stack>
      <ListSubheader>{props.label}</ListSubheader>
      <Box sx={{ mx: 2 }}>
        <Select
          fullWidth
          size="small"
          value={value}
          onChange={(e) => {
            onChange(e.target.value as number);
          }}
          renderValue={(value) => {
            return <MenuItem sx={{ p: 0 }}>{valueToLabel(value)}</MenuItem>;
          }}
        >
          {items}
        </Select>
      </Box>
    </Stack>
  );
}
