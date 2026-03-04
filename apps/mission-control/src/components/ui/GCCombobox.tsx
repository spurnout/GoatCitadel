import { useMemo, useState } from "react";
import * as Popover from "@radix-ui/react-popover";

export interface GCComboboxOption {
  value: string;
  label: string;
}

interface GCComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: GCComboboxOption[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
}

export function GCCombobox({
  value,
  onChange,
  options,
  placeholder = "Search...",
  disabled = false,
  className,
  ...rest
}: GCComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedLabel = useMemo(() => {
    return options.find((option) => option.value === value)?.label ?? value ?? "";
  }, [options, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return options.slice(0, 100);
    }
    return options
      .filter((option) => `${option.label} ${option.value}`.toLowerCase().includes(q))
      .slice(0, 100);
  }, [options, query]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={`gc-combobox-trigger${className ? ` ${className}` : ""}`}
          disabled={disabled}
          {...rest}
        >
          <span>{selectedLabel || placeholder}</span>
          <span aria-hidden>▾</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="gc-combobox-content" sideOffset={6} align="start">
          <input
            className="gc-combobox-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            autoFocus
          />
          <ul className="gc-combobox-list" role="listbox" aria-label="Options">
            {filtered.length === 0 ? (
              <li className="gc-combobox-empty">No matches.</li>
            ) : filtered.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  className={`gc-combobox-option${option.value === value ? " active" : ""}`}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

