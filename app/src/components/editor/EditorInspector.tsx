import { ColorControl } from "../ColorControl";
import { AppSelect } from "../AppSelect";
import { aspectRatios, captionModels, type ToolId } from "../upload/tools";
import type { EditorSettings } from "../../lib/workspace-types";
import type { ReactNode } from "react";
import { ClosedCaptioningIcon } from "@phosphor-icons/react/dist/csr/ClosedCaptioning";
import { CropIcon } from "@phosphor-icons/react/dist/csr/Crop";
import { TextTIcon } from "@phosphor-icons/react/dist/csr/TextT";
import { SpeakerHighIcon } from "@phosphor-icons/react/dist/csr/SpeakerHigh";

export type EditorPanel = "captions" | "reframe" | "text" | "audio";
interface Props {
  panel: EditorPanel;
  settings: EditorSettings;
  onPanel: (panel: EditorPanel) => void;
  onSettings: (settings: Partial<EditorSettings>) => void;
  onCaptions: () => void;
  tools?: ReactNode;
}

export function panelForTool(tool: ToolId): EditorPanel { return tool === "reframe" ? "reframe" : "captions"; }

export function EditorInspector({ panel, settings, onPanel, onSettings, onCaptions, tools }: Props) {
  const panels: { id: EditorPanel; label: string }[] = [
    { id: "captions", label: "Legendas" }, { id: "reframe", label: "Enquadrar" },
    { id: "text", label: "Texto" }, { id: "audio", label: "Áudio" },
  ];
  const icons = { captions: ClosedCaptioningIcon, reframe: CropIcon, text: TextTIcon, audio: SpeakerHighIcon };
  return (
    <aside className="editor-inspector" aria-label="Ferramentas do editor">
      <h2>Ferramentas</h2>{tools}
      <nav aria-label="Painéis de edição">{panels.map((item) => (
        <button className="flow-button" type="button" key={item.id} aria-pressed={panel === item.id}
          aria-haspopup={item.id === "captions" ? "dialog" : undefined}
          onClick={() => { onPanel(item.id); if (item.id === "captions") onCaptions(); }}>{(() => { const Icon = icons[item.id]; return <Icon size={18} aria-hidden="true"/>; })()}{item.label}</button>
      ))}</nav>
      <div className="editor-inspector__body">
        {panel === "captions" ? <><h2>Legendas</h2><p className="flow-muted">{captionModels[settings.captionModel]}</p>
          <button type="button" className="flow-button" aria-haspopup="dialog" onClick={onCaptions}>Escolher estilo</button></>
        : panel === "reframe" ? <><h2>Enquadramento</h2>
          <label>Proporção<AppSelect value={settings.ratio} onChange={(event) => onSettings({ ratio: event.target.value as EditorSettings["ratio"] })}>
            {aspectRatios.map((ratio) => <option key={ratio}>{ratio}</option>)}
          </AppSelect></label>
          <label>Layout<AppSelect value={settings.fit} onChange={(event) => onSettings({ fit: event.target.value as EditorSettings["fit"] })}>
            <option value="contain">Ajustar ao quadro</option><option value="cover">Preencher quadro</option>
          </AppSelect></label>
          <div className="caption-field"><span>Fundo</span><ColorControl label="Fundo" value={settings.background} onChange={background => onSettings({ background })} /></div>
          {settings.fit === "cover" && <fieldset><legend>Área visível</legend>
            <label>Horizontal<input type="range" min={0} max={100} value={settings.focalPoint?.x ?? 50} onChange={event => onSettings({ focalPoint: { x: Number(event.target.value), y: settings.focalPoint?.y ?? 50 } })}/></label>
            <label>Vertical<input type="range" min={0} max={100} value={settings.focalPoint?.y ?? 50} onChange={event => onSettings({ focalPoint: { x: settings.focalPoint?.x ?? 50, y: Number(event.target.value) } })}/></label>
            <button type="button" className="flow-button" onClick={() => onSettings({ focalPoint: { x: 50, y: 50 } })}>Centralizar</button>
          </fieldset>}
          </>
        : panel === "text" ? <><h2>Texto sobre o vídeo</h2><label>Seu texto<textarea maxLength={240} value={settings.text}
          placeholder="Adicione uma chamada…" onChange={(event) => onSettings({ text: event.target.value })} /></label>
          <button type="button" className="flow-button" disabled={!settings.text} onClick={() => onSettings({ text: "" })}>Remover texto</button></>
        : <><h2>Áudio da prévia</h2><label>Volume: {Math.round(settings.volume * 100)}%<input type="range" min={0} max={1} step={0.01}
          value={settings.volume} onChange={(event) => onSettings({ volume: Number(event.target.value) })} /></label>
          <label className="editor-checkbox"><input type="checkbox" checked={settings.muted} onChange={(event) => onSettings({ muted: event.target.checked })} />Sem áudio</label>
          </>}
      </div>
    </aside>
  );
}
