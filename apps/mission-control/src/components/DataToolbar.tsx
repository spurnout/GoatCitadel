import type { ReactNode } from "react";

interface DataToolbarProps {
  primary?: ReactNode;
  secondary?: ReactNode;
  className?: string;
}

export function DataToolbar({ primary, secondary, className }: DataToolbarProps) {
  return (
    <div className={`data-toolbar${className ? ` ${className}` : ""}`}>
      <div className="data-toolbar-primary">{primary}</div>
      <div className="data-toolbar-secondary">{secondary}</div>
    </div>
  );
}
