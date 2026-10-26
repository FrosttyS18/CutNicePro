import { useLayoutEffect, useRef, type RefObject } from "react";

export function useViewScroll(container: RefObject<HTMLDivElement | null>, active: boolean) {
  const position = useRef<{ top: number; left: number } | null>(null);
  const remember = () => {
    const target = container.current?.closest<HTMLElement>(".panel-body") ?? document.scrollingElement;
    if (target) position.current = { top: target.scrollTop, left: target.scrollLeft };
  };
  useLayoutEffect(() => {
    if (!position.current) return;
    const target = container.current?.closest<HTMLElement>(".panel-body") ?? document.scrollingElement;
    if (target) { target.scrollTop = active ? position.current.top : 0; target.scrollLeft = active ? position.current.left : 0; }
  }, [active,container]);
  return remember;
}
