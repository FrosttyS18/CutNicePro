import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./editor-controls.css";

export interface EditorMenuItem {
  label: string;
  icon: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onSelect: () => void;
}
interface Props { label: string; x: number; y: number; items: EditorMenuItem[]; onClose: () => void }

export function EditorMenu({ label, x, y, items, onClose }: Props) {
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    menu.current?.querySelector<HTMLButtonElement>('button:not([aria-disabled="true"])')?.focus();
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) onClose(); };
    window.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("pointerdown", outside);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [onClose]);
  return createPortal(<div ref={menu} className="editor-menu" role="menu" aria-label={label}
    style={{ left: Math.max(8, Math.min(x, window.innerWidth - 272)), top: Math.max(8, Math.min(y, window.innerHeight - items.length * 40 - 16)) }}
    onKeyDown={event => {
      if (event.key === "Escape" || event.key === "Tab") { event.stopPropagation(); onClose(); return; }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([aria-disabled="true"])'));
      const current = options.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
        : (current + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
      options[next]?.focus();
    }}>
    {items.map(item => <button key={item.label} type="button" role="menuitem" aria-disabled={Boolean(item.disabled)} data-danger={item.danger || undefined}
      onClick={() => { if (!item.disabled) { item.onSelect(); onClose(); } }}>
      <span className="editor-menu__label">{item.icon}<span>{item.label}</span></span>
      {item.shortcut && <kbd>{item.shortcut}</kbd>}
    </button>)}
  </div>, document.body);
}
