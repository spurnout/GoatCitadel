import type { ReactNode } from "react";
import { SectionHeader } from "./SectionHeader";

type PanelTone = "default" | "soft" | "accent" | "warning" | "critical";
type PanelPadding = "default" | "compact" | "spacious";

interface PanelProps {
  title?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  tone?: PanelTone;
  padding?: PanelPadding;
  className?: string;
  children: ReactNode;
}

export function Panel({
  title,
  subtitle,
  actions,
  tone = "default",
  padding = "default",
  className,
  children,
}: PanelProps) {
  return (
    <article className={`panel panel-${tone} panel-pad-${padding}${className ? ` ${className}` : ""}`}>
      {title || subtitle || actions ? (
        <SectionHeader title={title ?? ""} subtitle={subtitle} actions={actions} />
      ) : null}
      <div className="panel-body">{children}</div>
    </article>
  );
}
