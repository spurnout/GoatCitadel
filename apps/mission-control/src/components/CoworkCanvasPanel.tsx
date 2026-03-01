export interface CoworkTaskItem {
  id: string;
  title: string;
  note?: string;
}

export function CoworkCanvasPanel({
  items,
}: {
  items: CoworkTaskItem[];
}) {
  return (
    <aside className="chat-cowork-panel">
      <header>
        <h4>Cowork Canvas</h4>
        <p>Shared context and active checklist for this session.</p>
      </header>
      {items.length === 0 ? (
        <p className="chat-cowork-empty">No active tasks yet. Use `/research ...` or ask the model to plan next steps.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <strong>{item.title}</strong>
              {item.note ? <p>{item.note}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

