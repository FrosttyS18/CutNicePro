import { CropIcon } from "@phosphor-icons/react/dist/csr/Crop";
import { ScissorsIcon } from "@phosphor-icons/react/dist/csr/Scissors";
import type { EditorSettings } from "../../lib/workspace-types";

interface Props {
  settings: EditorSettings;
  framing: boolean;
  onSettings: (change: Partial<EditorSettings>) => void;
  /** Ativa/desativa o modo Enquadrar (reposicionamento visual no quadro). */
  onFraming: (active: boolean) => void;
  /** Rola até o corte de tempo (início/fim) na linha do tempo. */
  onFocusTrim: () => void;
}

/** Ações de modo do topo do palco. Propriedades vivem no inspetor (aba Enquadrar). */
export function FramingToolbar({ framing, onFraming, onFocusTrim }: Props) {
  return (
    <div className="framing-toolbar">
      <button type="button" className="flow-button framing-toolbar__frame" aria-pressed={framing}
        title="Enquadrar: mover o vídeo dentro do quadro arrastando a prévia (imagem); legendas ficam no lugar"
        onClick={() => onFraming(!framing)}>
        <CropIcon size={16} aria-hidden="true"/>{framing ? "Concluir enquadramento" : "Enquadrar"}
      </button>
      <button type="button" className="flow-button"
        title="Cortar tempo: definir onde o vídeo começa e termina (o arquivo original é mantido)"
        onClick={onFocusTrim}>
        <ScissorsIcon size={16} aria-hidden="true"/>Cortar tempo
      </button>
    </div>
  );
}
