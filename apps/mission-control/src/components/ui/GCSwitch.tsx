import * as Switch from "@radix-ui/react-switch";

interface GCSwitchProps {
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  label?: string;
  disabled?: boolean;
  id?: string;
}

export function GCSwitch({ checked, onCheckedChange, label, disabled = false, id }: GCSwitchProps) {
  return (
    <label className="gc-switch-row" htmlFor={id}>
      <Switch.Root
        id={id}
        className="gc-switch-root"
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      >
        <Switch.Thumb className="gc-switch-thumb" />
      </Switch.Root>
      {label ? <span>{label}</span> : null}
    </label>
  );
}

