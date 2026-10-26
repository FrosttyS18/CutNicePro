import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { trimSelection } from "../../lib/composition-trim";
import { moveSelectionToTrack } from "../../lib/composition-arrange";
import { editId, linkedSelection } from "../../lib/composition-operations";
import { scrollTimelineAtPointer, selectionForClick, trimDeltaBounds } from "../../lib/composition-gesture";
import type { Composition, CompositionItem } from "../../lib/composition-types";

interface Props {
  document: Composition; scale: number; frame: number; selected: string[];
  onSelect: (ids: string[]) => void; onChange: (document: Composition) => void;
  onPreview: (document: Composition | null, frame?: number) => void;
  onError: (message: string) => void;
  viewport?: RefObject<HTMLElement | null>;
  magnetic?: boolean;
}

function dropTrack(element: HTMLElement | null, x: number, y: number, item: CompositionItem): string | null {
  const contains = (candidate: HTMLElement) => {
    const rect = candidate.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  };
  const zone = element?.querySelector<HTMLElement>("[data-drop-new-track]");
  if (zone && contains(zone) && (item.kind === "video" || item.kind === "image")) return null;
  const kind = item.kind === "video" || item.kind === "image" ? "visual" : item.kind;
  const lane = element && [...element.querySelectorAll<HTMLElement>("[data-composition-track]")].find(candidate => candidate.dataset.trackKind === kind && contains(candidate));
  return lane?.dataset.compositionTrack ?? item.trackId;
}

