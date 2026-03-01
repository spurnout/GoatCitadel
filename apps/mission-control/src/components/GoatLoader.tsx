interface GoatLoaderProps {
  label?: string;
  compact?: boolean;
}

export function GoatLoader({ label = "Working...", compact = false }: GoatLoaderProps) {
  return (
    <span className={`goat-loader ${compact ? "compact" : ""}`} role="status" aria-live="polite">
      <span className="goat-loader-icon" aria-hidden="true">🐐</span>
      <span>{label}</span>
    </span>
  );
}
