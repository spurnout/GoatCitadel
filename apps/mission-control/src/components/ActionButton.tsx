import { GoatLoader } from "./GoatLoader";

interface ActionButtonProps {
  label: string;
  pendingLabel?: string;
  onClick: () => void | Promise<void>;
  pending?: boolean;
  disabled?: boolean;
  danger?: boolean;
  type?: "button" | "submit";
}

export function ActionButton({
  label,
  pendingLabel,
  onClick,
  pending = false,
  disabled = false,
  danger = false,
  type = "button",
}: ActionButtonProps) {
  return (
    <button
      type={type}
      className={danger ? "danger" : ""}
      disabled={disabled || pending}
      onClick={() => void onClick()}
    >
      {pending ? <GoatLoader compact label={pendingLabel ?? "Applying..."} /> : label}
    </button>
  );
}
