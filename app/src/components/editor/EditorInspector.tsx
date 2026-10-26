import { useState, type ReactNode } from "react";
import { AppSelect } from "../AppSelect";
import { editorAspectRatios, type ToolId } from "../upload/tools";
import { captionFonts, captionPresets, effectiveCaptionStyle, type CaptionStyle } from "../../lib/captions";
import { DEFAULT_EFFECTS } from "../../lib/workspace";
import type { EditorEffects, EditorSettings } from "../../lib/workspace-types";
import { isSplitScreen } from "../../lib/split-screen";
import type { SplitFramingSource } from "../../services/split-framing";
import { SplitScreenControls } from "./SplitScreenControls";
import { ClosedCaptioningIcon } from "@phosphor-icons/react/dist/csr/ClosedCaptioning";
import { CropIcon } from "@phosphor-icons/react/dist/csr/Crop";
import { PaletteIcon } from "@phosphor-icons/react/dist/csr/Palette";
import { SpeakerHighIcon } from "@phosphor-icons/react/dist/csr/SpeakerHigh";
import { BookmarkSimpleIcon } from "@phosphor-icons/react/dist/csr/BookmarkSimple";
import { FolderOpenIcon } from "@phosphor-icons/react/dist/csr/FolderOpen";
import { CheckSquareIcon } from "@phosphor-icons/react/dist/csr/CheckSquare";
import { ArrowsInIcon } from "@phosphor-icons/react/dist/csr/ArrowsIn";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowCounterClockwise";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";

export type EditorPanel = "captions" | "reframe" | "audio" | "effects";
interface Props {
  panel: EditorPanel;
  settings: EditorSettings;
  onPanel: (panel: EditorPanel) => void;
  onSettings: (settings: Partial<EditorSettings>) => void;
  source?: SplitFramingSource;
  sourceTime?: number;
  reframeContent?: ReactNode;
  /** Aplica o estilo de legenda atual a todos os cortes do projeto (não destrutivo). */
  onApplyAll?: (model: number, style: CaptionStyle) => Promise<void>;
  onApplyMontage?: (model: number, style: CaptionStyle) => Promise<void>;
  applyAllUnavailableReason?: string;
}

export function panelForTool(tool: ToolId): EditorPanel { return tool === "reframe" ? "reframe" : "captions"; }

function SwitchRow({ id, label, checked, onChange }: { id: string; label: ReactNode; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="studio-switch-row">
      <label htmlFor={id}>{label}</label>
      <button type="button" id={id} role="switch" aria-checked={checked} className="studio-switch"
        onClick={() => onChange(!checked)}>
        <span className="studio-switch__knob" aria-hidden="true" />
      </button>
    </div>
  );
}

function ColorField({ label, inputLabel, value, onChange }: { label: string; inputLabel: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="studio-field">
      <span className="studio-field__label">{label}</span>
      <div className="studio-color">
        <input aria-label={inputLabel} type="color" value={value} onChange={(event) => onChange(event.target.value)} />
        <span className="studio-color__value">{value.toUpperCase()}</span>
      </div>
    </div>
  );
}

