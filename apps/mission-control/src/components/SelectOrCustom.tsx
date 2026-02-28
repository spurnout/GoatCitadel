import { useMemo } from "react";

const CUSTOM_SENTINEL = "__custom__";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectOrCustomProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  customLabel?: string;
  customPlaceholder?: string;
  customOptionLabel?: string;
  inputType?: "text" | "password";
  disabled?: boolean;
}

export function SelectOrCustom(props: SelectOrCustomProps) {
  const dedupedOptions = useMemo(() => dedupeOptions(props.options), [props.options]);
  const isKnownValue = dedupedOptions.some((option) => option.value === props.value);
  const selectValue = isKnownValue ? props.value : CUSTOM_SENTINEL;

  return (
    <div className="select-or-custom">
      <select
        id={props.id}
        value={selectValue}
        disabled={props.disabled}
        onChange={(event) => {
          const next = event.target.value;
          if (next === CUSTOM_SENTINEL) {
            if (isKnownValue) {
              props.onChange("");
            }
            return;
          }
          props.onChange(next);
        }}
      >
        {dedupedOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        <option value={CUSTOM_SENTINEL}>
          {props.customOptionLabel ?? "Custom value..."}
        </option>
      </select>

      {selectValue === CUSTOM_SENTINEL ? (
        <div className="controls-row select-custom-input">
          {props.customLabel ? <label>{props.customLabel}</label> : null}
          <input
            type={props.inputType ?? "text"}
            value={props.value}
            placeholder={props.customPlaceholder ?? "Enter custom value"}
            disabled={props.disabled}
            onChange={(event) => props.onChange(event.target.value)}
          />
        </div>
      ) : null}
    </div>
  );
}

function dedupeOptions(options: SelectOption[]): SelectOption[] {
  const seen = new Set<string>();
  const deduped: SelectOption[] = [];

  for (const option of options) {
    if (!option.value.trim()) {
      continue;
    }
    if (seen.has(option.value)) {
      continue;
    }
    seen.add(option.value);
    deduped.push(option);
  }

  return deduped;
}
