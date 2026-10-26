import { useEffect, useId, useLayoutEffect, useRef, type PointerEvent, type ReactNode } from "react";
import { ArrowsInSimpleIcon } from "@phosphor-icons/react/dist/csr/ArrowsInSimple";
import { ArrowsOutSimpleIcon } from "@phosphor-icons/react/dist/csr/ArrowsOutSimple";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { EditorAction } from "./EditorAction";

interface Props {
  side: "library" | "inspector";
  label: string;
  width: number;
  minimum: number;
  maximum: number;
  expanded: boolean;
  onWidth: (width: number) => void;
  onExpand: () => void;
  onClose: () => void;
  children: ReactNode;
}

export function CompositionSidePanel({ side, label, width, minimum, maximum, expanded, onWidth, onExpand, onClose, children }: Props) {
  const title = useId();
  const latest = useRef({ width, minimum, maximum, onWidth });
  const cleanup = useRef<(() => void) | null>(null);
  useLayoutEffect(() => { latest.current = { width, minimum, maximum, onWidth }; }, [width, minimum, maximum, onWidth]);
  useEffect(() => () => cleanup.current?.(), []);
  const clamp = (value: number) => Math.min(latest.current.maximum, Math.max(latest.current.minimum, Math.round(value)));
  const direction = side === "library" ? 1 : -1;
  const name = side === "library" ? "biblioteca" : "propriedades";
  const beginResize = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    cleanup.current?.();
    const initial = latest.current.width;
    const start = event.clientX;
    const move = (next: globalThis.PointerEvent) => latest.current.onWidth(clamp(initial + (next.clientX - start) * direction));
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key, true);
      cleanup.current = null;
    };
    const cancel = () => { stop(); latest.current.onWidth(initial); };
    const key = (next: KeyboardEvent) => {
      if (next.key !== "Escape") return;
      next.preventDefault(); next.stopImmediatePropagation(); cancel();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", key, true);
    cleanup.current = stop;
  };

  return <div className={`composition-side-panel composition-side-panel--${side}`} data-panel={side} data-expanded={expanded} aria-labelledby={title}>
    <header className="composition-side-panel__header">
      <h2 id={title}>{label}</h2>
      <EditorAction compact label={`${expanded ? "Recolher" : "Expandir"} ${name}`} pressed={expanded}
        icon={expanded ? <ArrowsInSimpleIcon size={16} aria-hidden="true" /> : <ArrowsOutSimpleIcon size={16} aria-hidden="true" />} onClick={onExpand} />
      <EditorAction compact label={`Fechar ${name}`} icon={<XIcon size={16} aria-hidden="true" />} onClick={onClose} />
    </header>
    <div className="composition-side-panel__content">{children}</div>
    <div className="composition-side-panel__resize" role="separator" tabIndex={0} aria-label={`Redimensionar ${name}`} aria-orientation="vertical"
      aria-valuemin={minimum} aria-valuemax={maximum} aria-valuenow={width} aria-valuetext={`${width} pixels`} onPointerDown={beginResize}
      onKeyDown={event => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        const step = event.shiftKey ? 40 : 16;
        const next = event.key === "Home" ? minimum : event.key === "End" ? maximum
          : event.key === "ArrowRight" ? width + step * direction : event.key === "ArrowLeft" ? width - step * direction : null;
        if (next === null) return;
        event.preventDefault(); event.stopPropagation(); onWidth(clamp(next));
      }} />
  </div>;
}
