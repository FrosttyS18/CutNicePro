import { AppSelect } from "../AppSelect";
import { CropIcon } from "@phosphor-icons/react/dist/csr/Crop";
import { ScissorsIcon } from "@phosphor-icons/react/dist/csr/Scissors";
import { aspectRatios } from "../upload/tools";
import type { EditorSettings } from "../../lib/workspace-types";

interface Props { settings: EditorSettings; onSettings: (change: Partial<EditorSettings>) => void; onFrame: () => void }
export function FramingToolbar({ settings, onSettings, onFrame }: Props) {
  return <div className="framing-toolbar">
    <label><span className="sr-only">Proporção do vídeo</span><AppSelect aria-label="Proporção do vídeo" value={settings.ratio}
      onChange={event => onSettings({ ratio: event.target.value as EditorSettings["ratio"] })}>{aspectRatios.map(ratio => <option key={ratio}>{ratio}</option>)}</AppSelect></label>
    <label><span className="sr-only">Ajuste do vídeo</span><AppSelect aria-label="Ajuste do vídeo" value={settings.fit}
      onChange={event => onSettings({ fit: event.target.value as EditorSettings["fit"] })}><option value="contain">Ajustar</option><option value="cover">Preencher</option></AppSelect></label>
    <button type="button" className="flow-button" onClick={onFrame}><CropIcon size={16} aria-hidden="true"/>Enquadrar</button>
    <button type="button" className="flow-button" onClick={() => document.querySelector<HTMLInputElement>("#editor-trim input")?.focus()}><ScissorsIcon size={16} aria-hidden="true"/>Recortar</button>
  </div>;
}
