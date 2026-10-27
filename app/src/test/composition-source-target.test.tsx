import { act, type ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { CompositionEditorBody } from "../components/editor/CompositionEditorBody";
import { compositionFromLegacy } from "../lib/composition-legacy";
import type { Composition } from "../lib/composition-types";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";

vi.mock("../hooks/useTimelinePreview",()=>({useTimelinePreview:()=>({frames:[],peaks:[],error:null})}));
vi.mock("../hooks/useCompositionMedia",()=>({useCompositionMedia:()=>({source:{url:"blob:source",error:null},other:{url:"blob:other",error:null},tail:{url:"blob:tail",error:null}})}));
vi.mock("../components/editor/CompositionStage",()=>({CompositionStage:()=> <div data-testid="montage-preview"/>}));

let view:Awaited<ReturnType<typeof reactHost>>|undefined;
afterEach(async()=>{await view?.close();view=undefined;vi.clearAllMocks();});
const legacy=emptyWorkspace();
legacy.media={kind:"local",mediaId:"source",name:"Fonte.mp4",duration:2,width:160,height:90,videoId:null,url:null};

function fixture(){
  const document=compositionFromLegacy(legacy,{hasAudio:false});
  document.assets.push({...document.assets[0],id:"other",mediaId:"other",name:"Outra.mp4",durationUs:1_000_000});
  document.assets.push({...document.assets[0],id:"tail",mediaId:"tail",name:"Música.wav",kind:"audio",durationUs:30_000_000,width:0,height:0,hasAudio:true});
  document.tracks.push({id:"music",name:"Música",kind:"audio",primary:false,hidden:false,muted:false,locked:false});
  document.items.push({...structuredClone(document.items[0]),id:"tail",assetId:"tail",trackId:"music",kind:"audio",durationFrames:900,sourceEndUs:30_000_000,groupId:"music",followsMain:false});
  return document;
}
function props(document=fixture()):ComponentProps<typeof CompositionEditorBody>{return {projectId:"project",document,frame:15,playing:false,selected:[],sourceUrl:"blob:source",legacy,
  onChange:vi.fn(),onSeek:vi.fn(),onPause:vi.fn(),onError:vi.fn(),onPreviews:vi.fn(),onPreview:vi.fn()};}
async function click(label:string,scope=""){
  const button=view!.host.querySelector<HTMLButtonElement>(`${scope} button[aria-label="${label}"]`);
  if(!button)throw new Error(`Controle ausente: ${label}`);
  await act(async()=>button.click());
}
function inserted(document:Composition,next:Composition){const groups=new Set(document.items.map(item=>item.groupId));return next.items.filter(item=>!groups.has(item.groupId)&&item.kind==="video");}

it.each(["start","end"] as const)("insere I/O da fonte em %s sem mover cursor e limpa a intenção após sucesso",async target=>{
  const current=props();const before=JSON.stringify(current.document);
  view=await reactHost(<CompositionEditorBody {...current} sourceRequest={{id:1,target}}/>);
  const source=view.host.querySelector<HTMLElement>(".composition-source")!;
  expect(source).not.toBeNull();
  const video=source.querySelector("video")!;
  await act(async()=>{video.currentTime=0.5;video.dispatchEvent(new window.Event("timeupdate"));});
  await act(async()=>source.dispatchEvent(new window.KeyboardEvent("keydown",{key:"i",bubbles:true})));
  await act(async()=>{video.currentTime=1.5;video.dispatchEvent(new window.Event("timeupdate"));});
  await act(async()=>source.dispatchEvent(new window.KeyboardEvent("keydown",{key:"o",bubbles:true})));
  expect(current.onChange).not.toHaveBeenCalled();
  await click(target==="start"?"Adicionar no início":"Adicionar no fim",".composition-source");
  const next=vi.mocked(current.onChange).mock.lastCall![0];
  expect(inserted(current.document,next)).toEqual([expect.objectContaining({startFrame:target==="start"?0:60,durationFrames:30,sourceStartUs:500_000,sourceEndUs:1_500_000})]);
  expect(current.onSeek).not.toHaveBeenCalled();
  expect(JSON.stringify(current.document)).toBe(before);
  await click("Abrir fonte selecionada");
  expect(view.host.querySelector('.composition-source [aria-label="Adicionar no cursor"]')).not.toBeNull();
});

it("fechar o viewer cancela intenção sem editar; reabrir usa cursor",async()=>{
  const current=props();view=await reactHost(<CompositionEditorBody {...current} sourceRequest={{id:1,target:"end"}}/>);
  await click("Voltar à montagem");await click("Abrir fonte selecionada");
  expect(view.host.querySelector('.composition-source [aria-label="Adicionar no cursor"]')).not.toBeNull();
  expect(current.onChange).not.toHaveBeenCalled();expect(current.onSeek).not.toHaveBeenCalled();
});

it("trocar a mídia da fonte limpa a intenção anterior",async()=>{
  const current=props();view=await reactHost(<CompositionEditorBody {...current} sourceRequest={{id:1,target:"end"}}/>);
  await click("Selecionar mídia: Outra.mp4");
  expect(view.host.querySelector('.composition-source [aria-label="Adicionar no cursor"]')).not.toBeNull();
  expect(current.onChange).not.toHaveBeenCalled();expect(current.onSeek).not.toHaveBeenCalled();
});

it("atalho rápido da biblioteca continua no cursor com intenção de fonte pendente",async()=>{
  const current=props();view=await reactHost(<CompositionEditorBody {...current} sourceRequest={{id:1,target:"end"}}/>);
  await click("Adicionar no cursor",".composition-media__actions");
  const next=vi.mocked(current.onChange).mock.lastCall![0];
  expect(inserted(current.document,next)).toContainEqual(expect.objectContaining({startFrame:15,durationFrames:60,sourceStartUs:0,sourceEndUs:2_000_000}));
  expect(view.host.querySelector('.composition-source [aria-label="Adicionar no cursor"]')).not.toBeNull();
  expect(current.onSeek).not.toHaveBeenCalled();
});

it("fonte entra em camada nova mesmo com principal bloqueada, sem deslocar os itens existentes",async()=>{
  const document=fixture();document.tracks[0].locked=true;const current=props(document);
  view=await reactHost(<CompositionEditorBody {...current} sourceRequest={{id:1,target:"end"}}/>);
  await click("Adicionar no fim",".composition-source");
  const next=vi.mocked(current.onChange).mock.lastCall?.[0];
  expect(next).toBeDefined();
  const incoming=inserted(document,next!)[0];
  expect(incoming.startFrame).toBe(60);
  expect(next!.tracks.find(track=>track.id===incoming.trackId)).toMatchObject({kind:"visual",primary:false,locked:false});
  for(const item of document.items)expect(next!.items.find(value=>value.id===item.id)).toEqual(item);
  for(const track of document.tracks)expect(next!.tracks.find(value=>value.id===track.id)).toEqual(track);
  expect(current.onSeek).not.toHaveBeenCalled();expect(current.onError).not.toHaveBeenCalled();
  expect(view.host.querySelector('.composition-source')).toBeNull();
});

it("adiciona o intervalo no cursor em nova camada com áudio e CC vinculados, sem ripple",async()=>{
  const document=fixture();document.assets[0].hasAudio=true;
  document.assets[0].transcript=[{id:"fala",start:0,end:2,text:"Uma fala completa."}];
  const current=props(document);const before=JSON.stringify(document);
  view=await reactHost(<CompositionEditorBody {...current} sourceRequest={{id:1,target:"cursor"}}/>);
  await click("Adicionar no cursor",".composition-source");
  const next=vi.mocked(current.onChange).mock.lastCall![0];
  const incoming=inserted(document,next)[0];
  expect(incoming).toMatchObject({startFrame:15,durationFrames:60,sourceStartUs:0,sourceEndUs:2_000_000});
  expect(next.tracks.find(track=>track.id===incoming.trackId)).toMatchObject({kind:"visual",primary:false});
  expect(next.items.filter(item=>item.groupId===incoming.groupId).map(item=>item.kind).sort()).toEqual(["audio","caption","video"]);
  expect(next.items.filter(item=>item.groupId===incoming.groupId).every(item=>item.startFrame===15&&item.durationFrames===60)).toBe(true);
  for(const item of document.items)expect(next.items.find(value=>value.id===item.id)).toEqual(item);
  expect(JSON.stringify(document)).toBe(before);
  expect(current.onSeek).not.toHaveBeenCalled();
});

it("resolve fim na principal atual e ignora a cauda de áudio",async()=>{
  const current=props();view=await reactHost(<CompositionEditorBody {...current} sourceRequest={{id:1,target:"end"}}/>);
  const next=structuredClone(current.document);next.items.push({...structuredClone(next.items[0]),id:"later",startFrame:60,groupId:"later"});
  await view.render(<CompositionEditorBody {...current} document={next} sourceRequest={{id:1,target:"end"}}/>);
  await click("Adicionar no fim",".composition-source");
  expect(inserted(next,vi.mocked(current.onChange).mock.lastCall![0])[0].startFrame).toBe(120);
  expect(current.onSeek).not.toHaveBeenCalled();
});

it("fim de principal vazia é zero mesmo com áudio independente",async()=>{
  const document=fixture();document.items=document.items.filter(item=>item.kind==="audio");const current=props(document);
  view=await reactHost(<CompositionEditorBody {...current} sourceRequest={{id:1,target:"end"}}/>);
  await click("Adicionar no fim",".composition-source");
  expect(inserted(document,vi.mocked(current.onChange).mock.lastCall![0])[0].startFrame).toBe(0);
  expect(current.onSeek).not.toHaveBeenCalled();
});

it("abre as miniaturas da fonte escolhida sem preparar vídeos apenas por estarem na biblioteca",async()=>{
  const current=props();
  view=await reactHost(<CompositionEditorBody {...current} previews={{other:{frames:["blob:first","blob:last"],peaks:[]}}}/>);
  expect(vi.mocked(current.onPreviews).mock.calls.some(([id])=>id==="other")).toBe(false);
  await click("Selecionar mídia: Outra.mp4");
  expect(vi.mocked(current.onPreviews).mock.calls.some(([id])=>id==="other")).toBe(false);
  await click("Abrir fonte selecionada");
  expect([...view.host.querySelectorAll('.composition-source-range__frames img')].map(image=>image.getAttribute("src"))).toEqual(["blob:first","blob:last"]);
  expect(vi.mocked(current.onPreviews).mock.calls.some(([id])=>id==="other")).toBe(true);
  expect(current.onChange).not.toHaveBeenCalled();expect(current.onSeek).not.toHaveBeenCalled();
});
