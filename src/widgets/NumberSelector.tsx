export function NumberSelector(props: {
  label: string;
  values: number[];
  value: number;
  valueLabelFn?: (value: number) => string;
  /** optional explanation, rendered under the select and attached to this field */
  hint?: string;
  onChange: (value: number) => void;
}) {
  const { value, values, onChange } = props;
  const valueToLabel = (v: number) => props.valueLabelFn?.(v) ?? v.toString();

  return (
    <div className="crd-field">
      <div className="crd-field-label">{props.label}</div>
      <select
        className="crd-select"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {values.map((v) => (
          <option key={v} value={v}>
            {valueToLabel(v)}
          </option>
        ))}
      </select>
      {props.hint != null && <div className="crd-hint">{props.hint}</div>}
    </div>
  );
}
