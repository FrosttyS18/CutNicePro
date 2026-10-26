import { act,useEffect } from "react";
import { afterEach,expect,it,vi } from "vitest";
import { CompositionEditor } from "../components/editor/CompositionEditor";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import type { Composition,CompositionAsset } from "../lib/composition-types";
import { reactHost } from "./react-host";

vi.mock("@tauri-apps/plugin-dialog",()=>({open:vi.fn(async()=>"C:/fixtures/image.png")}));
vi.mock("../lib/ipc",()=>({loadEditorProject:vi.fn(),getEditorRecovery:vi.fn(async()=>null),discardEditorRecovery:vi.fn(async()=>undefined),saveEditorRecovery:vi.fn(async()=>undefined),getMedia:vi.fn(async()=>null),importMedia:vi.fn(),saveEditorDocument:vi.fn()}));
vi.mock("../hooks/useTimelinePreview",()=>({useTimelinePreview:()=>({frames:[],peaks:[],error:null})}));
vi.mock("../hooks/useCompositionMedia",()=>({useCompositionMedia:(assets:CompositionAsset[])=>Object.fromEntries(assets.map(asset=>[asset.id,{url:`cnplocal://media/${asset.mediaId}`,error:null}]))}));
vi.mock("../components/editor/CompositionMediaPoster",()=>({CompositionMediaPoster:()=>null}));
vi.mock("../components/workspace/RelinkMediaControl",()=>({RelinkMediaControl:()=>null}));
let current:Composition;
vi.mock("../components/editor/CompositionStage",()=>({CompositionStage:({document,frame,onReady}:{document:Composition;frame:number;onReady:(value:boolean)=>void})=>{
  current=document;useEffect(()=>onReady(true),[onReady]);return <output data-frame>{frame}</output>;
}}));
const ipc=await import("../lib/ipc");
let view:Awaited<ReturnType<typeof reactHost>>|undefined;
afterEach(async()=>{await view?.close();view=undefined;vi.clearAllMocks();});
const data=emptyWorkspace();
data.media={kind:"local",mediaId:"source",name:"Fonte.mp4",duration:10,width:640,height:360,videoId:null,url:null};
const initial=compositionFromLegacy(data,{hasAudio:false});
const image={mediaId:"image",sha256:"b".repeat(64),ext:"png",originalName:"Imagem.png",sizeBytes:100,createdAtMs:1,projectIds:["project"],unavailable:false,
  analysis:{durationMs:0,width:640,height:360,hasAudio:false,fps:0,videoCodec:"png",audioCodec:null}};

async function mount(saved=initial){
  vi.mocked(ipc.loadEditorProject).mockResolvedValue({version:1,project:{document:saved,manuallyEdited:false,editedAtMs:1},clips:{}});
  vi.mocked(ipc.importMedia).mockResolvedValue({entry:image,analysisError:null});
  vi.mocked(ipc.saveEditorDocument).mockImplementation(async(_project,_clip,document)=>({document:{...document,revision:document.revision+1},manuallyEdited:true,editedAtMs:1}));
  view=await reactHost(<CompositionEditor projectId="project" title="Projeto" data={data} localUrl="source.mp4" onBack={vi.fn()}/>);
  await act(async()=>view!.host.querySelector('.composition-ruler__ticks')!.dispatchEvent(new window.MouseEvent("pointerdown",{button:0,clientX:522,bubbles:true})));
  await act(async()=>window.dispatchEvent(new window.MouseEvent("pointerup",{clientX:522})));
}
async function action(label:string){
  const button=[...view!.host.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.getAttribute("aria-label")===label||button.textContent?.trim()===label)!;
  expect(button,label).toBeDefined();await act(async()=>button.click());
}

it("importar cria somente asset em uma edição desfazível e salva só quando solicitado",async()=>{
  await mount();const before=JSON.stringify(current.items),frame=view!.host.querySelector('[data-frame]')!.textContent;
  await action("Importar mídia");
  expect(current.assets.some(asset=>asset.mediaId==="image")).toBe(true);
  expect(view!.host.querySelector('[aria-label="Selecionar mídia: Imagem.png"]')).not.toBeNull();
  expect(JSON.stringify(current.items)).toBe(before);expect(view!.host.querySelector('[data-frame]')!.textContent).toBe(frame);
  expect(document.querySelector('[role="menu"]')).toBeNull();expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
  await action("Desfazer (Ctrl+Z)");expect(current.assets.some(asset=>asset.mediaId==="image")).toBe(false);
  await action("Refazer (Ctrl+Shift+Z)");expect(current.assets.some(asset=>asset.mediaId==="image")).toBe(true);
  await action("Salvar");const saved=vi.mocked(ipc.saveEditorDocument).mock.lastCall![2];
  await view!.close();view=undefined;await mount(saved);
  expect(current.assets.some(asset=>asset.mediaId==="image")).toBe(true);expect(JSON.stringify(current.items)).toBe(before);
});

it("arrastar asset importado cria uma camada no ponto solto sem mover cursor ou duplicar mídia",async()=>{
  await mount();await action("Importar mídia");const before=JSON.stringify(current.items),frame=view!.host.querySelector('[data-frame]')!.textContent;
  const viewport=view!.host.querySelector<HTMLElement>('.composition-timeline__viewport')!;
  Object.defineProperty(viewport,"getBoundingClientRect",{value:()=>({left:0,right:900,top:30,bottom:260,width:900,height:230})});
  Object.defineProperty(viewport,"clientWidth",{value:900});Object.defineProperty(viewport,"scrollWidth",{value:1200});
  Object.defineProperty(view!.host.querySelector('[data-drop-new-track]'),"getBoundingClientRect",{value:()=>({left:0,right:900,top:70,bottom:94,width:900,height:24})});
  const card=view!.host.querySelector('[aria-label="Selecionar mídia: Imagem.png"]')!;
  await act(async()=>card.dispatchEvent(new window.MouseEvent("pointerdown",{button:0,clientX:50,clientY:150,bubbles:true})));
  await act(async()=>{window.dispatchEvent(new window.MouseEvent("pointermove",{clientX:522,clientY:80}));window.dispatchEvent(new window.MouseEvent("pointerup",{clientX:522,clientY:80}));});
  const inserted=current.items.find(item=>item.kind==="image")!;
  expect(inserted).toEqual(expect.objectContaining({startFrame:150,durationFrames:150}));
  expect(current.tracks.find(track=>track.id===inserted.trackId)?.primary).toBe(false);
  expect(current.assets.filter(asset=>asset.mediaId==="image")).toHaveLength(1);
  expect(view!.host.querySelector('[data-frame]')!.textContent).toBe(frame);
  expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
  await action("Desfazer (Ctrl+Z)");expect(JSON.stringify(current.items)).toBe(before);expect(current.assets.some(asset=>asset.mediaId==="image")).toBe(true);
});
