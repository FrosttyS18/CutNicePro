import { aspectRatios, captionModels, type ToolId } from "../upload/tools";
import type { EditorSettings } from "../../lib/workspace-types";

export type EditorPanel = "captions" | "reframe" | "text" | "audio";
interface Props {
  panel: EditorPanel;
  settings: EditorSettings;
  onPanel: (panel: EditorPanel) => void;
  onSettings: (settings: Partial<EditorSettings>) => void;
  onCaptions: () => void;
}

export function panelForTool(tool: ToolId): EditorPanel { return tool === "reframe" ? "reframe" : "captions"; }

export function EditorInspector({ panel, settings, onPanel, onSettings, onCaptions }: Props) {
  const panels: { id: EditorPanel; label: string }[] = [
    { id: "captions", label: "Legendas" }, { id: "reframe", label: "Enquadrar" },
    { id: "text", label: "Texto" }, { id: "audio", label: "Áudio" },
  ];
  return (
    <aside className="editor-inspector" aria-label="Ferramentas do editor">
      <nav aria-label="Painéis de edição">{panels.map((item) => (
        <button className="flow-button" type="button" key={item.id} aria-pressed={panel === item.id}
          aria-haspopup={item.id === "captions" ? "dialog" : undefined}
          onClick={() => { onPanel(item.id); if (item.id === "captions") onCaptions(); }}>{item.label}</button>
      ))}</nav>
      <div className="editor-inspector__body">
        {panel === "captions" ? <><h2>Legendas</h2><p className="flow-muted">{captionModels[settings.captionModel]}</p>
          <button type="button" className="flow-button" aria-haspopup="dialog" onClick={onCaptions}>Escolher estilo</button></>
        : panel === "reframe" ? <><h2>Enquadramento</h2>
          <label>Proporção<select value={settings.ratio} onChange={(event) => onSettings({ ratio: event.target.value as EditorSettings["ratio"] })}>
            {aspectRatios.map((ratio) => <option key={ratio}>{ratio}</option>)}
          </select></label>
          <label>Layout<select value={settings.fit} onChange={(event) => onSettings({ fit: event.target.value as EditorSettings["fit"] })}>
            <option value="contain">Ajustar ao quadro</option><option value="cover">Preencher quadro</option>
          </select></label>
          <label>Fundo<input type="color" value={settings.background} onChange={(event) => onSettings({ background: event.target.value })} /></label>
          <p className="flow-muted">O rastreamento automático será conectado ao motor de IA.</p></>
        : panel === "text" ? <><h2>Texto sobre o vídeo</h2><label>Seu texto<textarea maxLength={240} value={settings.text}
          placeholder="Adicione uma chamada…" onChange={(event) => onSettings({ text: event.target.value })} /></label>
          <button type="button" className="flow-button" disabled={!settings.text} onClick={() => onSettings({ text: "" })}>Remover texto</button></>
        : <><h2>Áudio da prévia</h2><label>Volume: {Math.round(settings.volume * 100)}%<input type="range" min={0} max={1} step={0.01}
          value={settings.volume} onChange={(event) => onSettings({ volume: Number(event.target.value) })} /></label>
          <label className="editor-checkbox"><input type="checkbox" checked={settings.muted} onChange={(event) => onSettings({ muted: event.target.checked })} />Sem áudio</label>
          <p className="flow-muted">Ajustes de áudio são aplicados à prévia local. Limpeza de fala e dublagem ficam para a integração de IA.</p></>}
      </div>
    </aside>
  );
}
