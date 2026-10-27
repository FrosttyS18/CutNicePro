import { act,useEffect } from "react";
import { afterAll,afterEach,expect,it,vi } from "vitest";
import { CompositionEditor } from "../components/editor/CompositionEditor";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import type { Composition,CompositionAsset } from "../lib/composition-types";
import { markerColors } from "../lib/composition-markers";
import { reactHost } from "./react-host";

const bootstrap=await vi.hoisted(async()=>{
  const {Window}=await import("happy-dom");
  const environment=new Window({url:"http://localhost"});
  vi.stubGlobal("window",environment);vi.stubGlobal("document",environment.document);
  return environment;
});
vi.mock("../lib/ipc",()=>({loadEditorProject:vi.fn(),getEditorRecovery:vi.fn(async()=>null),discardEditorRecovery:vi.fn(async()=>undefined),saveEditorRecovery:vi.fn(async()=>undefined),saveEditorDocument:vi.fn(),getMedia:vi.fn(async()=>null)}));
vi.mock("../hooks/useTimelinePreview",()=>({useTimelinePreview:()=>({frames:[],peaks:[],error:null})}));
vi.mock("../hooks/useCompositionMedia",()=>({useCompositionMedia:(assets:CompositionAsset[])=>Object.fromEntries(assets.map(asset=>[asset.id,{url:`blob:${asset.mediaId}`,error:null}]))}));
vi.mock("../components/editor/CompositionMediaPoster",()=>({CompositionMediaPoster:()=>null}));
vi.mock("../components/workspace/RelinkMediaControl",()=>({RelinkMediaControl:()=>null}));
vi.mock("../components/editor/CompositionStage",()=>({CompositionStage:({onReady}:{onReady:(value:boolean)=>void})=>{useEffect(()=>onReady(true),[onReady]);return null;}}));
const ipc=await import("../lib/ipc");
let view:Awaited<ReturnType<typeof reactHost>>|undefined;
afterEach(async()=>{await view?.close();view=undefined;vi.clearAllMocks();});
afterAll(async()=>{await bootstrap.happyDOM.cancelAsync();vi.unstubAllGlobals();});
async function mount(){
  const data=emptyWorkspace();data.media={kind:"local",mediaId:"source",name:"Fonte.mp4",duration:20,width:640,height:360,videoId:null,url:null};
  const original=compositionFromLegacy(data,{hasAudio:false});
  vi.mocked(ipc.loadEditorProject).mockResolvedValue({version:1,project:{document:original,manuallyEdited:false,editedAtMs:1},clips:{}});
  vi.mocked(ipc.saveEditorDocument).mockImplementation(async(_project:string,_clip:string|null,document:Composition)=>({document:{...document,revision:document.revision+1},manuallyEdited:true,editedAtMs:2}));
  view=await reactHost(<CompositionEditor projectId="project" title="Projeto" data={data} localUrl="blob:source" onBack={vi.fn()}/>);
  return original;
}
async function press(key:string,options:KeyboardEventInit={}){
  const target=view!.host.querySelector<HTMLElement>('[data-editor-timeline]')!;
  await act(async()=>{target.focus();target.dispatchEvent(new window.KeyboardEvent("keydown",{key,bubbles:true,cancelable:true,...options}));});
}
async function click(label:string){
  const button=[...document.querySelectorAll<HTMLButtonElement>('button')].find(item=>item.getAttribute("aria-label")===label||item.textContent?.trim()===label)!;
  expect(button,label).toBeDefined();await act(async()=>button.click());
}
function marker(){
  const element=view!.host.querySelector<HTMLButtonElement>('[data-composition-marker]');
  expect(element).not.toBeNull();return element!;
}
function markerDialog(){
  const element=document.querySelector<HTMLElement>('[role="dialog"][aria-label="Editar marcador"]');
  expect(element).not.toBeNull();return element!;
}
function field(label:string){
  const element=[...markerDialog().querySelectorAll<HTMLLabelElement>("label")].find(item=>item.textContent===label)?.querySelector<HTMLInputElement>("input");
  expect(element,label).toBeDefined();return element!;
}
async function fill(label:string,value:string){
  const input=field(label);
  await act(async()=>{
    input.focus();Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),"value")!.set!.call(input,value);
    input.dispatchEvent(new window.Event("input",{bubbles:true}));
    input.dispatchEvent(new window.Event("change",{bubbles:true}));
  });
}
async function doubleClickMarker(){
  await act(async()=>marker().dispatchEvent(new window.MouseEvent("dblclick",{bubbles:true,cancelable:true})));
}
it("M cria um marcador e segundo M abre os campos sem duplicar; salvar preserva a mídia",async()=>{
  const original=await mount();await press("m");
  expect(view!.host.querySelectorAll('[data-composition-marker]')).toHaveLength(1);
  await press("m");
  expect(document.querySelector('[role="dialog"][aria-label="Editar marcador"]')).not.toBeNull();
  expect(view!.host.querySelectorAll('[data-composition-marker]')).toHaveLength(1);
  await act(async()=>document.querySelector<HTMLElement>('[role="dialog"][aria-label="Editar marcador"]')!.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true})));
  await click("Salvar");
  const saved=vi.mocked(ipc.saveEditorDocument).mock.lastCall![2];
  expect(saved.markers).toHaveLength(1);expect(saved.items).toEqual(original.items);expect(saved.tracks).toEqual(original.tracks);
});
it("M ignora repetição, IME e modificadores",async()=>{
  await mount();for(const options of [{repeat:true},{isComposing:true},{ctrlKey:true},{altKey:true},{shiftKey:true}])await press("m",options);
  expect(view!.host.querySelector('[data-composition-marker]')).toBeNull();
  await press("m");expect(view!.host.querySelectorAll('[data-composition-marker]')).toHaveLength(1);
});

