import type { ReactNode } from "react";

interface GCEmptyStateProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function GCEmptyState({ title, subtitle, action }: GCEmptyStateProps) {
  return (
    <div className="gc-empty-state">
      <p className="gc-empty-title">{title}</p>
      {subtitle ? <p className="gc-empty-subtitle">{subtitle}</p> : null}
      {action ? <div className="gc-empty-action">{action}</div> : null}
    </div>
  );
}

