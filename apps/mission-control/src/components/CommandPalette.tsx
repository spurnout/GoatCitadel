import { useEffect, useMemo, useState } from "react";
import { appCopy, globalCopy } from "../content/copy";

export interface CommandPaletteItem {
  id: string;
  label: string;
  keywords?: string[];
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  items: CommandPaletteItem[];
}

export function CommandPalette({ open, onClose, items }: CommandPaletteProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return items.slice(0, 12);
    }
    return items.filter((item) => {
      const haystack = [item.label, ...(item.keywords ?? [])].join(" ").toLowerCase();
      return haystack.includes(q);
    }).slice(0, 12);
  }, [items, query]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-card command-palette" onClick={(event) => event.stopPropagation()}>
        <header className="command-palette-head">
          <div>
            <p className="command-palette-kicker">Command Center</p>
            <h3>{appCopy.quickActionsButton.replace(" (Ctrl/Cmd+K)", "")}</h3>
          </div>
          <p className="command-palette-hint">Esc to close</p>
        </header>
        <div className="command-palette-search">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={globalCopy.commandPalette.placeholder}
          />
          <span className="command-palette-shortcut">Ctrl/Cmd + K</span>
        </div>
        <ul className="command-palette-list">
          {filtered.length === 0 ? (
            <li className="command-palette-empty">No matching actions.</li>
          ) : filtered.map((item) => (
            <li key={item.id} className="command-palette-item">
              <button
                type="button"
                className="command-palette-action"
                onClick={() => {
                  item.run();
                  onClose();
                }}
              >
                <span>{item.label}</span>
                <span className="command-palette-go">↵</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
