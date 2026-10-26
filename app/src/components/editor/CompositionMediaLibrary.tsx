import { useRef, useState } from "react";
import { FilmStripIcon } from "@phosphor-icons/react/dist/csr/FilmStrip";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { FolderOpenIcon } from "@phosphor-icons/react/dist/csr/FolderOpen";
import { EditorAction } from "./EditorAction";
import { EditorMenu, type EditorMenuItem } from "./EditorMenu";
import { CompositionMediaPoster } from "./CompositionMediaPoster";
import { formatMediaTime } from "../../lib/workspace";
import type { CompositionAsset } from "../../lib/composition-types";
import type { TimelinePreviewData } from "./CompositionTrackLane";

interface Props {
  assets: CompositionAsset[];
  selectedId?: string;
  previews: Record<string, TimelinePreviewData>;
  media: Record<string, { url: string | null; error: string | null }>;
  addItems: EditorMenuItem[];
  onSelect: (asset: CompositionAsset) => void;
  onOpen: (asset: CompositionAsset) => void;
  onInsert: (asset: CompositionAsset) => void;
}

export function CompositionMediaLibrary({ assets, selectedId, previews, media, addItems, onSelect, onOpen, onInsert }: Props) {
  const anchor = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const selected = assets.find(asset => asset.id === selectedId);
  return <section className="composition-media" aria-label="Biblioteca de mídias">
    <div className="composition-media__toolbar" ref={anchor}>
      <EditorAction label="Importar mídia" icon={<PlusIcon size={16} aria-hidden="true" />} disabled={!addItems.length} onClick={() => {
        const rect = anchor.current!.getBoundingClientRect();
        setMenu({ x: rect.left, y: rect.bottom + 8 });
      }} />
      <span>{assets.length} {assets.length === 1 ? "arquivo" : "arquivos"}</span>
    </div>
    <ul className="composition-media__grid">
      {assets.map(asset => {
        const kind = asset.kind === "audio" ? "Áudio" : asset.kind === "image" ? "Imagem" : "Vídeo";
        return <li key={asset.id}>
          <button type="button" className="composition-media__asset" aria-pressed={selectedId === asset.id} aria-label={`Selecionar mídia: ${asset.name}`}
            onClick={() => onSelect(asset)} onDoubleClick={() => onOpen(asset)}>
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
        <EditorAction label="Adicionar no cursor" icon={<PlusIcon size={16} aria-hidden="true" />} disabled={!media[selected.id]?.url} onClick={() => onInsert(selected)} />
        <EditorAction compact label="Abrir fonte selecionada" tooltip="Escolher um trecho da fonte" icon={<FilmStripIcon size={17} aria-hidden="true" />} onClick={() => onOpen(selected)} />
      </div>
    </div>}
    {menu && <EditorMenu label="Importar mídia" {...menu} items={addItems} onClose={() => setMenu(null)} />}
  </section>;
}
