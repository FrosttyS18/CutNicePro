import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VideoEditor } from "../components/editor/VideoEditor";
import { emptyWorkspace } from "../lib/workspace";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { reactHost } from "./react-host";
import type { Composition } from "../lib/composition-types";

vi.mock("../lib/ipc",()=>({
  loadEditorProject:vi.fn(async()=>({version:1,project:null,clips:{}})),getEditorRecovery:vi.fn(async()=>null),
  saveEditorRecovery:vi.fn(async()=>undefined),discardEditorRecovery:vi.fn(async()=>undefined),
  getMedia:vi.fn(async()=>({sha256:"source",ext:"mp4",analysis:{durationMs:10000,width:1920,height:1080,fps:30,hasAudio:true}})),
  mediaUrl:vi.fn(()=>"http://cnplocal.localhost/source.mp4"),
  saveEditorDocument:vi.fn(async(_p:string,_c:string|null,document:Composition,revision:number)=>({document:{...document,revision:revision+1},manuallyEdited:true,editedAtMs:10})),
}));
vi.mock("../components/editor/CompositionStage",()=>({CompositionStage:()=> <div>Prévia</div>}));
vi.mock("../components/editor/CompositionSource",()=>({CompositionSource:()=> <div>Fonte</div>}));
vi.mock("../components/editor/EditorInspector",()=>({EditorInspector:()=>null,panelForTool:()=>"captions"}));
vi.mock("../hooks/useTimelinePreview",()=>({useTimelinePreview:()=>({frames:[],peaks:[],error:null})}));
const ipc=await import("../lib/ipc");
let mounted:Awaited<ReturnType<typeof reactHost>>|undefined;
afterEach(async()=>{await mounted?.close();mounted=undefined;vi.clearAllMocks();});
function fixture(){const data=emptyWorkspace();data.media={kind:"local",mediaId:"source",name:"source.mp4",duration:10,width:1920,height:1080,videoId:null,url:null};data.activeClipId="a".repeat(64);return data;}
describe("editor normal conectado à montagem",()=>{
  it("voltar para V limpa o intervalo de R tanto pelo botão quanto pelo teclado",async()=>{
    mounted=await reactHost(<VideoEditor projectId="project" title="Projeto" data={fixture()} localUrl="source.mp4" dirty={false} onChange={vi.fn()} onSave={vi.fn()} onBack={vi.fn()}/>);
    const mark=async()=>{
      await act(async()=>mounted!.host.querySelector<HTMLButtonElement>('[aria-label="Marcar intervalo (R)"]')!.click());
      const video=mounted!.host.querySelector<HTMLElement>('[data-kind="video"][data-composition-item]')!;
      await act(async()=>{video.dispatchEvent(new window.MouseEvent("pointerdown",{button:0,clientX:180,bubbles:true}));window.dispatchEvent(new window.MouseEvent("pointerup",{clientX:280}));});
      expect(mounted!.host.querySelector('[aria-label="Intervalo marcado"]')).not.toBeNull();
    };
    await mark();
    await act(async()=>mounted!.host.querySelector<HTMLButtonElement>('[aria-label="Selecionar (V)"]')!.click());
    expect(mounted.host.querySelector('[aria-label="Intervalo marcado"]')).toBeNull();
    await mark();
    await act(async()=>{mounted!.host.querySelector<HTMLElement>('[data-testid="video-editor"]')!.focus();window.dispatchEvent(new window.KeyboardEvent("keydown",{key:"v",bubbles:true,cancelable:true}));});
    expect(mounted.host.querySelector('[aria-label="Intervalo marcado"]')).toBeNull();
    expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
  });
  it("recorta no cursor pela barra apenas o vídeo selecionado",async()=>{
    mounted=await reactHost(<VideoEditor projectId="project" title="Projeto" data={fixture()} localUrl="source.mp4" dirty={false} onChange={vi.fn()} onSave={vi.fn()} onBack={vi.fn()}/>);
    const original=mounted.host.querySelector<HTMLElement>('[data-kind="video"][data-composition-item]')!;
    const id=original.dataset.compositionItem;
    await act(async()=>original.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Enter",bubbles:true})));
    await act(async()=>window.dispatchEvent(new window.KeyboardEvent("keydown",{key:"d",ctrlKey:true,cancelable:true})));
    expect(mounted.host.querySelectorAll('[data-kind="video"][data-composition-item]')).toHaveLength(2);
    await act(async()=>mounted!.host.querySelector<HTMLElement>(`[data-composition-item="${id}"]`)!.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Enter",bubbles:true})));
    await act(async()=>mounted!.host.querySelector<HTMLButtonElement>('[aria-label="Posição precisa"]')!.click());
    const field=mounted.host.querySelector<HTMLInputElement>('[aria-label="Cursor da montagem em frames"]')!;
    await act(async()=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field),"value")!.set!.call(field,"100");field.dispatchEvent(new window.Event("input",{bubbles:true}));});
    const trim=mounted.host.querySelector<HTMLButtonElement>('[aria-label="Excluir à esquerda do cursor (Q)"]')!;
    expect(trim.getAttribute("aria-disabled")).toBe("false");
    await act(async()=>trim.click());
    expect(mounted.host.querySelector(`[data-composition-item="${id}"]`)?.getAttribute("data-start-frame")).toBe("100");
    const untouched=[...mounted.host.querySelectorAll<HTMLElement>('[data-kind="video"][data-composition-item]')].find(item=>item.dataset.compositionItem!==id)!;
    expect(untouched.getAttribute("data-start-frame")).toBe("0");
    expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
  });
  it("religar o ímã encaixa o vídeo no início sem salvar automaticamente",async()=>{
    const data=fixture(),original=compositionFromLegacy(data);
    const shifted={...original,revision:1,items:original.items.map(item=>({...item,startFrame:item.startFrame+100}))};
    vi.mocked(ipc.loadEditorProject).mockResolvedValueOnce({version:1,project:null,clips:{[data.activeClipId!]:{document:shifted,manuallyEdited:false,editedAtMs:1}}});
    mounted=await reactHost(<VideoEditor projectId="project" title="Projeto" data={data} localUrl="source.mp4" dirty={false} onChange={vi.fn()} onSave={vi.fn()} onBack={vi.fn()}/>);
    const magnet=mounted.host.querySelector<HTMLButtonElement>('[aria-label="Ímã da faixa principal"]')!;
    await act(async()=>magnet.click());
    expect(mounted.host.querySelector('[data-kind="video"][data-composition-item]')?.getAttribute("data-start-frame")).toBe("100");
    await act(async()=>magnet.click());
    const video=mounted.host.querySelector('[data-kind="video"][data-composition-item]')!;
    expect(video.getAttribute("data-start-frame")).toBe("0");
    expect(video.getAttribute("data-composition-item")).toBe(original.items[0].id);
    expect(video.getAttribute("data-source-start-us")).toBe(String(original.items[0].sourceStartUs));
    expect(mounted.host.querySelector('[data-testid="editor-save-status"]')?.textContent).toContain("Alterações não salvas");
    expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
  });
  it("ímã responde ao botão e ao atalho sem salvar uma edição",async()=>{
    mounted=await reactHost(<VideoEditor projectId="project" title="Projeto" data={fixture()} localUrl="source.mp4" dirty={false} onChange={vi.fn()} onSave={vi.fn()} onBack={vi.fn()}/>);
    const magnet=mounted.host.querySelector<HTMLButtonElement>('[aria-label="Ímã da faixa principal"]')!;
    expect(magnet.getAttribute("aria-pressed")).toBe("true");
    await act(async()=>magnet.click());
    expect(magnet.getAttribute("aria-pressed")).toBe("false");
    await act(async()=>{mounted!.host.querySelector<HTMLElement>('[data-testid="video-editor"]')!.focus();window.dispatchEvent(new window.KeyboardEvent("keydown",{key:"p",bubbles:true,cancelable:true}));});
    expect(magnet.getAttribute("aria-pressed")).toBe("true");
    expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
  });
  it("menu move o vídeo para camada acima sem copiar nem salvar automaticamente",async()=>{
    mounted=await reactHost(<VideoEditor projectId="project" title="Projeto" data={fixture()} localUrl="source.mp4" dirty={false} onChange={vi.fn()} onSave={vi.fn()} onBack={vi.fn()}/>);
    const item=mounted.host.querySelector<HTMLElement>('[data-composition-item]')!;
    const id=item.dataset.compositionItem;
    await act(async()=>{item.dispatchEvent(new window.MouseEvent("contextmenu",{bubbles:true,cancelable:true}));});
    const action=Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(button=>button.textContent?.includes("Mover para nova camada acima"))!;
    await act(async()=>action.click());
    const moved=mounted.host.querySelector<HTMLElement>(`[data-composition-item="${id}"]`)!;
    expect(moved.closest('[data-composition-track]')?.getAttribute("data-composition-track")).not.toBe("V1");
    expect(mounted.host.querySelectorAll('[data-kind="video"][data-composition-item]')).toHaveLength(1);
    expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
  });
  it("não permite fixar uma sobreposição de faixa bloqueada pelo menu",async()=>{
    const data=fixture();const document=compositionFromLegacy(data);
    document.tracks.push({id:"V2",name:"Sobreposição",kind:"visual",primary:false,locked:true,muted:false,hidden:false});
    document.items.push({...structuredClone(document.items[0]),id:"overlay",groupId:"overlay",trackId:"V2"});
    vi.mocked(ipc.loadEditorProject).mockResolvedValueOnce({version:1,project:null,clips:{[data.activeClipId!]:{document,manuallyEdited:false,editedAtMs:1}}});
    mounted=await reactHost(<VideoEditor projectId="project" title="Projeto" data={data} localUrl="source.mp4" dirty={false} onChange={vi.fn()} onSave={vi.fn()} onBack={vi.fn()}/>);
    await act(async()=>{mounted!.host.querySelector<HTMLElement>('[data-composition-item="overlay"]')!.dispatchEvent(new window.MouseEvent("contextmenu",{bubbles:true,cancelable:true}));});
    const action=Array.from(globalThis.document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(button=>button.textContent?.includes("Fixar na linha do tempo"))!;
    expect(action.getAttribute("aria-disabled")).toBe("true");
    await act(async()=>action.click());
    expect(mounted.host.querySelector('[data-testid="editor-save-status"]')?.textContent).toContain("Versão salva");
    expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
  });
  it("bloquear a faixa pelo menu impede aparar o item",async()=>{
    mounted=await reactHost(<VideoEditor projectId="project" title="Projeto" data={fixture()} localUrl="source.mp4" dirty={false} onChange={vi.fn()} onSave={vi.fn()} onBack={vi.fn()}/>);
    await act(async()=>{mounted!.host.querySelector<HTMLButtonElement>('[aria-label="Opções da faixa Principal"]')!.click();});
    const option=Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(button=>button.textContent?.includes("Bloquear faixa"))!;
    await act(async()=>{option.click();});
    const edge=mounted.host.querySelector<HTMLElement>('[aria-label="Ajustar início de source.mp4"]')!;
    await act(async()=>{edge.dispatchEvent(new window.KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));});
    expect(mounted.host.textContent).toContain("bloqueada");
    expect(mounted.host.querySelector('[data-composition-item]')?.getAttribute("data-start-frame")).toBe("0");
  });
  it("edita e salva o mesmo clipe apenas no clique Salvar",async()=>{
    const legacySave=vi.fn();
    mounted=await reactHost(<VideoEditor projectId="project" title="Projeto" data={fixture()} localUrl="source.mp4" dirty={false} onChange={vi.fn()} onSave={legacySave} onBack={vi.fn()}/>);
    expect(mounted.host.querySelector('[aria-label="Timeline da montagem"]')).not.toBeNull();
    const item=mounted.host.querySelector<HTMLElement>('[data-composition-item]')!;
    await act(async()=>{item.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Enter",bubbles:true}));});
    await act(async()=>{window.dispatchEvent(new window.KeyboardEvent("keydown",{key:"d",ctrlKey:true,cancelable:true}));});
    expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
    await mounted.click("Salvar");
    expect(ipc.saveEditorDocument).toHaveBeenCalledWith("project","a".repeat(64),expect.objectContaining({items:expect.any(Array)}),0);
    expect(legacySave).not.toHaveBeenCalled();
    expect(mounted.host.querySelectorAll('[data-composition-item]')).toHaveLength(2);
    expect(vi.mocked(ipc.saveEditorDocument).mock.calls[0][2].items).toHaveLength(4);
  });
  it("sair com rascunho oferece ficar ou descartar sem salvar sozinho",async()=>{
    const back=vi.fn();
    mounted=await reactHost(<VideoEditor projectId="project" title="Projeto" data={fixture()} localUrl="source.mp4" dirty={false} onChange={vi.fn()} onSave={vi.fn()} onBack={back}/>);
    const edge=mounted.host.querySelector<HTMLElement>('[aria-label="Ajustar início de source.mp4"]')!;
    await act(async()=>{edge.dispatchEvent(new window.KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));});
    await act(async()=>{mounted!.host.querySelector<HTMLButtonElement>('[aria-label="Voltar ao projeto"]')!.click();});
    expect(back).not.toHaveBeenCalled();
    expect(mounted.host.textContent).toContain("Continuar editando");
    await mounted.click("Descartar e sair");
    expect(back).toHaveBeenCalledOnce();
    expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
  });
});
