import { CropIcon } from "@phosphor-icons/react/dist/csr/Crop";

interface Props {
  framing: boolean;
  /** Ativa/desativa o modo Enquadrar (reposicionamento visual no quadro). */
  onFraming: (active: boolean) => void;
}

/** Ações de modo do topo do palco. Propriedades vivem no inspetor (aba Enquadrar). */
export function FramingToolbar({ framing, onFraming }: Props) {
  return (
    <div className="framing-toolbar">
      <button type="button" className="flow-button framing-toolbar__frame" aria-pressed={framing}
        onClick={() => onFraming(!framing)}>
        <CropIcon size={16} aria-hidden="true"/>{framing ? "Concluir enquadramento" : "Enquadrar"}
      </button>
    </div>
  );
}
