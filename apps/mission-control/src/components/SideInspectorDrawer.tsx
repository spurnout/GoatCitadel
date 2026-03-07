import type { ReactNode } from "react";

interface SideInspectorDrawerProps {
  title: string;
  subtitle?: ReactNode;
  open?: boolean;
  className?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function SideInspectorDrawer({
  title,
  subtitle,
  open = true,
  className,
  actions,
  children,
}: SideInspectorDrawerProps) {
  return (
    <aside className={`side-inspector-drawer${open ? " open" : " closed"}${className ? ` ${className}` : ""}`}>
      <div className="side-inspector-drawer-head">
        <div>
          <h3 className="side-inspector-drawer-title">{title}</h3>
          {subtitle ? <div className="side-inspector-drawer-subtitle">{subtitle}</div> : null}
        </div>
        {actions ? <div className="side-inspector-drawer-actions">{actions}</div> : null}
      </div>
      <div className="side-inspector-drawer-body">{children}</div>
    </aside>
  );
}
