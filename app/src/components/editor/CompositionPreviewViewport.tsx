import { useState, type PointerEvent, type ReactNode, type RefObject } from "react";
import { MagnifyingGlassMinusIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlassMinus";
import { MagnifyingGlassPlusIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlassPlus";
import { CornersOutIcon } from "@phosphor-icons/react/dist/csr/CornersOut";
import { HandIcon } from "@phosphor-icons/react/dist/csr/Hand";
import { compositionOutputSize } from "../../lib/composition-placement";
import { PREVIEW_ZOOM_MAX, PREVIEW_ZOOM_MIN, previewGeometry } from "../../lib/preview-viewport";
import type { Composition, CompositionItem } from "../../lib/composition-types";
import type { CompositionFramingAction } from "../../lib/composition-media-geometry";
import type { CompositionSnapGuides } from "../../lib/composition-preview-snap";
import { CompositionSelection } from "./CompositionSelection";
import { EditorAction } from "./EditorAction";
import { usePreviewViewport } from "./usePreviewViewport";
import "./composition-preview-viewport.css";

interface Props {
  document: Composition; frame: number; item?: CompositionItem; children: ReactNode; framing: boolean;
  canvasRef: RefObject<HTMLDivElement | null>; onViewChange: () => void;
  onDeselect?: () => void;
  snapGuides?: CompositionSnapGuides;
  onPointerDown: (event: PointerEvent<HTMLElement>, action?: CompositionFramingAction) => boolean | void;
}
export function CompositionPreviewViewport({ document, frame, item, children, framing, canvasRef, onPointerDown, onViewChange, onDeselect, snapGuides = {} }: Props) {
  const output = compositionOutputSize(document);
  const view = usePreviewViewport({ canvasRef, output, onViewChange });
  const [hand, setHand] = useState(false);
  const { camera, size } = view;
  const geometry = previewGeometry(size, output, camera);
  const visible = geometry.visible;
  const overview = camera.zoom > 1 && (visible.width < .999 || visible.height < .999);
  if (hand && !overview) setHand(false);
  const mapScale = Math.min(88 / output.width, 96 / output.height);
  return <div className="composition-preview">
    <div ref={canvasRef} className="composition-editor__canvas" data-framing={framing} data-placement={Boolean(item) && !framing}
      data-preview-zoom={camera.zoom} data-pan={hand && overview || view.panning} onPointerDown={event => {
        if (event.button === 1 || hand && overview && event.button === 0) view.begin(event);
        else {
          const origin = event.target as Element;
          if (origin.closest("button,input,textarea,select,[contenteditable=true],[role=button]")) return;
          const handled = onPointerDown(event);
          if (event.button === 0 && (handled === false || handled !== true && !origin.closest("video,img,.composition-selection,.split-preview"))) {
            onDeselect?.(); event.currentTarget.closest<HTMLElement>("[data-editor-viewer]")?.focus({ preventScroll: true }); return;
          }
        }
      }}>
      <div className="composition-preview__camera" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}>{children}</div>
      {(snapGuides.x !== undefined || snapGuides.y !== undefined) && <div className="composition-preview__guides" aria-hidden="true" style={{ left: geometry.left, top: geometry.top, width: geometry.width, height: geometry.height }}>
        {snapGuides.x !== undefined && <span className="composition-preview__guide-x" style={{ left: `${snapGuides.x / output.width * 100}%` }}/>}
        {snapGuides.y !== undefined && <span className="composition-preview__guide-y" style={{ top: `${snapGuides.y / output.height * 100}%` }}/>}
      </div>}
      <CompositionSelection document={document} item={item} frame={frame} containerRef={canvasRef} measurementKey={`${camera.zoom}:${camera.x}:${camera.y}:${size.width}:${size.height}`}
        onPointerDown={(event, action) => { if (hand && overview || event.button === 1) view.begin(event); else onPointerDown(event, action); }}/>
      {overview && <button type="button" className="composition-preview__map" aria-label="Navegar na prévia ampliada"
        style={{ width: output.width * mapScale, height: output.height * mapScale }} onPointerDown={event => { if (event.button === 0) view.begin(event, true); }}
        onKeyDown={event => {
          const shifts: Record<string, [number, number]> = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] };
          if (event.key === "Home") { event.preventDefault(); event.stopPropagation(); view.reset(); }
          else if (shifts[event.key]) { event.preventDefault(); event.stopPropagation(); view.shift(...shifts[event.key]); }
        }}>
        <span style={{ left: `${visible.left * 100}%`, top: `${visible.top * 100}%`, width: `${visible.width * 100}%`, height: `${visible.height * 100}%` }}/>
      </button>}
    </div>
    <div className="composition-preview__tools" role="group" aria-label="Visualização da prévia">
      <EditorAction compact label="Reduzir prévia" tooltip="Reduzir prévia (Ctrl + rolagem)" disabled={camera.zoom <= PREVIEW_ZOOM_MIN} icon={<MagnifyingGlassMinusIcon size={17} aria-hidden="true"/>} onClick={() => view.zoom(camera.zoom / 1.25)}/>
      <output aria-label="Ampliação da prévia">{Math.round(camera.zoom * 100)}%</output>
      <EditorAction compact label="Ampliar prévia" tooltip="Ampliar prévia (Ctrl + rolagem)" disabled={camera.zoom >= PREVIEW_ZOOM_MAX} icon={<MagnifyingGlassPlusIcon size={17} aria-hidden="true"/>} onClick={() => view.zoom(camera.zoom * 1.25)}/>
      <EditorAction compact label="Ajustar prévia à janela" icon={<CornersOutIcon size={17} aria-hidden="true"/>} onClick={() => { setHand(false); view.reset(); }}/>
      <EditorAction compact label="Mover visualização da prévia" tooltip="Mover visualização (também com o botão do meio do mouse)" pressed={hand} disabled={!overview} icon={<HandIcon size={17} aria-hidden="true"/>} onClick={() => setHand(active => !active)}/>
    </div>
  </div>;
}
