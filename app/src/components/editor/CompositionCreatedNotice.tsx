import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { EditorAction } from "./EditorAction";

interface Props { title: string; onShowClips?: () => void; onDismiss: () => void }

export function CompositionCreatedNotice({ title, onShowClips, onDismiss }: Props) {
  return <div className="composition-created" role="status">
    <p><strong>{title}</strong> foi salvo nos clipes deste projeto.</p>
    {onShowClips && <button type="button" className="flow-button dialog-action--secondary" onClick={onShowClips}>Ir para clipes</button>}
    <EditorAction compact label="Fechar confirmação" icon={<XIcon size={16} aria-hidden="true"/>} onClick={onDismiss}/>
  </div>;
}
