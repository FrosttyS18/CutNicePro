import type { PointerEvent } from "react";
import { FilmStripIcon } from "@phosphor-icons/react/dist/csr/FilmStrip";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { FolderOpenIcon } from "@phosphor-icons/react/dist/csr/FolderOpen";
import { EditorAction } from "./EditorAction";
import { CompositionMediaPoster } from "./CompositionMediaPoster";
import { formatMediaTime } from "../../lib/workspace";
import type { CompositionAsset } from "../../lib/composition-types";
import type { TimelinePreviewData } from "./CompositionTrackLane";
import { RelinkMediaControl } from "../workspace/RelinkMediaControl";
import type { MediaEntryDto } from "../../lib/ipc";

interface Props {
  projectId?: string;
  assets: CompositionAsset[];
  selectedId?: string;
  previews: Record<string, TimelinePreviewData>;
  media: Record<string, { url: string | null; error: string | null; entry?:MediaEntryDto|null }>;
  onImport?:()=>void;
  importDisabled?:boolean;
  dropActive?:boolean;
  onAssetDrag?:(event:PointerEvent<HTMLElement>,asset:CompositionAsset)=>void;
  onContext?: (asset: CompositionAsset, point: { x: number; y: number }) => void;
  onSelect: (asset: CompositionAsset) => void;
  onOpen: (asset: CompositionAsset) => void;
  onInsert: (asset: CompositionAsset) => void;
}

export function CompositionMediaLibrary({ projectId, assets, selectedId, previews, media, onImport,importDisabled,dropActive,onAssetDrag,onSelect, onOpen, onInsert,onContext }: Props) {
  const selected = assets.find(asset => asset.id === selectedId);
  const selectedMedia = selected ? media[selected.id] : undefined;
  return <section className="composition-media" aria-label="Biblioteca de mídias" data-composition-library>
    <div className="composition-media__toolbar">
      <EditorAction label="Importar mídia" icon={<PlusIcon size={16} aria-hidden="true" />} disabled={!onImport||importDisabled} onClick={()=>onImport?.()} />
      <span>{assets.length} {assets.length === 1 ? "arquivo" : "arquivos"}</span>
    </div>
    {dropActive&&<p className="flow-muted" role="status">Solte para importar para a biblioteca.</p>}
    <ul className="composition-media__grid">
      {assets.map(asset => {
        const kind = asset.kind === "audio" ? "Áudio" : asset.kind === "image" ? "Imagem" : "Vídeo";
        return <li key={asset.id}>
          <button type="button" className="composition-media__asset" aria-pressed={selectedId === asset.id} aria-label={`Selecionar mídia: ${asset.name}`} aria-haspopup={onContext?"menu":undefined}
            draggable={false} style={{touchAction:"none"}} onDragStart={event=>event.preventDefault()}
            onPointerDown={event=>{if(event.button===0&&media[asset.id]?.url&&!importDisabled)onAssetDrag?.(event,asset);}}
            onContextMenu={event=>{if(!onContext)return;event.preventDefault();event.stopPropagation();onSelect(asset);onContext(asset,{x:event.clientX,y:event.clientY});}}
            onKeyDown={event=>{
              if(!onContext||!(event.key==="ContextMenu"||event.key==="F10"&&event.shiftKey))return;
              event.preventDefault();event.stopPropagation();const rect=event.currentTarget.getBoundingClientRect();onSelect(asset);onContext(asset,{x:rect.left,y:rect.bottom});
            }}
            onClick={event=>{if(event.currentTarget.dataset.assetDragged==="true"){delete event.currentTarget.dataset.assetDragged;if(event.detail!==0)return;}onSelect(asset);}} onDoubleClick={() => onOpen(asset)}>
            <span className="composition-media__thumbnail">
              <CompositionMediaPoster asset={asset} preview={previews[asset.id]?.frames[0]} imageUrl={media[asset.id]?.url}/>
              {asset.kind !== "image" && <span className="composition-media__duration">{formatMediaTime(asset.durationUs / 1e6)}</span>}
            </span>
            <span className="composition-media__name">{asset.name}</span>
            <span className="composition-media__kind">{kind}{media[asset.id]?.error ? " · Indisponível" : ""}</span>
          </button>
        </li>;
      })}
    </ul>
    {!assets.length && <div className="composition-media__empty"><FolderOpenIcon size={28} aria-hidden="true" /><p>Importe um vídeo, imagem ou áudio para começar.</p></div>}
    {selected && <div className="composition-media__selection">
      <span>{selected.name}</span>
      <div className="composition-media__actions">
        <EditorAction label="Adicionar no cursor" icon={<PlusIcon size={16} aria-hidden="true" />} disabled={!selectedMedia?.url} onClick={() => onInsert(selected)} />
        <EditorAction compact label="Abrir fonte selecionada" tooltip="Escolher um trecho da fonte" icon={<FilmStripIcon size={17} aria-hidden="true" />} onClick={() => onOpen(selected)} />
      </div>
      {selectedMedia?.error && <p className="composition-media__error" role="alert">{selectedMedia.error}</p>}
      {projectId && !selectedMedia?.url && selectedMedia?.error && <RelinkMediaControl key={selected.mediaId} projectId={projectId} mediaId={selected.mediaId} kind={selected.kind} knownEntry={selectedMedia.entry}/>}
    </div>}
  </section>;
}
