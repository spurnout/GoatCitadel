import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  hint,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={`page-header${className ? ` ${className}` : ""}`}>
      <div className="page-header-main">
        {eyebrow ? <p className="page-header-eyebrow">{eyebrow}</p> : null}
        <div className="page-header-title-row">
          <h2 className="page-header-title">{title}</h2>
          {actions ? <div className="page-header-actions mobile-only">{actions}</div> : null}
        </div>
        {subtitle ? <div className="page-header-subtitle">{subtitle}</div> : null}
        {hint ? <div className="page-header-hint">{hint}</div> : null}
      </div>
      {actions ? <div className="page-header-actions desktop-only">{actions}</div> : null}
    </header>
  );
}
