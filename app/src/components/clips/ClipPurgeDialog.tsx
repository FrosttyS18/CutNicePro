import { useRef, useState } from "react";
import { FlowDialog } from "../workspace/FlowDialog";

interface Props {title:string;onConfirm:()=>Promise<void>;onClose:()=>void}

export function ClipPurgeDialog({title,onConfirm,onClose}:Props){
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(false);
  const pending=useRef(false);
  const confirm=async()=>{
    if(pending.current)return;
    pending.current=true;setBusy(true);setError(false);
    try{await onConfirm();onClose();}catch{setError(true);}finally{pending.current=false;setBusy(false);}
  };
  return <FlowDialog open title="Excluir este clipe permanentemente?" busy={busy} onClose={()=>{if(!pending.current)onClose();}}>
    <p className="project-delete-name">{title}</p>
    <p className="flow-muted">Esta ação não pode ser desfeita. O vídeo original e os arquivos exportados serão mantidos.</p>
    {error&&<p role="alert" className="upload-message upload-message--error">Não foi possível excluir o clipe. Tente novamente.</p>}
    <div className="project-delete-actions">
      <button type="button" className="flow-button dialog-action--secondary" disabled={busy} onClick={onClose}>Cancelar</button>
      <button type="button" className="flow-button dialog-action--danger" disabled={busy} onClick={()=>void confirm()}>{busy?"Excluindo…":"Excluir permanentemente"}</button>
    </div>
  </FlowDialog>;
}
