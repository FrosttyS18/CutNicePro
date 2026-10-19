import { useCallback, useRef, useState, type ReactNode } from "react";
import type { ProjectMeta } from "../../lib/types";
import { readWorkspace } from "../../services/workspace-store";
import { exportProjectFile } from "../../lib/ipc";
import { projectMenuItems,type ProjectMenuAction } from "../../lib/project-menu";
import { ProjectContextMenu } from "./ProjectContextMenu";
import { ProjectDeleteDialog } from "./ProjectDeleteDialog";
import { ProjectCollectionDialog } from "./ProjectCollectionDialog";
import { FlowDialog } from "./FlowDialog";
import "./project-actions.css";

interface Props {project:ProjectMeta;onDelete:(id:string)=>Promise<void>;onCollectionsChanged?:()=>Promise<void>;onRemove?:()=>void;children:ReactNode}
export function ProjectContextCard({project,onDelete,onCollectionsChanged,onRemove,children}:Props) {
  const [position,setPosition]=useState<{x:number;y:number}|null>(null);
  const [dialog,setDialog]=useState<"delete"|"collection"|null>(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState<string|null>(null);
  const [error,setError]=useState(false);
  const opener=useRef<HTMLElement|null>(null);
  const closeMenu=useCallback(()=>{setPosition(null);opener.current?.focus({preventScroll:true});},[]);
  const data=readWorkspace(project.id);
  async function select(action:ProjectMenuAction){
    setNotice(null);setError(false);
    if(action==="delete"||action==="collection"){setDialog(action);return;}
    if(action==="remove"){onRemove?.();return;}
    if(!data.media?.mediaId)return;
    setBusy(true);
    try{if(await exportProjectFile(project.id,data.media.mediaId,action))setNotice("Arquivo salvo.");}
    catch{setError(true);setNotice("Não foi possível salvar o arquivo. Tente novamente.");}
    finally{setBusy(false);}
  }
  return <div className="pcard__wrap project-context-card" onContextMenu={event=>{
    if(busy||dialog)return;event.preventDefault();event.stopPropagation();opener.current=event.currentTarget.querySelector<HTMLElement>("button");setPosition({x:event.clientX,y:event.clientY});
  }} onKeyDown={event=>{
    if(busy||dialog|| !(event.key==="ContextMenu"||(event.shiftKey&&event.key==="F10")))return;
    event.preventDefault();const rect=event.currentTarget.getBoundingClientRect();opener.current=event.target as HTMLElement;setPosition({x:rect.left+12,y:rect.top+24});
  }}>
    {children}
    {position&&<ProjectContextMenu {...position} items={projectMenuItems(Boolean(data.media?.mediaId),data.transcriptMode==="real"&&data.transcript.length>0,Boolean(onRemove))} onClose={closeMenu} onSelect={action=>void select(action)}/>}
    {dialog==="delete"&&<ProjectDeleteDialog name={project.name} onDelete={()=>onDelete(project.id)} onClose={()=>setDialog(null)}/>}
    {dialog==="collection"&&<ProjectCollectionDialog projectId={project.id} onChanged={onCollectionsChanged} onClose={()=>setDialog(null)}/>}
    <FlowDialog open={busy} title="Salvar arquivo" busy onClose={()=>{}}><p className="flow-muted" role="status">Salvando arquivo…</p><progress aria-label="Salvando arquivo"/></FlowDialog>
    {notice&&<span className={error?"project-card-notice project-card-notice--error":"project-card-notice"} role={error?"alert":"status"}>{notice}</span>}
  </div>;
}
