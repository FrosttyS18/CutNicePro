import { useState } from "react";
import { FlowDialog } from "./FlowDialog";

interface Props {name:string;onDelete:()=>Promise<void>;onClose:()=>void}
export function ProjectDeleteDialog({name,onDelete,onClose}:Props) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(false);
  async function confirm(){setBusy(true);setError(false);try{await onDelete();onClose();}catch{setError(true);}finally{setBusy(false);}}
  return <FlowDialog open title="Excluir projeto?" busy={busy} onClose={()=>{if(!busy)onClose();}}>
    <p className="project-delete-name">{name}</p>
    <p className="flow-muted">O projeto e suas edições serão excluídos. O arquivo original será mantido.</p>
    {error&&<p className="upload-message upload-message--error" role="alert">Não foi possível concluir a exclusão. Aguarde qualquer processamento em andamento e tente novamente.</p>}
    <div className="project-delete-actions"><button type="button" className="flow-button" disabled={busy} onClick={onClose}>Cancelar</button>
      <button type="button" className="flow-button project-delete-confirm" disabled={busy} onClick={()=>void confirm()}>{busy?"Excluindo…":"Excluir projeto"}</button></div>
  </FlowDialog>;
}
