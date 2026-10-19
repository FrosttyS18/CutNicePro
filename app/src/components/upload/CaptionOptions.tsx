import { AppSelect } from "../AppSelect";
import { useId, useState } from "react";
import { aspectRatios, captionModels, type AspectRatio } from "./tools";

interface Props {
  model: number;
  ratio: AspectRatio;
  onModel: (index: number) => void;
  onRatio: (ratio: AspectRatio) => void;
}

export function CaptionOptions({ model, ratio, onModel, onRatio }: Props) {
  const [tab, setTab] = useState<"quick" | "saved">("quick");
  const id = useId();
  return (
    <section className="caption-options" aria-label="Configurações de legenda">
      <div className="caption-options__tabs" role="tablist" aria-label="Modelos de legenda">
        {(["quick", "saved"] as const).map((value) => (
          <button type="button" role="tab" key={value} id={`${id}-${value}`} aria-selected={tab === value}
            aria-controls={`${id}-panel`} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? "quick" : event.key === "End" ? "saved" : tab === "quick" ? "saved" : "quick";
              setTab(next);
              document.getElementById(`${id}-${next}`)?.focus();
            }}>
            {value === "quick" ? "Ações rápidas" : "Meus modelos"}
          </button>
        ))}
      </div>
      <div className="caption-options__panel" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`} tabIndex={0}>
        {tab === "quick" ? <>
          <fieldset className="caption-models">
            <legend>Legenda <span>Prévia de estilos</span></legend>
            <div className="caption-models__grid">
              {captionModels.map((label, index) => (
                <label key={label} className={`caption-model caption-model--${index}`}>
                  <input type="radio" name={`${id}-model`} value={index} checked={model === index}
                    onChange={() => onModel(index)} />
                  <span className="caption-model__sample" aria-hidden="true">
                    {index === 0 ? "—" : <span>Crie <strong>conexões</strong></span>}
                  </span>
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="caption-ratio">Escolha a proporção
            <AppSelect value={ratio} onChange={(event) => onRatio(event.target.value as AspectRatio)}>
              {aspectRatios.map((value) => <option key={value} value={value}>{value}</option>)}
            </AppSelect>
          </label>
        </> : <div className="caption-models__empty">
          <p>Nenhum modelo salvo</p>
          <span>Seus modelos personalizados aparecerão aqui quando estiverem disponíveis.</span>
        </div>}
      </div>
    </section>
  );
}
