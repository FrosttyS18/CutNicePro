import { useEffect, useId, useRef, type ReactNode } from "react";

interface Props {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}

export function FlowDialog({ open, title, children, onClose, busy = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previous = document.activeElement;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <dialog ref={ref} className="tool-dialog flow-dialog" aria-labelledby={id}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea'));
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); items[0]?.focus(); }
      }}>
      <header className="tool-dialog__header"><h2 id={id}>{title}</h2>
        <button type="button" className="tool-dialog__close" disabled={busy} aria-label="Fechar janela" onClick={onClose} autoFocus>×</button>
      </header>
      {children}
    </dialog>
  );
}
