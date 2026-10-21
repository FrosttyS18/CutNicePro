import { ColorControl } from "../ColorControl";
import { AppSelect } from "../AppSelect";
import { aspectRatios, type ToolId } from "../upload/tools";
import { captionFonts, captionPresets, effectiveCaptionStyle, type CaptionStyle } from "../../lib/captions";
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
  const caption = effectiveCaptionStyle(settings.captionModel, settings.captionStyle);
  const setCaption = (change: Partial<CaptionStyle>) => onSettings({ captionStyle: { ...caption, ...change } });
  const focal = settings.focalPoint ?? { x: 50, y: 50 };
  return (
    <aside className="editor-inspector" aria-label="Ferramentas do editor">
      <nav className="editor-inspector__tabs" aria-label="Painéis de edição">{panels.map((item) => {
        const Icon = icons[item.id];
        return <button className="editor-inspector__tab" type="button" key={item.id} aria-pressed={panel === item.id}
          title={item.label}
          onClick={() => onPanel(item.id)}>
          <Icon size={16} aria-hidden="true"/><span>{item.label}</span>
        </button>;
      })}</nav>
      <div className="editor-inspector__body">
        {panel === "captions" ? <>
          <h2>Legendas</h2>
          <label>Estilo<AppSelect aria-label="Estilo de legenda" value={settings.captionModel}
            onChange={(event) => { const model = Number(event.target.value); onSettings({ captionModel: model, captionStyle: { ...captionPresets[model].style } }); }}>
            {captionPresets.map((preset, index) => <option key={preset.name} value={index}>{preset.name}</option>)}
          </AppSelect></label>
          <label>Fonte<AppSelect aria-label="Fonte da legenda" value={caption.font} onChange={(event) => setCaption({ font: event.target.value as CaptionStyle["font"] })}>
            {captionFonts.map((font) => <option key={font}>{font}</option>)}
          </AppSelect></label>
          <label>Tamanho: {caption.size}<input aria-label="Tamanho da legenda" type="range" min={16} max={160} value={caption.size}
            onChange={(event) => setCaption({ size: Number(event.target.value) })} /></label>
          <label>Peso<AppSelect aria-label="Peso da fonte" value={caption.weight} onChange={(event) => setCaption({ weight: Number(event.target.value) as CaptionStyle["weight"] })}>
            <option value={400}>Normal</option><option value={600}>Seminegrito</option><option value={700}>Negrito</option>
          </AppSelect></label>
          <label>Posição<AppSelect aria-label="Posição da legenda" value={caption.position} onChange={(event) => setCaption({ position: event.target.value as CaptionStyle["position"] })}>
            <option value="bottom">Inferior</option><option value="middle">Centro</option><option value="top">Superior</option>
          </AppSelect></label>
          <label>Efeito<AppSelect aria-label="Efeito da legenda" value={caption.effect} onChange={(event) => setCaption({ effect: event.target.value as CaptionStyle["effect"] })}>
            <option value="none">Nenhum</option><option value="highlight">Destaque de palavra</option><option value="karaoke">Karaokê</option>
          </AppSelect></label>
          <div className="caption-field"><span>Cor do texto</span><ColorControl label="Cor do texto" value={caption.color} onChange={color => setCaption({ color })} /></div>
          <div className="caption-field"><span>Cor do destaque</span><ColorControl label="Cor do destaque" value={caption.highlightColor} onChange={highlightColor => setCaption({ highlightColor })} /></div>
          <label>Contorno: {caption.outline}<input aria-label="Contorno da legenda" type="range" min={0} max={12} value={caption.outline}
            onChange={(event) => setCaption({ outline: Number(event.target.value) })} /></label>
          <div className="caption-field"><span>Cor do contorno</span><ColorControl label="Cor do contorno" value={caption.outlineColor} onChange={outlineColor => setCaption({ outlineColor })} /></div>
          <label className="editor-checkbox"><input type="checkbox" checked={caption.shadow} onChange={(event) => setCaption({ shadow: event.target.checked })} />Sombra</label>
          <div className="caption-field"><span>Fundo</span><ColorControl label="Fundo da legenda" value={caption.background === "transparent" ? "#000000" : caption.background} onChange={background => setCaption({ background })} />
            <button type="button" className="flow-text-button" aria-label="Remover fundo da legenda" disabled={caption.background === "transparent"} onClick={() => setCaption({ background: "transparent" })}>Sem fundo</button></div>
          <fieldset><legend>Aparência do texto</legend>
            <label className="editor-checkbox"><input type="checkbox" checked={caption.italic} onChange={(event) => setCaption({ italic: event.target.checked })} />Itálico</label>
            <label className="editor-checkbox"><input type="checkbox" checked={caption.underline} onChange={(event) => setCaption({ underline: event.target.checked })} />Sublinhado</label>
            <label className="editor-checkbox"><input type="checkbox" checked={caption.uppercase} onChange={(event) => setCaption({ uppercase: event.target.checked })} />MAIÚSCULAS</label>
          </fieldset>
          <button type="button" className="flow-button" aria-haspopup="dialog" onClick={onCaptions}>Ver estilos prontos</button>
          <p className="flow-muted">Para corrigir palavras, edite a transcrição no painel esquerdo.</p>
        </>
        : panel === "reframe" ? <>
          <h2>Enquadramento</h2>
          <label>Proporção<AppSelect aria-label="Proporção do vídeo" value={settings.ratio} onChange={(event) => onSettings({ ratio: event.target.value as EditorSettings["ratio"] })}>
            {aspectRatios.map((ratio) => <option key={ratio}>{ratio}</option>)}
          </AppSelect></label>
          <label>Ajuste da imagem<AppSelect aria-label="Ajuste do vídeo" value={settings.fit} onChange={(event) => onSettings({ fit: event.target.value as EditorSettings["fit"] })}>
            <option value="contain">Ajustar (imagem inteira com espaço vazio)</option><option value="cover">Preencher (corta o excedente)</option>
          </AppSelect></label>
          <div className="caption-field"><span>Fundo</span><ColorControl label="Fundo" value={settings.background} onChange={background => onSettings({ background })} /></div>
          {settings.fit === "cover" && <fieldset><legend>Área visível</legend>
            <label>Horizontal: {focal.x}<input aria-label="Posição horizontal" type="range" min={0} max={100} value={focal.x} onChange={event => onSettings({ focalPoint: { x: Number(event.target.value), y: focal.y } })} /></label>
            <label>Vertical: {focal.y}<input aria-label="Posição vertical" type="range" min={0} max={100} value={focal.y} onChange={event => onSettings({ focalPoint: { x: focal.x, y: Number(event.target.value) } })} /></label>
            <button type="button" className="flow-button" onClick={() => onSettings({ focalPoint: { x: 50, y: 50 } })}>Centralizar imagem</button>
          </fieldset>}
          <button type="button" className="flow-button" onClick={() => onSettings({ fit: "contain", focalPoint: { x: 50, y: 50 } })}>Restaurar enquadramento</button>
        </>
        : panel === "text" ? <>
          <h2>Texto sobre o vídeo</h2>
          <label>Seu texto<textarea maxLength={240} value={settings.text}
            placeholder="Adicione uma chamada…" onChange={(event) => onSettings({ text: event.target.value })} /></label>
          <button type="button" className="flow-button" disabled={!settings.text} onClick={() => onSettings({ text: "" })}>Remover texto</button>
        </>
        : <>
          <h2>Áudio da prévia</h2>
          <label>Volume: {Math.round(settings.volume * 100)}%<input type="range" min={0} max={1} step={0.01}
            value={settings.volume} onChange={(event) => onSettings({ volume: Number(event.target.value) })} /></label>
          <label className="editor-checkbox"><input type="checkbox" checked={settings.muted} onChange={(event) => onSettings({ muted: event.target.checked })} />Sem áudio</label>
        </>}
      </div>
      {tools && <section className="editor-inspector__actions" aria-label="Ações do projeto">
        <h2>Ações do projeto</h2>{tools}
      </section>}
    </aside>
  );
}
