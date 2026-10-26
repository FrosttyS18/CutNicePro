import { useEffect, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { compositionOutputSize } from "../../lib/composition-placement";
import { compositionMediaGeometry, type CompositionFramingAction, type MediaRect } from "../../lib/composition-media-geometry";
import { sourceTimeAt } from "../../lib/composition-playback";
import { isSplitScreen, splitLayoutAt } from "../../lib/split-screen";
import type { Composition, CompositionItem } from "../../lib/composition-types";
import "./composition-selection.css";

export interface CompositionSelectionProps {
  document: Composition; item: CompositionItem | undefined; frame: number; containerRef: RefObject<HTMLElement | null>; disabled?: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, action?: CompositionFramingAction) => void;
}

export function CompositionSelection({ document, item, frame, containerRef, disabled = false, onPointerDown }: CompositionSelectionProps) {
  const [stageBox, setStageBox] = useState<MediaRect | null>(null);
  const track = document.tracks.find(value => value.id === item?.trackId);
  const asset = document.assets.find(value => value.id === item?.assetId);
  const enabled = !disabled && Boolean(item && asset && track && !track.hidden && !track.locked
    && (item.kind === "video" || item.kind === "image") && frame >= item.startFrame && frame < item.startFrame + item.durationFrames);
  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container) return;
    const stage = container.querySelector<HTMLElement>(".composition-stage");
    if (!stage) return;
    const measure = () => {
      const outer = container.getBoundingClientRect(), rect = stage.getBoundingClientRect();
      const box = rect.width > 0 && rect.height > 0 ? { left: rect.left - outer.left + container.scrollLeft - container.clientLeft,
        top: rect.top - outer.top + container.scrollTop - container.clientTop, width: rect.width, height: rect.height } : null;
      setStageBox(previous => previous?.left === box?.left && previous?.top === box?.top && previous?.width === box?.width && previous?.height === box?.height ? previous : box);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(container); observer?.observe(stage); window.addEventListener("resize", measure); measure();
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [containerRef, enabled]);
  if (!enabled || !item || !asset || !stageBox) return null;
  const output = compositionOutputSize(document);
  const layout = item.settings.splitScreen;
  const split = item.kind === "video" && document.settings.ratio === "9:16" && isSplitScreen(layout) && layout.faceValidated
    && Boolean(splitLayoutAt(layout, sourceTimeAt(item, frame, document.fps)));
  const geometry = compositionMediaGeometry(asset, item.settings, output, item.placement, Boolean(split));
  if (!geometry?.bounds.width || !geometry.bounds.height) return null;
  const { bounds } = geometry;
  const style = { left: stageBox.left + bounds.left / output.width * stageBox.width, top: stageBox.top + bounds.top / output.height * stageBox.height,
    width: bounds.width / output.width * stageBox.width, height: bounds.height / output.height * stageBox.height };
  return <div className="composition-selection" data-composition-selection={item.id} aria-hidden="true" style={style} onPointerDown={event => { event.stopPropagation(); onPointerDown(event, "move"); }}>
    {(["nw", "ne", "sw", "se"] as const).map(corner => <span key={corner} className="composition-selection__handle" data-corner={corner}
      onPointerDown={event => { event.stopPropagation(); onPointerDown(event, corner); }} />)}
  </div>;
}
