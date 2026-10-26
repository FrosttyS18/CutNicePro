import { useState } from "react";
import { FlowDialog } from "./FlowDialog";
import "./project-actions.css";
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";

interface Props { name: string; onDelete: () => Promise<void>; compact?: boolean; disabled?: boolean }

export function ProjectDeleteButton({ name, onDelete, compact = false, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function confirm() {
    setBusy(true); setError(false);
    try { await onDelete(); setOpen(false); }
    catch { setError(true); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" className={compact ? "pcard__delete" : "flow-button"} disabled={disabled} aria-label={`Excluir projeto ${name}`}
      title="Excluir projeto" onClick={() => { setError(false); setOpen(true); }}>
      <TrashIcon size={18} aria-hidden="true"/>
      {!compact && "Excluir projeto"}
    </button>
    <FlowDialog open={open} title="Excluir projeto?" busy={busy} onClose={() => { if (!busy) setOpen(false); }}>
      <p className="project-delete-name">{name}</p>
      <p className="flow-muted">O projeto e suas edições serão excluídos. O arquivo original será mantido.</p>
      {error && <p className="upload-message upload-message--error" role="alert">Não foi possível concluir a exclusão. Aguarde qualquer processamento em andamento e tente novamente.</p>}
      <div className="project-delete-actions">
        <button type="button" className="flow-button dialog-action--secondary" disabled={busy} onClick={() => setOpen(false)}>Cancelar</button>
        <button type="button" className="flow-button project-delete-confirm dialog-action--danger" disabled={busy} onClick={() => void confirm()}>{busy ? "Excluindo…" : "Excluir projeto"}</button>
      </div>
    </FlowDialog>
  </>;
}
