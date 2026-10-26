import { useLayoutEffect, useRef, useState } from "react";
import { defaultSplitScreen, isSplitScreen, splitLayoutAt, updateSplitPanel } from "../../lib/split-screen";
import type { EditorSettings, SplitPanel } from "../../lib/workspace-types";
import { suggestSplitFraming, type SplitFramingSource } from "../../services/split-framing";
import "./SplitScreenControls.css";

interface Props {
  settings: EditorSettings;
  source?: SplitFramingSource;
  sourceTime?: number;
  onSettings: (patch: Partial<EditorSettings>) => void;
}

interface Feedback {
  key: string;
  state: "loading" | "success" | "manual" | "error";
  message: string;
}

function contextKey(source: SplitFramingSource | undefined, ratio: EditorSettings["ratio"], layout: EditorSettings["splitScreen"]) {
  return JSON.stringify([source?.projectId, source?.mediaId, source?.start, source?.end, source?.viewport, ratio, layout ?? null]);
}

function PanelControls({ position, panel, onChange }: { position: "cima" | "baixo"; panel: SplitPanel; onChange: (patch: Partial<SplitPanel>) => void }) {
  return <fieldset className="split-screen__panel">
    <legend>Pessoa de {position}</legend>
    {([
      { key: "x", label: "Posição horizontal", min: 0, max: 100, step: 1, unit: "%" },
      { key: "y", label: "Posição vertical", min: 0, max: 100, step: 1, unit: "%" },
      { key: "zoom", label: "Zoom", min: 1, max: 3, step: 0.01, unit: "×" },
    ] as const).map(field => <label key={field.key} className="studio-field studio-range">
      <span className="studio-field__label">{field.label}
        <strong>{field.key === "zoom" ? panel[field.key].toFixed(2) : Math.round(panel[field.key])}{field.unit}</strong>
      </span>
      <input type="range" name={`split-${position}-${field.key}`} aria-label={`${field.label} da pessoa de ${position}`}
        min={field.min} max={field.max} step={field.step} value={panel[field.key]}
        onChange={event => onChange({ [field.key]: Number(event.target.value) })} />
    </label>)}
  </fieldset>;
}

export function SplitScreenControls({ settings, source, sourceTime, onSettings }: Props) {
  const layout = settings.ratio === "9:16" && isSplitScreen(settings.splitScreen) ? settings.splitScreen : null;
  const at = sourceTime ?? source?.start ?? 0;
  const active = layout ? splitLayoutAt(layout, at) : null;
  const key = contextKey(source, settings.ratio, settings.splitScreen);
  const request = useRef(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const currentFeedback = feedback?.key === key ? feedback : null;
  const busy = currentFeedback?.state === "loading";

  useLayoutEffect(() => () => { request.current += 1; }, [key]);

  const changeManually = (patch: Partial<EditorSettings>) => {
    request.current += 1;
    setFeedback(null);
    onSettings(patch);
  };

  const locate = async () => {
    if (!source || busy) return;
    const id = ++request.current;
    setFeedback({ key, state: "loading", message: "Localizando pessoas e mudanças de câmera no trecho…" });
    try {
      const suggestion = await suggestSplitFraming(source);
      if (request.current !== id) return;
      if (suggestion.status === "found") {
        onSettings({ ...(settings.ratio !== "9:16" ? { ratio: "9:16" } : {}), splitScreen: suggestion.layout });
        setFeedback({ key: contextKey(source, "9:16", suggestion.layout), state: "success", message: suggestion.message });
      } else {
        setFeedback({ key, state: "manual", message: suggestion.message });
      }
    } catch (error) {
      if (request.current !== id) return;
      const message = error instanceof Error ? error.message : typeof error === "string" ? error : "Não foi possível localizar duas pessoas. Tente novamente ou use quadro único.";
      setFeedback({ key, state: "error", message });
    }
  };

  const changePanel = (position: "top" | "bottom", patch: Partial<SplitPanel>) => {
    if (layout && active) changeManually({ splitScreen: updateSplitPanel(layout, at, position, patch) });
  };

  return <div className="split-screen-controls">
    <div className="studio-field">
      <span className="studio-field__label">Composição</span>
      <div className="studio-toggle-group split-screen__composition" role="group" aria-label="Composição do vídeo">
        <button type="button" className="studio-toggle studio-toggle--wide" aria-pressed={!layout}
          onClick={() => { if (layout) changeManually({ splitScreen: null }); }}>Quadro único</button>
        <button type="button" className="studio-toggle studio-toggle--wide" aria-pressed={Boolean(layout)}
          onClick={() => { if(!layout?.faceValidated)changeManually({...(settings.ratio!=="9:16"?{ratio:"9:16"}:{}),splitScreen:{version:1,top:layout?.top??defaultSplitScreen().top,bottom:layout?.bottom??defaultSplitScreen().bottom,faceValidated:true}}); }}>Duas pessoas (empilhadas)</button>
      </div>
    </div>
    <div className="split-screen__automatic">
      {!layout && <p>Escolha duas pessoas para ajustar os painéis manualmente.</p>}
      {!source && <p role="status">Conecte um vídeo local para usar a localização automática. O ajuste manual continua disponível.</p>}
      {currentFeedback && <p className="split-screen__feedback" role={currentFeedback.state === "error" ? "alert" : "status"}
        aria-live="polite">{currentFeedback.message}</p>}
    </div>
    {layout && <>
      <p>{layout.shots ? "A composição acompanha as cenas. Closes permanecem em quadro único." : "Dois enquadramentos no formato vertical 9:16. Ajuste cada pessoa separadamente."}</p>
      <div className="split-screen__automatic">
        <button type="button" className="flow-button" disabled={busy || !source} onClick={() => { void locate(); }}>
          {busy ? "Localizando…" : "Localizar duas pessoas"}
        </button>
        <p>A busca analisa este trecho no dispositivo.</p>
      </div>
      {active ? <>
        <PanelControls position="cima" panel={active.top} onChange={patch => changePanel("top", patch)} />
        <PanelControls position="baixo" panel={active.bottom} onChange={patch => changePanel("bottom", patch)} />
      </> : <p>Neste ponto há um quadro único. Avance até uma cena com duas pessoas para ajustar seus painéis.</p>}
    </>}
  </div>;
}
