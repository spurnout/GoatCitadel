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
        <h3>{appCopy.quickActionsButton.replace(" (Ctrl/Cmd+K)", "")}</h3>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={globalCopy.commandPalette.placeholder}
        />
        <ul className="compact-list">
          {filtered.length === 0 ? (
            <li>No matching actions.</li>
          ) : filtered.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  item.run();
                  onClose();
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
