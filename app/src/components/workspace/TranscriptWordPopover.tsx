import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props { anchor: HTMLButtonElement; onClose: () => void; children: ReactNode }

export function TranscriptWordPopover({ anchor, onClose, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useLayoutEffect(() => { close.current = onClose; }, [onClose]);
  const [position, setPosition] = useState({ left: 12, top: 12 });
  useLayoutEffect(() => {
    function place() {
      const rect = anchor.getBoundingClientRect();
      const width = ref.current?.offsetWidth ?? 300;
      const height = ref.current?.offsetHeight ?? 50;
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
      const top = rect.bottom + height + 12 < window.innerHeight ? rect.bottom + 8 : Math.max(12, rect.top - height - 8);
      setPosition({ left, top });
    }
    const observer = new ResizeObserver(place);
    if (ref.current) observer.observe(ref.current);
    place();
    ref.current?.querySelector<HTMLElement>("input, button")?.focus();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [anchor]);
  useEffect(() => {
    function outside(event: Event) {
      if (event.target instanceof Node && !anchor.contains(event.target) && !ref.current?.contains(event.target)) close.current();
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", outside); };
  }, [anchor]);
  return createPortal(<div ref={ref} className="transcript-word-popover" role="group" aria-label="Ações da palavra" style={position}
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); close.current(); anchor.focus(); } }}>{children}</div>, document.body);
}
