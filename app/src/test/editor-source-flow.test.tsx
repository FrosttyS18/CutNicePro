import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { VideoEditor } from "../components/editor/VideoEditor";
import { emptyWorkspace } from "../lib/workspace";
import { openClipWorkspace } from "../lib/clip-workspace";
import { defaultSplitScreen } from "../lib/split-screen";
import { parseComposition } from "../lib/composition-boundary";
import type { Clip } from "../lib/clips";
import type { Composition } from "../lib/composition-types";
import type { EditorProjectState } from "../lib/composition-persistence";
import type { EditSegment } from "../lib/workspace-types";
import { reactHost } from "./react-host";

vi.mock("../hooks/useTimelinePreview",()=>({useTimelinePreview:()=>({frames:[],peaks:[],error:null})}));
vi.mock("../lib/frame-seeker",()=>({FrameSeeker:class {async getFrameAt(){return null;}dispose(){}}}));
vi.mock("../lib/ipc",async importOriginal=>({
  ...await importOriginal<typeof import("../lib/ipc")>(),
  loadEditorProject:vi.fn(async()=>nativeState),getEditorRecovery:vi.fn(async()=>null),
  saveEditorRecovery:vi.fn(async()=>undefined),discardEditorRecovery:vi.fn(async()=>undefined),
  getMedia:vi.fn(async()=>({sha256:"source",ext:"mp4",analysis:{durationMs:180000,width:1920,height:1080,fps:30,hasAudio:true}})),
  mediaUrl:vi.fn(()=>"blob:source"),suggestSplitScreen:vi.fn(),
  saveEditorDocument:vi.fn(async(_project:string,clipId:string|null,document:Composition,revision:number)=>{
    const snapshot={document:{...structuredClone(document),revision:revision+1},manuallyEdited:Boolean(clipId),editedAtMs:1};
    if(clipId)nativeState={...nativeState,clips:{...nativeState.clips,[clipId]:snapshot}};else nativeState={...nativeState,project:snapshot};
    return snapshot;
  }),
}));
const ipc=await import("../lib/ipc");
const clip:Clip={id:"b".repeat(64),start:10,end:60,title:"História",score:80,reasons:[],review:"pending"};
let nativeState:EditorProjectState={version:1,project:null,clips:{}};
let view:Awaited<ReturnType<typeof reactHost>>|undefined;
afterEach(async()=>{await view?.close();view=undefined;vi.restoreAllMocks();vi.clearAllMocks();});
async function mount(asClip=true,legacySplit=false,verified=false,windows?:EditSegment[],reopen=false){
  if(!reopen)nativeState={version:1,project:null,clips:{}};
  let data=emptyWorkspace();
  data.media={kind:"local",mediaId:"m",name:"Fonte.mp4",videoId:null,url:null,width:1920,height:1080,duration:180};
  if(asClip)data=openClipWorkspace(data,clip);
  if(windows)data.settings={...data.settings,trimStart:windows[0].sourceStart,trimEnd:windows[windows.length-1].sourceEnd,editPlan:{version:1,segments:windows}};
  if(legacySplit)data.settings={...data.settings,ratio:"9:16",splitScreen:{...defaultSplitScreen(),faceValidated:verified}};
  view=await reactHost(<VideoEditor projectId="p" title="Fonte" data={data} activeClip={asClip?clip:undefined} localUrl="blob:source" dirty={false} onChange={vi.fn()} onSave={vi.fn()} onBack={vi.fn()}/>,environment=>{
    Object.defineProperty(environment,"requestAnimationFrame",{configurable:true,value:vi.fn(()=>1)});Object.defineProperty(environment,"cancelAnimationFrame",{configurable:true,value:vi.fn()});
    vi.stubGlobal("requestAnimationFrame",environment.requestAnimationFrame);vi.stubGlobal("cancelAnimationFrame",environment.cancelAnimationFrame);
    for(const [key,value]of Object.entries({readyState:2,duration:180,paused:true,seeking:false}))Object.defineProperty(environment.HTMLVideoElement.prototype,key,{configurable:true,get:()=>value});
    environment.HTMLMediaElement.prototype.play=vi.fn(async()=>undefined);environment.HTMLMediaElement.prototype.pause=vi.fn();
  });
  return view;
}
async function key(label:string,value:string,ctrlKey=false){
  const target=view!.host.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
  if(!target)throw new Error(`Controle ausente: ${label}`);
  await act(async()=>target.focus());
  await act(async()=>target.dispatchEvent(new window.KeyboardEvent("keydown",{key:value,ctrlKey,bubbles:true,cancelable:true})));
}
function end(){return Number(view!.host.querySelector('[data-composition-item][data-kind="video"]')?.getAttribute("data-source-end-us"))/1e6;}
function saved(asClip=true){return (asClip?nativeState.clips[clip.id]:nativeState.project)!.document;}
async function drag(){
  const target=view!.host.querySelector<HTMLElement>(".composition-stage")!;
  Object.defineProperty(target,"getBoundingClientRect",{value:()=>({left:100,top:100,width:200,height:400})});
  await act(async()=>{
    target.dispatchEvent(new window.MouseEvent("pointerdown",{button:0,clientX:150,clientY:150,bubbles:true,cancelable:true}));
    window.dispatchEvent(new window.MouseEvent("pointermove",{clientX:170,clientY:150}));
    window.dispatchEvent(new window.MouseEvent("pointerup",{clientX:170,clientY:150}));
  });
}
it("permite buscar a fala posterior ao corte da IA na Fonte antes de ampliá-lo",async()=>{
  await mount();
  expect(view!.host.querySelector(".composition-source")).toBeNull();
  await act(async()=>view!.host.querySelector<HTMLButtonElement>('[aria-label="Abrir fonte selecionada"]')!.click());
  await key("Posição na fonte","End");
  expect(view!.host.querySelector<HTMLVideoElement>(".composition-source video")!.currentTime).toBe(180);
  expect(end()).toBe(60);expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
});
it("amplia, desfaz, refaz, salva, reabre e prepara a mesma revisão de montagem",async()=>{
  await mount();await key("Ajustar fim de Fonte.mp4","End");expect(end()).toBe(180);
  await key("Ajustar fim de Fonte.mp4","z",true);expect(end()).toBe(60);
  await key("Ajustar fim de Fonte.mp4","y",true);expect(end()).toBe(180);
  await view!.click("Salvar");const snapshot=structuredClone(saved());
  expect(snapshot.items.find(item=>item.kind==="video")!.sourceEndUs).toBe(180_000_000);
  expect(parseComposition(snapshot).revision).toBe(1);
  await view!.close();view=undefined;await mount(true,false,false,undefined,true);
  expect(end()).toBe(180);expect(ipc.saveEditorDocument).toHaveBeenCalledOnce();
});
it("oferece divisão no vídeo completo sem modo técnico exclusivo de clipes",async()=>{
  await mount(false);await key("Arrastar cursor da montagem","ArrowRight");
  await act(async()=>view!.host.querySelector<HTMLButtonElement>('[aria-label="Dividir no cursor (Ctrl+B)"]')!.click());
  expect(view!.host.querySelectorAll('[data-composition-item][data-kind="video"]')).toHaveLength(2);
  await view!.click("Salvar");expect(saved(false).items.filter(item=>item.kind==="video")).toHaveLength(2);
});
it("o modo enquadrar move a imagem pela prévia sem disparar reprodução",async()=>{
  await mount();await view!.click("Enquadrar");await drag();await view!.click("Salvar");
  expect(saved().items.find(item=>item.kind==="video")!.settings.focalPoint?.x).toBe(40);
  expect(view!.host.querySelector(".composition-stage .video-surface-toggle")).toBeNull();
});
it("reabre split antigo sem apagar painéis e permite confirmação manual explícita",async()=>{
  await mount(true,true);expect(ipc.suggestSplitScreen).not.toHaveBeenCalled();
  await view!.click("Enquadrar");await view!.click("Duas pessoas (empilhadas)");
  expect(view!.host.querySelector(".split-preview")).not.toBeNull();
  await view!.click("Salvar");expect(saved().items[0].settings.splitScreen?.faceValidated).toBe(true);
});
it("enquadrar durante localização pendente preserva painéis e permite salvar o ajuste",async()=>{
  vi.mocked(ipc.suggestSplitScreen).mockImplementationOnce(()=>new Promise(()=>undefined));
  await mount(true,true);await view!.click("Enquadrar");await view!.click("Localizar duas pessoas");await drag();await view!.click("Salvar");
  expect(saved().items[0].settings.focalPoint?.x).toBe(40);
  expect(saved().items[0].settings.splitScreen?.top.x).toBe(0);
});
it("ampliar preserva o split manual; localização explícita usa a nova janela",async()=>{
  vi.mocked(ipc.suggestSplitScreen).mockResolvedValue({status:"manual",message:"O plano mudou para uma pessoa."});
  await mount(true,true,true);await key("Ajustar fim de Fonte.mp4","End");expect(end()).toBe(180);
  expect(ipc.suggestSplitScreen).not.toHaveBeenCalled();await view!.click("Enquadrar");await view!.click("Localizar duas pessoas");
  expect(ipc.suggestSplitScreen).toHaveBeenCalledWith(expect.objectContaining({projectId:"p",mediaId:"m",start:10,end:180}));
  expect(view!.host.textContent).toContain("O plano mudou para uma pessoa.");
  await key("Ajustar fim de Fonte.mp4","z",true);expect(end()).toBe(60);
});
it.each(["buscar","reproduzir"])("não usa eventos nativos para voltar ao vão removido ao %s",async mode=>{
  await mount(true,false,false,[{sourceStart:10,sourceEnd:20},{sourceStart:40,sourceEnd:60}]);
  const ruler=view!.host.querySelector<HTMLElement>(".composition-ruler__ticks")!;
  await act(async()=>{ruler.dispatchEvent(new window.MouseEvent("pointerdown",{button:0,clientX:404,bubbles:true}));window.dispatchEvent(new window.MouseEvent("pointerup",{clientX:404}));});
  if(mode==="reproduzir")await act(async()=>view!.host.querySelector<HTMLButtonElement>('[aria-label="Reproduzir montagem"]')!.click());
  const video=view!.host.querySelector<HTMLVideoElement>(".composition-stage video")!;
  expect(video.currentTime).toBeCloseTo(40,1);
  video.currentTime=30;await act(async()=>video.dispatchEvent(new window.Event("timeupdate")));
  await key("Arrastar cursor da montagem","ArrowRight");
  expect(video.currentTime).toBeGreaterThanOrEqual(40);
});
