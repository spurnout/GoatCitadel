import { useMemo, useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";

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
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => {
    return options.find((option) => option.value === value) ?? options[0] ?? null;
  }, [options, value]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <span className={`gc-select-shell${className ? ` ${className}` : ""}`}>
        {renderPrefix ? <span className="gc-select-prefix">{renderPrefix}</span> : null}
        <Popover.Trigger asChild>
          <button
            type="button"
            {...rest}
            className="gc-select-trigger"
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open}
          >
            <span className="gc-select-value">{selected?.label ?? value ?? "Select a value"}</span>
            <span className="gc-select-caret" aria-hidden>▾</span>
          </button>
        </Popover.Trigger>
      </span>
      <Popover.Portal>
        <Popover.Content className="gc-select-content" sideOffset={6} align="start">
          <ul className="gc-select-list" role="listbox" aria-label="Options">
            {options.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  disabled={option.disabled}
                  className={`gc-select-option${option.value === value ? " active" : ""}`}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span>{option.label}</span>
                  {option.value === value ? <span className="gc-select-check" aria-hidden>●</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
