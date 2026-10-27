import { expect, it, vi } from "vitest";
import { insertAssetAtTarget, registerCompositionAsset } from "../lib/composition-asset-drop";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { CompositionSession } from "../lib/composition-session";
import { linkedSourceAudio } from "../lib/composition-playback";
import { emptyWorkspace } from "../lib/workspace";
import type { Composition, CompositionAsset } from "../lib/composition-types";

function fixture(){
  const workspace=emptyWorkspace();
  workspace.media={kind:"local",mediaId:"source",name:"Fonte.mp4",duration:10,width:1920,height:1080,videoId:null,url:null};
  return compositionFromLegacy(workspace);
}
const image:CompositionAsset={id:"image",mediaId:"image",name:"Imagem.png",kind:"image",durationUs:0,width:800,height:600,transcript:[]};
const video:CompositionAsset={id:"video",mediaId:"video",name:"Vídeo.mp4",kind:"video",durationUs:2_000_000,width:640,height:360,hasAudio:true,transcript:[{id:"fala",start:0,end:2,text:"Um trecho"}]};
const audio:CompositionAsset={id:"audio",mediaId:"audio",name:"Som.wav",kind:"audio",durationUs:1_000_000,width:0,height:0,hasAudio:true,transcript:[]};

it("registra somente a mídia e preserva itens, faixas e metadados existentes",()=>{
  const document=fixture();const original=JSON.stringify(document);
  const next=registerCompositionAsset(document,image);
  expect(next.assets).toHaveLength(2);expect(next.items).toBe(document.items);expect(next.tracks).toBe(document.tracks);
  expect(registerCompositionAsset(next,{...image,id:"outro-id",name:"Nome novo.png",transcript:[{id:"x",start:0,end:1,text:"Ignorado"}]})).toBe(next);
  expect(next.assets[1]).toBe(image);expect(JSON.stringify(document)).toBe(original);
  expect(()=>registerCompositionAsset(next,{...image,mediaId:"outro-conteúdo"})).toThrow("incompatível");
});

it("insere imagem em cinco segundos no tempo e na faixa exatos, sem ripple",()=>{
  const document=fixture();document.tracks.push({id:"overlay",name:"Camada 2",kind:"visual",primary:false,locked:false,hidden:false,muted:false});
  const next=insertAssetAtTarget(document,image,{frame:45,trackId:"overlay"});
  expect(next.items.slice(0,document.items.length)).toEqual(document.items);
  expect(next.items.filter(item=>item.assetId==="image")).toEqual([expect.objectContaining({trackId:"overlay",startFrame:45,durationFrames:150,sourceStartUs:0,sourceEndUs:0,kind:"image"})]);
  expect(next.tracks).toEqual(document.tracks);
});

it("nova camada leva vídeo, áudio e CC vinculados sem modificar a montagem anterior",()=>{
  const document=fixture();const original=JSON.stringify(document);
  const next=insertAssetAtTarget(document,video,{frame:30,trackId:null});
  const added=next.items.filter(item=>item.assetId===video.id);
  expect(added.map(item=>item.kind)).toEqual(["video","audio","caption"]);
  expect(new Set(added.map(item=>item.groupId)).size).toBe(1);
  expect(added.every(item=>item.startFrame===30&&item.durationFrames===60)).toBe(true);
  expect(next.tracks.find(track=>track.id===added[0].trackId)).toMatchObject({primary:false,kind:"visual"});
  expect(linkedSourceAudio(next,added[0])?.id).toBe(added[1].id);
  expect(JSON.stringify(document)).toBe(original);
});

it("adiciona áudio em faixa própria e reutiliza mídia existente com sua transcrição",()=>{
  let document=registerCompositionAsset(fixture(),video);
  const next=insertAssetAtTarget(document,{...video,id:"duplicado",transcript:[]},{frame:400,trackId:null});
  expect(next.assets.filter(asset=>asset.mediaId===video.mediaId)).toHaveLength(1);
  expect(next.items.some(item=>item.assetId===video.id&&item.kind==="caption")).toBe(true);
  document=insertAssetAtTarget(document,audio,{frame:0,trackId:null});
  const added=document.items.find(item=>item.assetId===audio.id)!;
  expect(document.tracks.find(track=>track.id===added.trackId)?.kind).toBe("audio");
});

