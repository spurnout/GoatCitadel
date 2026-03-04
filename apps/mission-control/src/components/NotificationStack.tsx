export interface NotificationItem {
  id: string;
  tone: "info" | "success" | "warning" | "error";
  message: string;
  timestamp: number;
}

interface NotificationStackProps {
  items: NotificationItem[];
  onDismiss: (id: string) => void;
}

export function NotificationStack({ items, onDismiss }: NotificationStackProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="notification-stack" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={`notification-item ${item.tone}`}>
          <div>
            <p>{item.message}</p>
            <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
          </div>
          <button type="button" onClick={() => onDismiss(item.id)} aria-label="Dismiss notification">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

