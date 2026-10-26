import { useLayoutEffect, useRef, useState } from "react";
import { defaultSplitScreen, isSplitScreen, splitLayoutAt, updateSplitPanel } from "../../lib/split-screen";
import type { EditorSettings, SplitPanel } from "../../lib/workspace-types";
import { suggestSplitFraming, type SplitFramingSource } from "../../services/split-framing";
import { RectangleIcon } from "@phosphor-icons/react/dist/csr/Rectangle";
import { RowsIcon } from "@phosphor-icons/react/dist/csr/Rows";
import { CrosshairIcon } from "@phosphor-icons/react/dist/csr/Crosshair";
import { EditorAction } from "./EditorAction";
import { InspectorNumberField } from "./InspectorNumberField";
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
    <div className="reframe-number-grid">
      <InspectorNumberField label={`Posição horizontal da pessoa de ${position}`} caption="Horizontal" name={`split-${position}-x`} value={panel.x} min={0} max={100} unit="%" onChange={x => onChange({ x })}/>
      <InspectorNumberField label={`Posição vertical da pessoa de ${position}`} caption="Vertical" name={`split-${position}-y`} value={panel.y} min={0} max={100} unit="%" onChange={y => onChange({ y })}/>
      <InspectorNumberField label={`Zoom da pessoa de ${position}`} caption="Zoom" name={`split-${position}-zoom`} value={panel.zoom} min={1} max={3} step={.01} clickStep={.1} unit="×" onChange={zoom => onChange({ zoom })}/>
    </div>
  </fieldset>;
}

export function SplitScreenControls({ settings, source, sourceTime, onSettings }: Props) {
  const layout = settings.ratio === "9:16" && isSplitScreen(settings.splitScreen) ? settings.splitScreen : null;
  const at = sourceTime ?? source?.start ?? 0;
  const active = layout ? splitLayoutAt(layout, at) : null;
  const shot = layout?.shots?.find(value => at >= value.sourceStart && at < value.sourceEnd);
  const panelKey = shot ? `${shot.sourceStart}:${shot.sourceEnd}` : "static";
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
    <div className="reframe-panel__head">
      <span className="studio-field__label">Composição</span>
      <div className="studio-toggle-group split-screen__composition" role="group" aria-label="Composição do vídeo">
        <EditorAction compact label="Quadro único" icon={<RectangleIcon size={18} aria-hidden="true"/>} pressed={!layout}
          onClick={() => { if (layout) changeManually({ splitScreen: null }); }}/>
        <EditorAction compact label="Duas pessoas (empilhadas)" tooltip="Duas pessoas empilhadas em 9:16, com ajustes independentes" icon={<RowsIcon size={18} aria-hidden="true"/>} pressed={Boolean(layout)}
          onClick={() => { if(!layout?.faceValidated)changeManually({...(settings.ratio!=="9:16"?{ratio:"9:16"}:{}),splitScreen:{version:1,top:layout?.top??defaultSplitScreen().top,bottom:layout?.bottom??defaultSplitScreen().bottom,faceValidated:true}}); }}/>
      </div>
    </div>
    <div className="split-screen__automatic">
      {!layout && <p>Escolha duas pessoas para ajustar os painéis manualmente.</p>}
      {!source && <p role="status">Conecte um vídeo local para usar a localização automática. O ajuste manual continua disponível.</p>}
      {currentFeedback && <p className="split-screen__feedback" role={currentFeedback.state === "error" ? "alert" : "status"}
        aria-live="polite">{currentFeedback.message}</p>}
    </div>
    {layout && <>
      {layout.shots&&<p>A composição acompanha as cenas. Closes permanecem em quadro único.</p>}
      <div className="split-screen__automatic">
        <button type="button" className="flow-button" disabled={busy || !source} onClick={() => { void locate(); }}>
          <CrosshairIcon size={16} aria-hidden="true"/>
          {busy ? "Localizando…" : "Localizar duas pessoas"}
        </button>
      </div>
      {active ? <>
        <PanelControls key={`top:${panelKey}`} position="cima" panel={active.top} onChange={patch => changePanel("top", patch)} />
        <PanelControls key={`bottom:${panelKey}`} position="baixo" panel={active.bottom} onChange={patch => changePanel("bottom", patch)} />
      </> : <p>Neste ponto há um quadro único. Avance até uma cena com duas pessoas para ajustar seus painéis.</p>}
    </>}
  </div>;
}
