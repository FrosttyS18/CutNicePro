import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { trimSegment, type TrimEdge } from "../../lib/edit-plan";
import type { EditSegment } from "../../lib/workspace-types";

interface Gesture {
  pointerId: number;
  target: HTMLElement;
  source: EditSegment[];
  index: number;
  edge: TrimEdge;
  startX: number;
  width: number;
  value: number;
}

interface Options {
  segments: EditSegment[];
  duration: number;
  enabled: boolean;
  onSelect: (index: number) => void;
  onCommit?: (index: number, edge: TrimEdge, value: number) => void;
}

export function useTimelineTrim({ segments, duration, enabled, onSelect, onCommit }: Options) {
  const gesture = useRef<Gesture | null>(null);
  const context = useMemo(() => ({ segments, duration, enabled }), [segments, duration, enabled]);
  const [draft, setDraft] = useState<{ context: typeof context; segments: EditSegment[] } | null>(null);
  useEffect(() => () => {
    const active = gesture.current;
    gesture.current = null;
    if (active?.target.hasPointerCapture(active.pointerId)) active.target.releasePointerCapture(active.pointerId);
  }, [segments, duration, enabled]);

  const cancel = () => {
    const active = gesture.current;
    gesture.current = null;
    setDraft(null);
    if (active?.target.hasPointerCapture(active.pointerId)) active.target.releasePointerCapture(active.pointerId);
  };
  const sample = (active: Gesture, x: number) => {
    const key = active.edge === "start" ? "sourceStart" : "sourceEnd";
    const value = active.source[active.index][key] + (x - active.startX) / active.width * duration;
    const next = trimSegment(active.source, active.index, active.edge, value, duration);
    return next ? { segments: next, value: next[active.index][key] } : null;
  };
  const begin = (index: number, edge: TrimEdge, event: PointerEvent<HTMLElement>, lane: HTMLElement | null) => {
    event.stopPropagation();
    if (!enabled || !onCommit || event.button !== 0 || gesture.current) return;
    const width = lane?.getBoundingClientRect().width ?? 0;
    if (width <= 0) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(index);
    gesture.current = { pointerId: event.pointerId, target: event.currentTarget, source: segments, index, edge,
      startX: event.clientX, width, value: segments[index][edge === "start" ? "sourceStart" : "sourceEnd"] };
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    event.stopPropagation();
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId || active.source !== segments) return;
    const next = sample(active, event.clientX);
    if (next) setDraft({ context, segments: next.segments });
  };
  const finish = (event: PointerEvent<HTMLElement>) => {
    event.stopPropagation();
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const next = enabled && active.source === segments ? sample(active, event.clientX) : null;
    cancel();
    if (next && next.value !== active.value) onCommit?.(active.index, active.edge, next.value);
  };
  const cancelPointer = (event: PointerEvent<HTMLElement>) => {
    event.stopPropagation();
    if (gesture.current?.pointerId === event.pointerId) cancel();
  };
  const keyboard = (index: number, edge: TrimEdge, event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && gesture.current) { event.stopPropagation(); event.preventDefault(); cancel(); return; }
    if (!enabled || !onCommit || gesture.current || event.altKey || event.ctrlKey || event.metaKey) return;
    const value = segments[index][edge === "start" ? "sourceStart" : "sourceEnd"];
    const step = event.shiftKey ? 1 : 0.01;
    const proposed = event.key === "Home" ? 0 : event.key === "End" ? duration
      : event.key === "ArrowLeft" || event.key === "ArrowDown" ? value - step
      : event.key === "ArrowRight" || event.key === "ArrowUp" ? value + step : null;
    if (proposed === null) return;
    event.stopPropagation();
    event.preventDefault();
    onSelect(index);
    const next = trimSegment(segments, index, edge, proposed, duration);
    if (next && next !== segments) onCommit(index, edge, next[index][edge === "start" ? "sourceStart" : "sourceEnd"]);
  };
  return { displayed: draft?.context === context ? draft.segments : segments, begin, move, finish, cancelPointer, keyboard };
}
