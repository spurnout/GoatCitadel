import { useEffect, useMemo, useState } from "react";

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
  allowCustom?: boolean;
  autoSelectFirstOption?: boolean;
  onCustomModeChange?: (customMode: boolean) => void;
}

export function SelectOrCustom(props: SelectOrCustomProps) {
  const dedupedOptions = useMemo(() => dedupeOptions(props.options), [props.options]);
  const isKnownValue = dedupedOptions.some((option) => option.value === props.value);
  const [isCustomMode, setIsCustomMode] = useState<boolean>(Boolean(props.value && !isKnownValue));
  const allowCustom = props.allowCustom ?? true;
  const autoSelectFirstOption = props.autoSelectFirstOption ?? false;

  const selectValue = isKnownValue
    ? props.value
    : autoSelectFirstOption
      ? dedupedOptions[0]?.value ?? ""
      : "";

  useEffect(() => {
    if (!allowCustom && isCustomMode) {
      setIsCustomMode(false);
      props.onCustomModeChange?.(false);
      return;
    }

    if (!props.value.trim() && isCustomMode) {
      setIsCustomMode(false);
      props.onCustomModeChange?.(false);
      return;
    }

    if (props.value && !isKnownValue && allowCustom && !isCustomMode) {
      setIsCustomMode(true);
      props.onCustomModeChange?.(true);
      return;
    }

  }, [allowCustom, isCustomMode, isKnownValue, props.onCustomModeChange, props.value]);

  return (
    <div className="select-or-custom">
      <select
        id={props.id}
        value={isCustomMode ? (isKnownValue ? props.value : dedupedOptions[0]?.value ?? "") : selectValue}
        disabled={props.disabled}
        onChange={(event) => {
          setIsCustomMode(false);
          props.onCustomModeChange?.(false);
          props.onChange(event.target.value);
        }}
      >
        {!isKnownValue ? (
          <option value="">{props.customPlaceholder ?? "Select value"}</option>
        ) : null}
        {dedupedOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {allowCustom ? (
        <div className="controls-row">
          <button
            type="button"
            onClick={() => {
              const nextMode = !isCustomMode;
              setIsCustomMode(nextMode);
              props.onCustomModeChange?.(nextMode);
              if (!nextMode && autoSelectFirstOption && !isKnownValue && dedupedOptions[0]) {
                props.onChange(dedupedOptions[0].value);
              }
            }}
            disabled={props.disabled}
          >
            {isCustomMode ? "Use suggested values" : (props.customOptionLabel ?? "Use custom value")}
          </button>
        </div>
      ) : null}

      {isCustomMode ? (
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
