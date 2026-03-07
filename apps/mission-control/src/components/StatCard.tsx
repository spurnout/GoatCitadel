import type { ReactNode } from "react";

type StatTone = "default" | "accent" | "warning" | "success";

interface StatCardProps {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: StatTone;
  className?: string;
}

export function StatCard({ label, value, note, tone = "default", className }: StatCardProps) {
  return (
    <article className={`stat-card stat-card-${tone}${className ? ` ${className}` : ""}`}>
      <p className="stat-card-label">{label}</p>
      <p className="stat-card-value">{value}</p>
      {note ? <p className="stat-card-note">{note}</p> : null}
    </article>
  );
}