it("edita nome, posição e cor como uma ação; desfazer, refazer e salvar preservam a mídia",async()=>{
  const original=await mount();await press("m");
  const id=marker().dataset.compositionMarker;
  await press("m");
  await fill("Nome","  Abertura da entrevista  ");
  await fill("Posição","00:01.500");
  await click(`Cor ${markerColors[3]}`);
  expect(marker().getAttribute("aria-label")).toContain("Marcador · 00:00.000");
  expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
  await click("Concluir");
  expect(document.querySelector('[role="dialog"][aria-label="Editar marcador"]')).toBeNull();
  expect(marker().dataset.compositionMarker).toBe(id);
  expect(marker().getAttribute("aria-label")).toContain("Abertura da entrevista · 00:01.500");
  await click("Desfazer (Ctrl+Z)");
  expect(marker().dataset.compositionMarker).toBe(id);
  expect(marker().getAttribute("aria-label")).toContain("Marcador · 00:00.000");
  await click("Refazer (Ctrl+Shift+Z)");
  expect(marker().getAttribute("aria-label")).toContain("Abertura da entrevista · 00:01.500");
  await click("Salvar");
  expect(ipc.saveEditorDocument).toHaveBeenCalledOnce();
  const saved=vi.mocked(ipc.saveEditorDocument).mock.lastCall![2];
  expect(saved.markers).toEqual([{id,name:"Abertura da entrevista",frame:45,color:markerColors[3]}]);
  expect(saved.items).toEqual(original.items);expect(saved.assets).toEqual(original.assets);expect(saved.tracks).toEqual(original.tracks);
  expect(view!.host.querySelector('[data-testid="editor-save-status"]')?.textContent).toBe("Alterações salvas");
});

it("duplo clique abre o mesmo marcador e a exclusão participa do histórico e do salvar",async()=>{
  const original=await mount();await press("m");
  const id=marker().dataset.compositionMarker;
  await doubleClickMarker();
  expect(field("Nome").value).toBe("Marcador");
  expect(field("Posição").value).toBe("00:00.000");
  expect(view!.host.querySelectorAll('[data-composition-marker]')).toHaveLength(1);
  await click("Excluir");
  expect(view!.host.querySelector('[data-composition-marker]')).toBeNull();
  expect(document.querySelector('[role="dialog"][aria-label="Editar marcador"]')).toBeNull();
  await click("Desfazer (Ctrl+Z)");
  expect(marker().dataset.compositionMarker).toBe(id);
  await click("Refazer (Ctrl+Shift+Z)");
  expect(view!.host.querySelector('[data-composition-marker]')).toBeNull();
  await click("Salvar");
  const saved=vi.mocked(ipc.saveEditorDocument).mock.lastCall![2];
  expect(saved.markers).toEqual([]);expect(saved.items).toEqual(original.items);
});

