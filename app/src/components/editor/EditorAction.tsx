import { useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./editor-controls.css";

interface Props {
  label: string;
  tooltip?: string;
  icon: ReactNode;
  disabled?: boolean;
  pressed?: boolean;
  compact?: boolean;
  onClick: () => void;
}

export function EditorAction({ label, tooltip = label, icon, disabled = false, pressed, compact = false, onClick }: Props) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const show = () => {
    const rect = anchor.current?.getBoundingClientRect();
    if (rect) setPosition({ left: Math.max(8, Math.min(window.innerWidth - 248, rect.left)), top: Math.min(window.innerHeight - 48, rect.bottom + 8) });
  };
  return <span ref={anchor} className="editor-action" onMouseEnter={show} onMouseLeave={() => setPosition(null)}
    onFocus={show} onBlur={() => setPosition(null)} onKeyDown={event => { if (event.key === "Escape") setPosition(null); }}>
    <button type="button" className={`flow-button editor-action__button${compact ? " editor-action__button--compact" : ""}`}
      aria-label={label} aria-disabled={disabled} aria-pressed={pressed} aria-describedby={position ? id : undefined}
      onClick={() => { if (!disabled) { setPosition(null); onClick(); } }}>
      {icon}<span className={compact ? "sr-only" : undefined}>{label}</span>
    </button>
    {position && createPortal(<span id={id} role="tooltip" className="editor-tooltip" style={position}>{tooltip}</span>, document.body)}
  </span>;
}
