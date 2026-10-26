import { itemEnd, requireComposition, trackAccepts } from "./composition";
import { editId } from "./composition-operations";
import { fragmentFromAsset } from "./composition-source";
import type { Composition, CompositionAsset, CompositionItem, CompositionTrack } from "./composition-types";

export interface CompositionDropTarget { frame:number;trackId:string|null }

export function registerCompositionAsset(document:Composition,asset:CompositionAsset):Composition {
  const identity=document.assets.find(value=>value.id===asset.id);
  if(identity&&identity.mediaId!==asset.mediaId)throw new Error("Referência de mídia incompatível");
  const existing=identity??document.assets.find(value=>value.mediaId===asset.mediaId);
  if(existing){
    if(existing.kind!==asset.kind)throw new Error("Tipo de mídia incompatível");
    return document;
  }
  return requireComposition({...document,assets:[...document.assets,asset]});
}

function freeAt(items:CompositionItem[],trackId:string,start:number,end:number):boolean {
  return !items.some(item=>item.trackId===trackId&&item.startFrame<end&&itemEnd(item)>start);
}

export function insertAssetAtTarget(document:Composition,asset:CompositionAsset,target:CompositionDropTarget):Composition {
  if(!Number.isSafeInteger(target.frame)||target.frame<0)throw new Error("Tempo de destino inválido");
  const registered=registerCompositionAsset(document,asset);
  const source=registered.assets.find(value=>value.mediaId===asset.mediaId)!;
  const fragment=fragmentFromAsset(registered,source);
  const anchor=fragment.items[0];
  if(!Number.isSafeInteger(target.frame+anchor.durationFrames))throw new Error("Tempo de destino inválido");
  const kind=source.kind==="audio"?"audio":"visual";
  const tracks=[...registered.tracks];
  let destination:CompositionTrack;
  if(target.trackId===null){
    destination={id:editId(),name:kind==="audio"?"Áudio":"Sobreposição",kind,primary:false,locked:false,hidden:false,muted:false};
    const index=kind==="visual"?tracks.reduce((last,track,index)=>track.kind==="visual"?index+1:last,0):tracks.length;
    tracks.splice(index,0,destination);
  }else{
    const found=tracks.find(track=>track.id===target.trackId);
    if(!found)throw new Error("A faixa de destino não existe mais");
    if(found.locked)throw new Error("A faixa de destino está bloqueada");
    if(!trackAccepts(found,anchor))throw new Error("A faixa de destino não é compatível com esta mídia");
    destination=found;
  }
  const end=target.frame+anchor.durationFrames;
  if(!freeAt(registered.items,destination.id,target.frame,end))throw new Error("Escolha um espaço livre nesta faixa ou outra camada");
  const items=[...registered.items];
  for(const item of fragment.items){
    let track=destination;
    if(item.trackId!==anchor.trackId){
      const original=fragment.tracks.find(value=>value.id===item.trackId)!;
      const existing=tracks.find(value=>value.kind===original.kind&&!value.primary&&!value.locked&&!value.hidden&&!value.muted&&freeAt(items,value.id,target.frame,end));
      track=existing??{...original,id:editId(),primary:false,locked:false};
      if(!existing)tracks.push(track);
    }
    items.push({...item,trackId:track.id,startFrame:target.frame});
  }
  return requireComposition({...registered,tracks,items});
}