it.each(["Escape","outside"])("%s cancela a edição sem mudar o marcador salvo",async(method)=>{
  await mount();await press("m");await press("m");
  await fill("Nome","Nome temporário");await fill("Posição","00:02.000");await click(`Cor ${markerColors[1]}`);
  await act(async()=>{
    if(method==="Escape")markerDialog().dispatchEvent(new window.KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}));
    else document.body.dispatchEvent(new window.MouseEvent("pointerdown",{bubbles:true}));
  });
  expect(document.querySelector('[role="dialog"][aria-label="Editar marcador"]')).toBeNull();
  await doubleClickMarker();
  expect(field("Nome").value).toBe("Marcador");expect(field("Posição").value).toBe("00:00.000");
  expect(markerDialog().querySelector(`[aria-label="Cor ${markerColors[0]}"]`)?.getAttribute("aria-pressed")).toBe("true");
  await act(async()=>markerDialog().dispatchEvent(new window.KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true})));
  await click("Salvar");
  expect(vi.mocked(ipc.saveEditorDocument).mock.lastCall![2].markers).toMatchObject([{name:"Marcador",frame:0,color:markerColors[0]}]);
});

it("tempo inválido mantém o editor aberto, mostra erro e preserva a versão anterior",async()=>{
  await mount();await press("m");await doubleClickMarker();
  await fill("Nome","Nome ainda não confirmado");await fill("Posição","00:99.000");
  await click("Concluir");
  expect(markerDialog().querySelector('[role="alert"]')?.textContent).toContain("formato");
  expect(marker().getAttribute("aria-label")).toContain("Marcador · 00:00.000");
  expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
  await act(async()=>markerDialog().dispatchEvent(new window.KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true})));
  await click("Salvar");
  expect(vi.mocked(ipc.saveEditorDocument).mock.lastCall![2].markers).toMatchObject([{name:"Marcador",frame:0,color:markerColors[0]}]);
});

it("digitar M nos campos da montagem e do marcador não cria outro marcador",async()=>{
  await mount();await click("Posição precisa");
  const position=view!.host.querySelector<HTMLInputElement>('[aria-label="Cursor da montagem em frames"]')!;
  await act(async()=>{
    position.focus();position.dispatchEvent(new window.KeyboardEvent("keydown",{key:"m",bubbles:true,cancelable:true}));
  });
  expect(view!.host.querySelector('[data-composition-marker]')).toBeNull();
  await act(async()=>position.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true})));
  await press("m");await press("m");
  const input=field("Nome");
  await act(async()=>{input.focus();input.dispatchEvent(new window.KeyboardEvent("keydown",{key:"m",bubbles:true,cancelable:true}));});
  expect(view!.host.querySelectorAll('[data-composition-marker]')).toHaveLength(1);
  expect(field("Nome").value).toBe("Marcador");
});

it("limita o nome a120 caracteres e mantém HTML malicioso como texto no nome e tooltip",async()=>{
  const original=await mount();await press("m");await press("m");
  await fill("Nome","Á".repeat(121));
  expect(field("Nome").value).toBe("Á".repeat(120));
  expect(markerDialog().querySelector('.editor-name-field__count')?.textContent).toBe("120/120 caracteres");
  const payload='<img src=x onerror="alert(1)"><script>alert(2)</script>';
  await fill("Nome",payload);await click("Concluir");
  expect(marker().getAttribute("aria-label")).toContain(payload);
  await act(async()=>marker().focus());
  const tooltip=document.querySelector('[role="tooltip"]')!;
  expect(tooltip.textContent).toContain(payload);
  expect(tooltip.querySelector('img,script')).toBeNull();
  await click("Salvar");
  const saved=vi.mocked(ipc.saveEditorDocument).mock.lastCall![2];
  expect(saved.markers?.[0].name).toBe(payload);expect(saved.items).toEqual(original.items);
});

it("marcador posterior ao fim continua editável sem aumentar a duração ou perder a anotação",async()=>{
  const original=await mount();await press("m");await press("m");
  await fill("Posição","00:30.000");await click("Concluir");
  await click("Ajustar à largura");
  expect(marker().getAttribute("aria-label")).toContain("00:30.000");
  await doubleClickMarker();expect(field("Posição").value).toBe("00:30.000");
  await click("Concluir");await click("Salvar");
  const saved=vi.mocked(ipc.saveEditorDocument).mock.lastCall![2];
  expect(saved.markers?.[0].frame).toBe(900);expect(saved.items).toEqual(original.items);
});

it("excluir o marcador aberto por duplo clique devolve o foco e M cria outro sem novo clique",async()=>{
  await mount();await press("m");
  await act(async()=>marker().focus());await doubleClickMarker();await click("Excluir");
  expect(view!.host.querySelector('[data-composition-marker]')).toBeNull();
  await act(async()=>document.activeElement!.dispatchEvent(new window.KeyboardEvent("keydown",{key:"m",bubbles:true,cancelable:true})));
  expect(view!.host.querySelectorAll('[data-composition-marker]')).toHaveLength(1);
});
