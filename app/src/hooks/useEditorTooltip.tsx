import { useCallback, useId, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

export function useEditorTooltip<T extends HTMLElement>(anchor: RefObject<T | null>, content: ReactNode, className = "") {
  const id = useId();
  const [position, setPosition] = useState<{ left: number; top: number; container: HTMLElement } | null>(null);
  const hide = useCallback(() => setPosition(null), []);
  const show = () => {
    const element = anchor.current;
    const rect = element?.getBoundingClientRect();
    if (rect && element) setPosition({ left: Math.max(8, Math.min(window.innerWidth - 248, rect.left)), top: Math.min(window.innerHeight - 48, rect.bottom + 8), container: element.closest<HTMLElement>("dialog[open]") ?? document.body });
  };
  return {
    hide, descriptionId: position ? id : undefined,
    trigger: { onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide,
      onKeyDown: (event: KeyboardEvent<T>) => { if (event.key === "Escape") hide(); } },
    portal: position ? createPortal(<span id={id} role="tooltip" className={`editor-tooltip${className ? ` ${className}` : ""}`} style={{ left: position.left, top: position.top }}>{content}</span>, position.container) : null,
  };
}
