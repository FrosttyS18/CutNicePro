import { requireComposition } from "./composition";
import { editId } from "./composition-operations";
import { secondsToFrame } from "./composition-time";
import type { Composition, CompositionAsset, CompositionItem } from "./composition-types";

export function fragmentFromAsset(document:Composition,asset:CompositionAsset,start=0,end=asset.durationUs/1e6,hasAudio=true):Composition {
  if(asset.kind!=="image" && (!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||Math.round(end*1e6)>asset.durationUs))throw new Error("Escolha um intervalo válido da fonte");
  const visual=asset.kind!=="audio";
  const groupId=editId();
  const settings={...structuredClone(document.settings),trimStart:0,trimEnd:null,editPlan:null};
  const base:CompositionItem={id:editId(),trackId:visual?"V1":"A1",assetId:asset.id,kind:asset.kind,startFrame:0,
    durationFrames:Math.max(1,secondsToFrame(asset.kind==="image"?5:end-start,document.fps)),sourceStartUs:asset.kind==="image"?0:Math.round(start*1e6),sourceEndUs:asset.kind==="image"?0:Math.round(end*1e6),groupId,followsMain:true,settings,captionEdits:{}};
  const items=[base];
  if(asset.kind==="video" && (asset.hasAudio??hasAudio))items.push({...structuredClone(base),id:editId(),trackId:"A1",kind:"audio"});
  if(asset.transcript.length)items.push({...structuredClone(base),id:editId(),trackId:"C1",kind:"caption"});
  return requireComposition({...document,revision:0,assets:[asset],items,tracks:[
    {id:"V1",name:"Principal",kind:"visual",primary:true,locked:false,hidden:false,muted:false},
    {id:"A1",name:"Áudio",kind:"audio",primary:false,locked:false,hidden:false,muted:false},
    {id:"C1",name:"Legendas",kind:"caption",primary:false,locked:false,hidden:false,muted:false},
  ]});
}
