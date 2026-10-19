import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { constrainPanel } from "../../lib/progress-display";
import "./floating-panel.css";

interface Props { open: boolean; title: string; className?: string; children: ReactNode; onClose: () => void }

export function FloatingPanel({ open, title, className = "", children, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null);
  const id = useId();
  function position(x: number, y: number) {
    const panel = ref.current;
    if (!panel) return;
    const next = constrainPanel(x, y, panel.offsetWidth, panel.offsetHeight, { width: innerWidth, height: innerHeight });
    panel.style.left = `${next.x}px`; panel.style.top = `${next.y}px`;
  }
  useEffect(() => {
    const panel = ref.current;
    if (!open || !panel) return;
    panel.show();
    position(24, 80);
    const resize = () => { const rect = panel.getBoundingClientRect(); position(rect.left, rect.top); };
    const observer = new ResizeObserver(resize);
    observer.observe(panel);
    window.addEventListener("resize", resize);
    return () => { observer.disconnect(); window.removeEventListener("resize", resize); panel.close(); drag.current = null; };
  }, [open]);
  if (!open) return null;
  const content = <dialog ref={ref} data-modeless="true" className={`tool-dialog flow-dialog floating-panel ${className}`} aria-labelledby={id}
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); onClose(); } }}
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="tool-dialog__header floating-panel__handle" tabIndex={0} aria-label="Mover janela de legendas. Use as setas do teclado."
      onPointerDown={event => {
        if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button"))) return;
        event.preventDefault();
        const rect = ref.current!.getBoundingClientRect();
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
        event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerMove={event => {
        const start = drag.current;
        if (start?.id === event.pointerId) position(start.left + event.clientX - start.x, start.top + event.clientY - start.y);
      }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
      onKeyDown={event => {
        if (event.target !== event.currentTarget || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        const rect = ref.current!.getBoundingClientRect();
        position(rect.left + (event.key === "ArrowLeft" ? -20 : event.key === "ArrowRight" ? 20 : 0), rect.top + (event.key === "ArrowUp" ? -20 : event.key === "ArrowDown" ? 20 : 0));
      }}>
      <h2 id={id}>{title}</h2><button type="button" className="tool-dialog__close" aria-label="Fechar janela" onClick={onClose}><XIcon size={18} aria-hidden="true"/></button>
    </header>{children}
  </dialog>;
  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
