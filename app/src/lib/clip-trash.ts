import { invoke } from "@tauri-apps/api/core";
import type { Clip } from "./clips";

export const CLIP_TRASH_RETENTION_MS=7*24*60*60*1000;

export function clipTrashExpiresAt(clip:Clip):number|null{
  return clip.deleted&&Number.isSafeInteger(clip.deletedAtMs)&&Number(clip.deletedAtMs)>0
    ?Number(clip.deletedAtMs)+CLIP_TRASH_RETENTION_MS:null;
}

export function clipTrashRemaining(clip:Clip,now:number):string{
  const expires=clipTrashExpiresAt(clip);
  if(expires===null)return "Exclusão automática em 7 dias após atualizar a lixeira";
  if(expires<=now)return "Prazo de restauração encerrado";
  const days=Math.ceil((expires-now)/86400000);
  return `Exclusão em ${days} ${days===1?"dia":"dias"}`;
}

export async function cleanupClipTrash(projectId:string):Promise<number>{
  const value=await invoke<unknown>("cleanup_clip_trash",{projectId});
  if(typeof value!=="number"||!Number.isSafeInteger(value)||value<0)throw new Error("Não foi possível confirmar a limpeza da lixeira");
  return value;
}

export async function purgeClip(projectId:string,mediaId:string,clipId:string):Promise<void>{
  await invoke<void>("purge_clip",{projectId,mediaId,clipId});
}

export function clipRestoreFailure(error:unknown):string{
  return /exclu[ií]do permanentemente|prazo.*encerrad/i.test(String(error))
    ?"Este clipe já foi excluído permanentemente. Atualize a biblioteca."
    :"Não foi possível restaurar o clipe. Tente novamente.";
}