function RangeField({ label, value, min, max, step = 1, unit = "", onChange, inputLabel }:
  { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void; inputLabel: string }) {
  return (
    <div className="studio-field studio-range">
      <span className="studio-field__label">{label}: <strong>{Number.isInteger(value) ? value : value.toFixed(step < 1 ? 1 : 0)}{unit}</strong></span>
      <input aria-label={inputLabel} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}

const RATIO_LABELS: Record<string, { ratio: string; name: string }> = {
  "9:16": { ratio: "9:16", name: "Vertical" }, "1:1": { ratio: "1:1", name: "Quadrado" },
  original: { ratio: "Src", name: "Original" }, "16:9": { ratio: "16:9", name: "Paisagem" }, "4:5": { ratio: "4:5", name: "Retrato" },
};

export function EditorInspector({ panel, settings, onPanel, onSettings, onApplyAll, onApplyMontage, applyAllUnavailableReason, source, sourceTime, reframeContent }: Props) {
  const panels: { id: EditorPanel; label: string }[] = [
    { id: "captions", label: "Legendas" }, { id: "reframe", label: "Enquadrar" },
    { id: "audio", label: "Áudio" }, { id: "effects", label: "Efeitos" },
  ];
  const icons = { captions: ClosedCaptioningIcon, reframe: CropIcon, audio: SpeakerHighIcon, effects: PaletteIcon };
  const [notice, setNotice] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyingMontage,setApplyingMontage] = useState(false);
  const [todosEstilos, setTodosEstilos] = useState(false);
  const caption = effectiveCaptionStyle(settings.captionModel, settings.captionStyle);
  const setCaption = (change: Partial<CaptionStyle>) => onSettings({ captionStyle: { ...caption, ...change } });
  const effects = settings.effects ?? { ...DEFAULT_EFFECTS };
  const setEffect = (change: Partial<EditorEffects>) => onSettings({ effects: { ...effects, ...change } });
  const enabled = settings.captionModel > 0;
  const saveKey = "cnp-caption-style";
  const split = settings.ratio === "9:16" && isSplitScreen(settings.splitScreen);
  return (
    <aside className="editor-inspector" aria-label="Ferramentas do editor">
      <nav className="studio-tabs" aria-label="Abas de edição">{panels.map((item) => {
        const Icon = icons[item.id];
        return <button className="studio-tab" type="button" key={item.id} aria-pressed={panel === item.id}
          onClick={() => onPanel(item.id)}>
          <Icon size={18} aria-hidden="true"/><span>{item.label}</span>
        </button>;
      })}</nav>
      <div className="editor-inspector__body">
        {panel === "captions" ? <>
          <section className="studio-section">
            <header className="studio-section__head">
              <div>
                <h2>Estilo de legenda</h2>
                <p>Escolha um visual e refine abaixo.</p>
              </div>
              <SwitchRow id="captions-enabled" label={<span className="sr-only">Mostrar legendas</span>}
                checked={enabled} onChange={(on) => onSettings({ captionModel: on ? Math.max(1, settings.captionModel) : 0 })} />
            </header>
            <div className="studio-presets" role="group" aria-label="Presets de legenda">
              {([["Limpo", "transparent", "#FFFFFF"], ["Destaque", "#181818", "#FACC15"], ["Pop", "#181818", "#A3E635"]] as const).map(([name, background, accent]) => {
                const active = caption.background === background && caption.highlightColor.toUpperCase() === accent;
                return (
                  <button type="button" key={name} className="studio-preset" aria-pressed={active}
                    onClick={() => setCaption({ background, highlightColor: accent })}>
                    <span className="studio-preset__sample">
                      <span className="studio-preset__caption" style={background === "transparent" ? undefined : { background }}>
                        Sua <span style={{ color: accent }}>história</span>
                      </span>
                    </span>
                    <span className="studio-preset__name">{name}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" className="studio-toggle-estilos" aria-expanded={todosEstilos}
              aria-label={todosEstilos ? "Mostrar menos estilos" : "Ver todos os 10 estilos"}
              onClick={() => setTodosEstilos(current => !current)}>
              <CaretDownIcon size={18} aria-hidden="true"/>
            </button>
            {todosEstilos && <div className="studio-presets studio-presets--all" role="group" aria-label="Todos os estilos prontos">
              {captionPresets.map((preset, index) => (
                <button type="button" key={preset.name} className="studio-preset"
                  aria-pressed={settings.captionModel === index}
                  onClick={() => onSettings({ captionModel: index, captionStyle: { ...preset.style } })}>
                  <span className="studio-preset__sample">
                    <span className="studio-preset__caption" style={preset.style.background === "transparent" ? undefined : { background: preset.style.background }}>
                      Sua <span style={{ color: preset.style.highlightColor }}>história</span>
                    </span>
                  </span>
                  <span className="studio-preset__name">{preset.name}</span>
                </button>
              ))}
            </div>}
            <div className="studio-field">
              <span className="studio-field__label">Fonte</span>
              <AppSelect aria-label="Fonte da legenda" value={caption.font}
                onChange={(event) => setCaption({ font: event.target.value as CaptionStyle["font"] })}>
                {captionFonts.map((font) => <option key={font}>{font}</option>)}
              </AppSelect>
            </div>
            <RangeField label="Tamanho" inputLabel="Tamanho da legenda" value={caption.size} min={16} max={160}
              onChange={(size) => setCaption({ size })} />
            <RangeField label="Posição vertical" inputLabel="Posição vertical da legenda" value={Math.round(caption.y! * 100)}
              min={10} max={90} unit="%" onChange={(y) => setCaption({ y: y / 100 })} />
            <div className="studio-grid-2">
              <ColorField label="Texto" inputLabel="Cor do texto da legenda" value={caption.color} onChange={color => setCaption({ color })} />
              <ColorField label="Destaque" inputLabel="Cor do destaque" value={caption.highlightColor} onChange={highlightColor => setCaption({ highlightColor })} />
            </div>
            <SwitchRow id="caption-background" label="Fundo do texto"
              checked={caption.background !== "transparent"}
              onChange={(on) => setCaption({ background: on ? "#181818" : "transparent" })} />
            <SwitchRow id="caption-highlight" label="Destacar palavra falada"
              checked={caption.effect !== "none"}
              onChange={(on) => setCaption({ effect: on ? "highlight" : "none" })} />
            <SwitchRow id="caption-uppercase" label="MAIÚSCULAS"
              checked={caption.uppercase}
              onChange={(uppercase) => setCaption({ uppercase })} />
            <div className="studio-inline-select">
              <span className="studio-field__label" id="words-per-caption-label">Palavras por legenda</span>
              <span className="studio-select-narrow">
                <AppSelect aria-labelledby="words-per-caption-label" value={String(caption.wordsPerCaption)}
                  onChange={(event) => setCaption({ wordsPerCaption: Number(event.target.value) })}>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
                </AppSelect>
              </span>
            </div>
            <div className="studio-grid-2">
              <button type="button" className="flow-button" onClick={() => {
                try {
                  window.localStorage.setItem(saveKey, JSON.stringify({ captionModel: settings.captionModel, captionStyle: caption }));
                  setNotice("Estilo salvo neste dispositivo.");
                } catch { setNotice("Não foi possível salvar o estilo aqui."); }
              }}><BookmarkSimpleIcon size={16} aria-hidden="true"/>Salvar estilo</button>
              <button type="button" className="flow-button" onClick={() => {
                try {
                  const saved = JSON.parse(window.localStorage.getItem(saveKey) ?? "null");
                  if (saved?.captionStyle?.font && saved?.captionStyle?.size) {
                    onSettings({ captionModel: saved.captionModel ?? 1, captionStyle: { ...saved.captionStyle } });
                    setNotice("Estilo carregado.");
                  } else setNotice("Salve um estilo primeiro.");
                } catch { setNotice("Não foi possível carregar o estilo salvo."); }
              }}><FolderOpenIcon size={16} aria-hidden="true"/>Carregar estilo</button>
              {onApplyMontage&&<button type="button" className="flow-button studio-span-2" disabled={applyingMontage||applying}
                onClick={async()=>{setApplyingMontage(true);try{await onApplyMontage(settings.captionModel,caption);setNotice("Estilo aplicado à montagem. Salve para confirmar.");}
                  catch{setNotice("Não foi possível aplicar o estilo à montagem.");}finally{setApplyingMontage(false);}}}>
                <CheckSquareIcon size={16} aria-hidden="true"/>{applyingMontage?"Aplicando…":"Aplicar estilo à montagem"}
              </button>}
              <button type="button" className="flow-button studio-span-2" disabled={applying || applyingMontage || !onApplyAll}
                onClick={async () => {
                  setApplying(true);
                  try { await onApplyAll!(settings.captionModel, caption); setNotice("Estilo preparado nos cortes. Salve para confirmar."); }
                  catch { setNotice("Não foi possível aplicar a todos os cortes."); }
                  finally { setApplying(false); }
                }}>
                <CheckSquareIcon size={16} aria-hidden="true"/>{applying ? "Aplicando…" : "Aplicar a todos os cortes"}
              </button>
            </div>
            {!onApplyAll&&applyAllUnavailableReason&&<p className="flow-muted">{applyAllUnavailableReason}</p>}
            {notice && <p className="studio-notice" role="status">{notice}</p>}
          </section>
          <hr className="studio-separator" />
          <section className="studio-section">
            <h2>Texto sobre o vídeo</h2>
            <label className="studio-textarea">Seu texto
              <textarea maxLength={240} value={settings.text} placeholder="Adicione uma chamada…"
                onChange={(event) => onSettings({ text: event.target.value })} />
            </label>
            <button type="button" className="flow-button" disabled={!settings.text} onClick={() => onSettings({ text: "" })}>Remover texto</button>
          </section>
        </>
        : panel === "reframe" ? <>
          {reframeContent}
          <section className="studio-section">
            <h2>Enquadramento</h2>
            <p>{split ? "Ajuste os dois enquadramentos nos controles abaixo." : "Arraste o vídeo na prévia para manter o assunto em foco."}</p>
            <div className="studio-field">
              <span className="studio-field__label">Proporção</span>
              <div className="studio-toggle-group" role="group" aria-label="Proporção do vídeo">
                {editorAspectRatios.map((ratio) => (
                  <button type="button" key={ratio} className="studio-toggle" aria-pressed={settings.ratio === ratio}
                    aria-label={RATIO_LABELS[ratio].name}
                    onClick={() => onSettings(ratio === "9:16" ? { ratio } : { ratio, splitScreen: null })}>
                    <span className="studio-toggle__value">{RATIO_LABELS[ratio].ratio}</span>
                    <span className="studio-toggle__name">{RATIO_LABELS[ratio].name}</span>
                  </button>
                ))}
              </div>
            </div>
            <SplitScreenControls settings={settings} source={source} sourceTime={sourceTime} onSettings={onSettings} />
            {!split && <div className="studio-field">
              <span className="studio-field__label">Ajuste</span>
              <div className="studio-toggle-group" role="group" aria-label="Ajuste do vídeo">
                <button type="button" className="studio-toggle studio-toggle--wide" aria-pressed={settings.fit === "cover"}
                  onClick={() => onSettings({ fit: "cover" })}>Preencher quadro</button>
                <button type="button" className="studio-toggle studio-toggle--wide" aria-pressed={settings.fit === "contain"}
                  onClick={() => onSettings({ fit: "contain" })}>Vídeo completo</button>
              </div>
            </div>}
            <ColorField label="Fundo" inputLabel="Cor de fundo" value={settings.background} onChange={background => onSettings({ background })} />
          </section>
          {!split && <><hr className="studio-separator" />
          <section className="studio-section">
            <h2>Posição</h2>
            <RangeField label="Zoom" inputLabel="Zoom" value={settings.zoom ?? 1} min={1} max={3} step={0.01} unit="×"
              onChange={(zoom) => onSettings({ zoom })} />
            <RangeField label="Posição horizontal" inputLabel="Posição horizontal" value={settings.focalPoint?.x ?? 50} min={0} max={100} unit="%"
              onChange={(x) => onSettings({ focalPoint: { x, y: settings.focalPoint?.y ?? 50 } })} />
            <RangeField label="Posição vertical" inputLabel="Posição vertical" value={settings.focalPoint?.y ?? 50} min={0} max={100} unit="%"
              onChange={(y) => onSettings({ focalPoint: { x: settings.focalPoint?.x ?? 50, y } })} />
            <button type="button" className="flow-button" onClick={() => onSettings({ focalPoint: { x: 50, y: 50 }, zoom: 1 })}>
              <ArrowsInIcon size={16} aria-hidden="true"/>Centralizar assunto
            </button>
          </section></>}
        </>
        : panel === "audio" ? <>
          <section className="studio-section">
            <h2>Áudio</h2>
            <p>As alterações de áudio entram na exportação.</p>
            <RangeField label="Volume" inputLabel="Volume" value={Math.round(settings.volume * 100)} min={0} max={200} unit="%"
              onChange={(volume) => onSettings({ volume: volume / 100 })} />
            <SwitchRow id="mute-export" label="Silenciar áudio da exportação"
              checked={settings.muted} onChange={(muted) => onSettings({ muted })} />
            {settings.volume > 1 && <p className="flow-muted">A prévia reproduz até 100 %; o valor acima disso é aplicado no arquivo exportado. Aumentar muito pode distorcer picotes altos.</p>}
          </section>
        </>
        : <>
          <section className="studio-section">
            <header className="studio-section__head">
              <div>
                <h2>Efeitos</h2>
                <p>Aplicados ao vídeo; as legendas continuam nítidas.</p>
              </div>
              <button type="button" className="flow-text-button" onClick={() => onSettings({ effects: { ...DEFAULT_EFFECTS } })}>
                <ArrowCounterClockwiseIcon size={14} aria-hidden="true"/>Restaurar
              </button>
            </header>
            <RangeField label="Brilho" inputLabel="Brilho" value={effects.brightness} min={40} max={180}
              onChange={(brightness) => setEffect({ brightness })} />
            <RangeField label="Contraste" inputLabel="Contraste" value={effects.contrast} min={40} max={180}
              onChange={(contrast) => setEffect({ contrast })} />
            <RangeField label="Saturação" inputLabel="Saturação" value={effects.saturation} min={0} max={220}
              onChange={(saturation) => setEffect({ saturation })} />
            <RangeField label="Desfoque" inputLabel="Desfoque" value={effects.blur} min={0} max={8} step={0.1}
              onChange={(blur) => setEffect({ blur })} />
            <RangeField label="Matiz" inputLabel="Matiz" value={effects.hue} min={-180} max={180}
              onChange={(hue) => setEffect({ hue })} />
          </section>
        </>}
      </div>
    </aside>
  );
}
