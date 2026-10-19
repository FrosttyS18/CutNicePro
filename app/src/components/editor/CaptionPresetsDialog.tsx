import { useId } from "react";
import { captionModels } from "../upload/tools";
import { FlowDialog } from "../workspace/FlowDialog";

interface Props {
  open: boolean;
  model: number;
  onModel: (model: number) => void;
  onClose: () => void;
}

export function CaptionPresetsDialog({ open, model, onModel, onClose }: Props) {
  const id = useId();
  return (
    <FlowDialog open={open} title="Estilos de legenda" onClose={onClose}>
      <p className="flow-muted">Escolha o estilo da legenda. A geração do texto aguarda a integração da IA.</p>
      <fieldset className="editor-caption-presets"><legend className="upload-sr-only">Modelo de legenda</legend>
        {captionModels.map((name, index) => <label key={index}>
          <input type="radio" name={`${id}-preset`} checked={model === index} onChange={() => onModel(index)} />
          <span className="editor-caption-presets__sample" data-model={index} aria-hidden="true">
            {index === 0 ? <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /><path d="m6 6 12 12" /></svg>
              : <span>Crie <strong>conexões</strong></span>}
          </span><span>{name}</span>
        </label>)}
      </fieldset>
      <button type="button" className="upload-primary flow-wide" onClick={onClose}>Concluir</button>
    </FlowDialog>
  );
}
