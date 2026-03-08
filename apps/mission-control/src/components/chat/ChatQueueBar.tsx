export interface ChatQueueItemView {
  id: string;
  action: "send" | "edit" | "retry";
  label: string;
  createdAt: string;
  paused?: boolean;
}

export function ChatQueueBar({
  items,
  onResumeAll,
  onRemove,
}: {
  items: ChatQueueItemView[];
  onResumeAll: () => void;
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) {
    return null;
  }
  const pausedCount = items.filter((item) => item.paused).length;
  return (
    <div className="chat-v11-queue-bar">
      <div className="chat-v11-queue-header">
        <strong>Queued sends</strong>
        <span>{items.length} pending</span>
        {pausedCount > 0 ? (
          <button type="button" onClick={onResumeAll}>Resume queue</button>
        ) : null}
      </div>
      <ul className="chat-v11-queue-list">
        {items.map((item) => (
          <li key={item.id}>
            <div>
              <strong>{item.label}</strong>
              <p>{item.action}{item.paused ? " · paused after reload" : ""}</p>
            </div>
            <button type="button" onClick={() => onRemove(item.id)}>Remove</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
