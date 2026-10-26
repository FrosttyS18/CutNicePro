import { editorAspectRatios } from "../upload/tools";
import type { EditorSettings } from "../../lib/workspace-types";
import { isSplitScreen } from "../../lib/split-screen";
import type { SplitFramingSource } from "../../services/split-framing";
import { ArrowsInIcon } from "@phosphor-icons/react/dist/csr/ArrowsIn";
import { FrameCornersIcon } from "@phosphor-icons/react/dist/csr/FrameCorners";
import { RectangleIcon } from "@phosphor-icons/react/dist/csr/Rectangle";
import { EditorAction } from "./EditorAction";
import { InspectorNumberField } from "./InspectorNumberField";
import { SplitScreenControls } from "./SplitScreenControls";
import { StudioColorField } from "./StudioColorField";

interface Props {
  settings: EditorSettings;
  onSettings: (patch: Partial<EditorSettings>) => void;
  source?: SplitFramingSource;
  sourceTime?: number;
}
const RATIOS: Record<EditorSettings["ratio"], { value: string; name: string }> = {
  "9:16": { value: "9:16", name: "Vertical" }, "1:1": { value: "1:1", name: "Quadrado" },
  original: { value: "Src", name: "Original" }, "16:9": { value: "16:9", name: "Paisagem" }, "4:5": { value: "4:5", name: "Retrato" },
};

export function ReframePanel({ settings, onSettings, source, sourceTime }: Props) {
  const split = settings.ratio === "9:16" && isSplitScreen(settings.splitScreen);
  return <div className="reframe-panel">
    <section className="reframe-panel__section" aria-label="Enquadramento">
      <h2>Enquadramento</h2>
      <div className="studio-field">
        <span className="studio-field__label">Proporção</span>
        <div className="reframe-panel__ratios" role="group" aria-label="Proporção do vídeo">
          {editorAspectRatios.map(ratio => <EditorAction key={ratio} compact label={RATIOS[ratio].name}
            tooltip={`${RATIOS[ratio].name}${ratio==="original"?" — proporção da fonte":` — ${ratio}`}`}
            pressed={settings.ratio===ratio} onClick={() => onSettings(ratio==="9:16" ? { ratio } : { ratio, splitScreen: null })}
            icon={<span className="reframe-panel__ratio-content" aria-hidden="true">
              <span className="reframe-panel__ratio-shape" data-ratio={ratio}/>
              <span className="studio-toggle__value">{RATIOS[ratio].value}</span>
            </span>}/>) }
        </div>
      </div>
      <SplitScreenControls settings={settings} source={source} sourceTime={sourceTime} onSettings={onSettings}/>
      {!split&&<div className="reframe-panel__head">
        <span className="studio-field__label">Ajuste</span>
        <div className="reframe-panel__actions" role="group" aria-label="Ajuste do vídeo">
          <EditorAction compact label="Preencher quadro" tooltip="Preencher o quadro recortando as bordas" icon={<FrameCornersIcon size={18} aria-hidden="true"/>} pressed={settings.fit==="cover"} onClick={() => onSettings({ fit: "cover" })}/>
          <EditorAction compact label="Vídeo completo" tooltip="Mostrar o vídeo completo, preservando as margens" icon={<RectangleIcon size={18} aria-hidden="true"/>} pressed={settings.fit==="contain"} onClick={() => onSettings({ fit: "contain" })}/>
        </div>
      </div>}
      <StudioColorField label="Fundo" inputLabel="Cor de fundo" value={settings.background} onChange={background => onSettings({ background })}/>
    </section>
    {!split&&<section className="reframe-panel__section" aria-label="Recorte da mídia">
      <header className="reframe-panel__head"><h2>Recorte</h2>
        <EditorAction compact label="Centralizar assunto" tooltip="Centralizar o recorte e restaurar o zoom" icon={<ArrowsInIcon size={18} aria-hidden="true"/>}
          onClick={() => onSettings({ focalPoint: { x: 50, y: 50 }, zoom: 1 })}/>
      </header>
      <div className="reframe-number-grid">
        <InspectorNumberField label="Posição horizontal" caption="Horizontal" value={settings.focalPoint?.x??50} min={0} max={100} unit="%" onChange={x => onSettings({ focalPoint: { x, y: settings.focalPoint?.y??50 } })}/>
        <InspectorNumberField label="Posição vertical" caption="Vertical" value={settings.focalPoint?.y??50} min={0} max={100} unit="%" onChange={y => onSettings({ focalPoint: { x: settings.focalPoint?.x??50, y } })}/>
        <InspectorNumberField label="Zoom" caption="Zoom" value={settings.zoom??1} min={1} max={3} step={.01} clickStep={.1} unit="×" onChange={zoom => onSettings({ zoom })}/>
      </div>
    </section>}
  </div>;
}
