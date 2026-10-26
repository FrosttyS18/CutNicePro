import { DEFAULT_PLACEMENT } from "../../lib/composition-placement";
import type { CompositionPlacement } from "../../lib/composition-types";

interface Props {
  placement?: CompositionPlacement;
  disabled: boolean;
  cropping: boolean;
  onChange: (placement: CompositionPlacement) => void;
}

function PlacementRange({ label, name, value, min, max, disabled, onChange }: {
  label: string; name: string; value: number; min: number; max: number; disabled: boolean; onChange: (value: number) => void;
}) {
  return <label className="studio-field studio-range">
    <span className="studio-field__label">{label}<strong>{Math.round(value)}%</strong></span>
    <input type="range" name={name} autoComplete="off" aria-label={name} min={min} max={max} step={1} value={value} disabled={disabled}
      onChange={event => onChange(Number(event.target.value))} />
  </label>;
}

export function CompositionPlacementControls({ placement = DEFAULT_PLACEMENT, disabled, cropping, onChange }: Props) {
  const update = (patch: Partial<CompositionPlacement>) => onChange({ ...placement, ...patch });
  return <>
    <section className="studio-section" aria-label="Posicionamento da sobreposição">
      <h2>Sobreposição</h2>
      <p>{disabled ? "Desbloqueie a faixa para posicionar esta mídia." : cropping ? "Conclua o enquadramento para arrastar a sobreposição ou ajuste os controles." : "Arraste a mídia selecionada na prévia ou ajuste os controles."}</p>
      <PlacementRange label="Horizontal" name="Posição horizontal da sobreposição" value={placement.x} min={0} max={100} disabled={disabled} onChange={x => update({ x })} />
      <PlacementRange label="Vertical" name="Posição vertical da sobreposição" value={placement.y} min={0} max={100} disabled={disabled} onChange={y => update({ y })} />
      <PlacementRange label="Escala" name="Escala da sobreposição" value={placement.scale * 100} min={10} max={200} disabled={disabled} onChange={scale => update({ scale: scale / 100 })} />
      <PlacementRange label="Opacidade" name="Opacidade da sobreposição" value={placement.opacity * 100} min={0} max={100} disabled={disabled} onChange={opacity => update({ opacity: opacity / 100 })} />
      <button type="button" className="flow-button" disabled={disabled} onClick={() => onChange({ ...DEFAULT_PLACEMENT })}>Restaurar sobreposição</button>
    </section>
    <hr className="studio-separator" />
  </>;
}
