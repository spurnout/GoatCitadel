import type { ReactNode } from "react";

type GCAlertTone = "info" | "success" | "warning" | "error";

interface GCAlertProps {
  tone?: GCAlertTone;
  title?: string;
  children: ReactNode;
}

export function GCAlert({ tone = "info", title, children }: GCAlertProps) {
  return (
    <div className={`gc-alert gc-alert-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {title ? <p className="gc-alert-title">{title}</p> : null}
      <div>{children}</div>
    </div>
  );
}

