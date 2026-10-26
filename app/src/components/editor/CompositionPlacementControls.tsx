import { DEFAULT_PLACEMENT } from "../../lib/composition-placement";
import type { CompositionPlacement } from "../../lib/composition-types";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowCounterClockwise";
import { EditorAction } from "./EditorAction";
import { InspectorNumberField } from "./InspectorNumberField";

interface Props {
  placement?: CompositionPlacement;
  disabled: boolean;
  cropping: boolean;
  primary?: boolean;
  onChange: (placement: CompositionPlacement) => void;
}

export function CompositionPlacementControls({ placement = DEFAULT_PLACEMENT, disabled, cropping, primary = false, onChange }: Props) {
  const update = (patch: Partial<CompositionPlacement>) => onChange({ ...placement, ...patch });
  const subject = primary ? "mídia" : "sobreposição";
  return <>
    <section className="reframe-panel__section" aria-label={`Posicionamento da ${subject}`}>
      <header className="reframe-panel__head"><h2>{primary ? "Transformação" : "Sobreposição"}</h2>
        <EditorAction compact label={primary ? "Restaurar transformação" : "Restaurar sobreposição"} tooltip="Restaurar posição, escala e opacidade da camada" disabled={disabled} icon={<ArrowCounterClockwiseIcon size={18} aria-hidden="true"/>} onClick={() => onChange({ ...DEFAULT_PLACEMENT })}/>
      </header>
      {disabled&&<p>Desbloqueie a faixa para posicionar esta mídia.</p>}
      {cropping&&<p>Os campos abaixo posicionam a camada inteira.</p>}
      <div className="reframe-number-grid reframe-number-grid--two">
        <InspectorNumberField label={`Posição horizontal da ${subject}`} caption="Horizontal" value={placement.x} min={0} max={100} unit="%" disabled={disabled} onChange={x => update({ x })}/>
        <InspectorNumberField label={`Posição vertical da ${subject}`} caption="Vertical" value={placement.y} min={0} max={100} unit="%" disabled={disabled} onChange={y => update({ y })}/>
        <InspectorNumberField label={`Escala da ${subject}`} caption="Escala" value={placement.scale*100} min={10} max={200} unit="%" disabled={disabled} onChange={scale => update({ scale: scale/100 })}/>
        <InspectorNumberField label={`Opacidade da ${subject}`} caption="Opacidade" value={placement.opacity*100} min={0} max={100} unit="%" disabled={disabled} onChange={opacity => update({ opacity: opacity/100 })}/>
      </div>
    </section>
    <hr className="studio-separator" />
  </>;
}
