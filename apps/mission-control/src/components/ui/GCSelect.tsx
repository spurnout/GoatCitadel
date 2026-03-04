import type { ReactNode } from "react";

export interface GCSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface GCSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: GCSelectOption[];
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  id?: string;
  renderPrefix?: ReactNode;
}

export function GCSelect({
  value,
  onChange,
  options,
  disabled = false,
  className,
  renderPrefix,
  ...rest
}: GCSelectProps) {
  return (
    <span className={`gc-select-shell${className ? ` ${className}` : ""}`}>
      {renderPrefix ? <span className="gc-select-prefix">{renderPrefix}</span> : null}
      <select
        {...rest}
        className="gc-select"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </span>
  );
}