it.each(["locked","missing","incompatible"])("rejeita destino %s sem acrescentar item, faixa ou mídia parcial",reason=>{
  const document=fixture();let trackId="V1";
  if(reason==="locked")document.tracks[0].locked=true;
  if(reason==="missing")trackId="inexistente";
  if(reason==="incompatible")trackId="A1";
  const original=JSON.stringify(document);
  expect(()=>insertAssetAtTarget(document,image,{frame:30,trackId})).toThrow();
  expect(JSON.stringify(document)).toBe(original);
});

it.each([image,video])("colisão visual de $kind cria camada sem cortar ou mover a montagem",asset=>{
  const document=fixture(),original=JSON.stringify(document);
  const next=insertAssetAtTarget(document,asset,{frame:30,trackId:"V1"});
  const added=next.items.find(item=>item.assetId===asset.id&&item.kind===asset.kind)!;
  expect(added).toMatchObject({startFrame:30,kind:asset.kind});
  expect(added.trackId).not.toBe("V1");
  expect(next.tracks.find(track=>track.id===added.trackId)).toMatchObject({primary:false,kind:"visual",locked:false});
  expect(next.items.slice(0,document.items.length)).toEqual(document.items);
  expect(JSON.stringify(document)).toBe(original);
});

it("colisão de áudio cria faixa própria sem roubar faixa visual ou áudio da fonte",()=>{
  const document=fixture(),original=JSON.stringify(document);
  const next=insertAssetAtTarget(document,audio,{frame:30,trackId:"A1"});
  const added=next.items.find(item=>item.assetId===audio.id)!;
  expect(added.trackId).not.toBe("A1");
  expect(next.tracks.find(track=>track.id===added.trackId)).toMatchObject({kind:"audio",primary:false,locked:false});
  expect(next.items.slice(0,document.items.length)).toEqual(document.items);
  expect(JSON.stringify(document)).toBe(original);
});

it("drop visual no espaço livre mantém a faixa escolhida e o tempo exato",()=>{
  const document=fixture();
  const next=insertAssetAtTarget(document,image,{frame:300,trackId:"V1"});
  expect(next.tracks).toEqual(document.tracks);
  expect(next.items.find(item=>item.assetId===image.id)).toMatchObject({startFrame:300,trackId:"V1"});
});

it("colisão cria uma única edição reversível que preserva os originais e a biblioteca",()=>{
  const document=registerCompositionAsset(fixture(),image),session=new CompositionSession(document,{save:vi.fn()});
  session.apply(insertAssetAtTarget(session.document,image,{frame:30,trackId:"V1"}));
  const added=session.document.items.find(item=>item.assetId===image.id)!;
  expect(session.document.assets).toEqual(document.assets);
  expect(session.document.tracks.find(track=>track.id===added.trackId)).toBeDefined();
  session.undo();expect(session.document).toEqual(document);
  session.redo();expect(session.document.items.find(item=>item.id===added.id)).toEqual(added);
});

it.each([-1,0.5,Number.NaN,Number.MAX_SAFE_INTEGER])("rejeita tempo inválido %s",frame=>{
  const document=fixture();expect(()=>insertAssetAtTarget(document,image,{frame,trackId:null})).toThrow();expect(document.assets).toHaveLength(1);
});

it("um drop gera uma edição, desfazer integral e persistência somente ao salvar",async()=>{
  const initial=fixture();const save=vi.fn(async(document:Composition,revision:number)=>({...structuredClone(document),revision:revision+1}));
  const session=new CompositionSession(initial,{save});
  session.apply(insertAssetAtTarget(session.document,image,{frame:420,trackId:"V1"}));
  expect(save).not.toHaveBeenCalled();expect(session.dirty).toBe(true);
  session.undo();expect(session.document.items).toEqual(initial.items);expect(session.document.assets).toEqual(initial.assets);
  session.redo();expect(session.document.items.some(item=>item.kind==="image"&&item.startFrame===420)).toBe(true);
  expect(await session.save()).toBe(true);expect(save).toHaveBeenCalledTimes(1);
  const reopened=new CompositionSession(JSON.parse(JSON.stringify(session.savedDocument)),{save});
  expect(reopened.document).toEqual(session.savedDocument);
});
