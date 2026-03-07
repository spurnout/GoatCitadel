import type { ReactNode } from "react";

interface SectionHeaderProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function SectionHeader({ title, subtitle, actions, className }: SectionHeaderProps) {
  return (
    <header className={`section-header${className ? ` ${className}` : ""}`}>
      <div className="section-header-copy">
        <h3 className="section-header-title">{title}</h3>
        {subtitle ? <div className="section-header-subtitle">{subtitle}</div> : null}
      </div>
      {actions ? <div className="section-header-actions">{actions}</div> : null}
    </header>
  );
}
