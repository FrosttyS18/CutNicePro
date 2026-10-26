import { AppSelect } from "../AppSelect";
import { useEffect, useState } from "react";
import * as ipc from "../../lib/ipc";
import type { CollectionMeta } from "../../lib/types";
import { FlowDialog } from "./FlowDialog";

interface Props {projectId:string;onClose:()=>void;onChanged?:()=>Promise<void>}
export function ProjectCollectionDialog({projectId,onClose,onChanged}:Props) {
  const [choices,setChoices]=useState<CollectionMeta[]>([]);
  const [selected,setSelected]=useState("");
  const [name,setName]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  useEffect(()=>{let gone=false;void ipc.listCollections().then(list=>{if(!gone)setChoices(list);}).catch(()=>{if(!gone)setError("Não foi possível carregar as coleções. Feche e tente novamente.");}).finally(()=>{if(!gone)setLoading(false);});return()=>{gone=true;};},[]);
  async function add(){setBusy(true);setError(null);try{
    let id=selected;
    if(!id){const created=await ipc.createCollection(name.trim(),"archive-box");id=created.id;setSelected(id);setChoices(current=>[...current,created]);}
    await ipc.addProjectToCollection(id,projectId);await onChanged?.();onClose();
  }catch{setError("Não foi possível adicionar o projeto. Tente novamente.");}finally{setBusy(false);}}
  return <FlowDialog open title="Adicionar a uma coleção" busy={busy} onClose={()=>{if(!busy)onClose();}}>
    {loading?<p className="flow-muted" role="status">Carregando coleções…</p>:<fieldset className="caption-settings project-collection-fields" disabled={busy}>
      <legend className="upload-sr-only">Escolha a coleção</legend>
      <label>Coleção<AppSelect value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Nova coleção</option>
        {choices.filter(collection=>!collection.project_ids.includes(projectId)).map(collection=><option key={collection.id} value={collection.id}>{collection.name}</option>)}
      </AppSelect></label>
      {!selected&&<label>Nome da coleção<input type="text" maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label>}
    </fieldset>}
    {error&&<p className="upload-message upload-message--error" role="alert">{error}</p>}
    <div className="project-delete-actions"><button type="button" className="flow-button dialog-action--secondary" disabled={busy} onClick={onClose}>Cancelar</button>
      <button type="button" className="upload-primary" disabled={busy||loading||(!selected&&!name.trim())} onClick={()=>void add()}>{busy?"Adicionando…":"Adicionar"}</button></div>
  </FlowDialog>;
}
