import { useEffect, useRef, useState } from "react";

export function ChatComposerPlusMenu({
  disabled,
  onAttachFiles,
  onRunQuickResearch,
}: {
  disabled?: boolean;
  onAttachFiles: () => void;
  onRunQuickResearch: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (!rootRef.current) {
        return;
      }
      if (event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handleOutside);
    return () => window.removeEventListener("mousedown", handleOutside);
  }, []);

  return (
    <div className="chat-plus-menu" ref={rootRef}>
      <button
        type="button"
        className="chat-plus-trigger"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label="Open chat actions"
      >
        +
      </button>
      {open ? (
        <div className="chat-plus-popover" role="menu" aria-label="Chat actions">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onAttachFiles();
            }}
          >
            Add files or photos
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onRunQuickResearch();
            }}
          >
            Quick web research
          </button>
        </div>
      ) : null}
    </div>
  );
}