export function useCompositionGesture(options: Props) {
  const cleanup = useRef<(() => void) | null>(null);
  const pendingFocus = useRef<{ viewport: HTMLElement; itemId: string } | null>(null);
  const latest = useRef(options);
  const anchor = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    latest.current = options;
    const pending = pendingFocus.current;
    pendingFocus.current = null;
    if (!pending?.viewport.isConnected || globalThis.document.activeElement !== globalThis.document.body) return;
    const target = [...pending.viewport.querySelectorAll<HTMLElement>("[data-composition-item]")].find(item => item.dataset.compositionItem === pending.itemId);
    target?.focus({ preventScroll: true });
  }, [options]);
  useEffect(() => () => { cleanup.current?.(); pendingFocus.current = null; }, []);
  const begin = (event: PointerEvent<HTMLElement>, item: CompositionItem, edge?: "start" | "end") => {
    if (event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.focus({preventScroll:true});
    const control = event.ctrlKey || event.metaKey;
    const ids = edge ? [item.id] : selectionForClick(options.document, options.selected, item, { control, shift: event.shiftKey }, anchor.current);
    options.onSelect(ids);
    if (!event.shiftKey && !control) anchor.current = item.id;
    const track = options.document.tracks.find(value => value.id === item.trackId)!;
    if (track.locked || control || event.shiftKey) return;
    cleanup.current?.();
    const base = options.document;
    const focusedTarget = event.currentTarget;
    const heldFocus = globalThis.document.activeElement === focusedTarget;
    const startX = event.clientX;
    const startY = event.clientY;
    const element = options.viewport?.current ?? null;
    const startScroll = element?.scrollLeft ?? 0;
    const scale = options.scale;
    let latestX = startX;
    let latestY = startY;
    let next = base;
    let raf: number | null = null;
    let message = "";
    let dragged = false;
    const origin = Math.min(...linkedSelection(base, ids).map(value => value.startFrame));
    const movingIds = [item.id, ...ids.filter(id => id !== item.id)];
    const newTrackId = editId();
    const companionTrackIds = Object.fromEntries(base.tracks.map(value=>[value.id,editId()]));
    const magnetic = options.magnetic !== false;
    const publishPreview = (value: Composition | null) => latest.current.onPreview(value);
    const restoreFocus = () => {
      if (heldFocus && !focusedTarget.isConnected && element && globalThis.document.activeElement === globalThis.document.body) pendingFocus.current = { viewport: element, itemId: item.id };
    };
    publishPreview(base);
    if (!edge && element) element.setAttribute("data-dragging", "true");
    const compute = () => {
      let delta = Math.round((latestX - startX + (element?.scrollLeft ?? 0) - startScroll) / scale);
      try {
        if (edge) {
          const [min, max] = trimDeltaBounds(base, item, edge, { magnetic });
          delta = Math.max(min, Math.min(max, delta));
          next = trimSelection(base, item.id, edge, delta, { magnetic });
        } else {
          if (Math.hypot(latestX - startX, latestY - startY) < 3 && !delta) {next=base;message="";publishPreview(base);return;}
          dragged = true;
          next = moveSelectionToTrack(base, movingIds, Math.max(0, origin + delta), dropTrack(element, latestX, latestY, item), { magnetic, newTrackId, companionTrackIds });
        }
        publishPreview(next);
        message = "";
      } catch (error) {
        const text = error instanceof Error ? error.message : "Não foi possível ajustar o trecho";
        next = base;
        publishPreview(base);
        message = text;
      }
    };
    const tick = () => {
      raf = null;
      const scrolled = scrollTimelineAtPointer(element, latestX);
      compute();
      if (scrolled) raf = window.requestAnimationFrame(tick);
    };
    const move = (moveEvent: globalThis.PointerEvent) => {
      latestX = moveEvent.clientX;
      latestY = moveEvent.clientY;
      if (raf === null) raf = window.requestAnimationFrame(tick);
    };
    const stop = () => {
      if (raf !== null) window.cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key, true);
      cleanup.current = null;
      element?.removeAttribute("data-dragging");
    };
    const cancel = () => { stop(); restoreFocus(); publishPreview(null); };
    const up = (upEvent: globalThis.PointerEvent) => {
      latestX = upEvent.clientX;
      latestY = upEvent.clientY;
      compute(); stop();
      restoreFocus();
      if (!edge&&!dragged) latest.current.onSelect([item.id]);
      if (next !== base) latest.current.onChange(next);
      publishPreview(null);
      if (message) latest.current.onError(message);
    };
    const key = (keyEvent: globalThis.KeyboardEvent) => {
      if (keyEvent.code === "Space" || keyEvent.key === " " || keyEvent.key === "Spacebar") {
        if (keyEvent.defaultPrevented || keyEvent.isComposing || keyEvent.ctrlKey || keyEvent.metaKey || keyEvent.altKey || keyEvent.shiftKey) return;
        const target = keyEvent.target instanceof HTMLElement ? keyEvent.target : globalThis.document.activeElement;
        const scope = element?.closest("[data-editor-timeline]") ?? element;
        const lostFocus = heldFocus && !focusedTarget.isConnected && target === globalThis.document.body;
        if (!target || !lostFocus && !scope?.contains(target)) return;
        if (target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="dialog"],dialog,[role="menu"],[data-editor-viewer="source"]')
          || globalThis.document.querySelector('dialog[open]:not([data-modeless]),[aria-modal="true"]')) return;
        keyEvent.preventDefault(); keyEvent.stopImmediatePropagation(); return;
      }
      if (keyEvent.key === "Escape") { keyEvent.preventDefault(); keyEvent.stopImmediatePropagation(); cancel(); }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", key, true);
    cleanup.current = stop;
  };
  const keyboard = (event: KeyboardEvent<HTMLElement>, item: CompositionItem, edge: "start" | "end") => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    try {
      const magnetic = options.magnetic !== false;
      const [min, max] = trimDeltaBounds(options.document, item, edge, { magnetic });
      const delta = event.key === "Home" ? min : event.key === "End" ? max : (event.shiftKey ? 10 : 1) * (event.key === "ArrowLeft" ? -1 : 1);
      const next = trimSelection(options.document, item.id, edge, Math.max(min, Math.min(max, delta)), { magnetic });
      if (next !== options.document) options.onChange(next);
    }
    catch (error) { options.onError(error instanceof Error ? error.message : "Não foi possível ajustar o trecho"); }
  };
  return { begin, keyboard };
}
