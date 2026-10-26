import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompositionEditorBody } from "../components/editor/CompositionEditorBody";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";
import type { Composition } from "../lib/composition-types";

vi.mock("../hooks/useTimelinePreview",()=>({useTimelinePreview:()=>({frames:[],peaks:[],error:null})}));
vi.mock("../hooks/useCompositionMedia",()=>({useCompositionMedia:()=>({source:{url:"blob:source",error:null}})}));
vi.mock("../components/editor/CompositionStage",()=>({CompositionStage:()=> <div data-testid="montage-preview"/>}));
let view:Awaited<ReturnType<typeof reactHost>>|undefined;
afterEach(async()=>{await view?.close();view=undefined;vi.clearAllMocks();});
const legacy=emptyWorkspace();
const document:Composition={version:1,revision:0,fps:{numerator:30,denominator:1},settings:legacy.settings,
  tracks:[{id:"V1",name:"Principal",kind:"visual",primary:true,locked:false,hidden:false,muted:false}],items:[],
  assets:[{id:"source",mediaId:"media",name:"Entrevista completa com demonstração.mp4",kind:"video",durationUs:125_000_000,width:1920,height:1080,transcript:[]}]};
const noop=()=>{};
async function mount(){
  const onChange=vi.fn();
  const importVideo=vi.fn();
  view=await reactHost(<CompositionEditorBody projectId="p" document={document} frame={0} playing={false} selected={[]} sourceUrl="blob:source" legacy={legacy}
    onChange={onChange} onSeek={noop} onPause={noop} onError={noop} onPreviews={noop} onPreview={noop}
    previews={{source:{frames:["blob:thumbnail"],peaks:[]}}} addItems={[{label:"Vídeo na faixa principal",icon:null,onSelect:importVideo}]} transport={<button type="button">Reproduzir montagem</button>}/>);
  return {onChange,importVideo};
}
async function click(label:string){
  const button=view!.host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if(!button)throw new Error(`Controle ausente: ${label}`);
  await act(async()=>button.click());
}
describe("organização modular do editor",()=>{
  it("abre com biblioteca visual e prévia única; a fonte exige ação explícita",async()=>{
    const {onChange}=await mount();
    expect(view!.host.querySelector('[data-editor-viewer="source"]')).toBeNull();
    expect(view!.host.querySelector('img[src="blob:thumbnail"]')).not.toBeNull();
    expect(view!.host.textContent).toContain("02:05");
    expect(view!.host.querySelector(".composition-editor__stage")?.textContent).toContain("Reproduzir montagem");
    await click("Abrir fonte selecionada");
    expect(view!.host.querySelector('[data-editor-viewer="source"]')).not.toBeNull();
    expect(view!.host.querySelector('[data-testid="montage-preview"]')).toBeNull();
    expect(view!.host.querySelector('[aria-label="Biblioteca de mídias"] img')).not.toBeNull();
    expect(view!.host.querySelector(".composition-editor__viewer-transport")).toBeNull();
    expect(view!.host.querySelectorAll("video")).toHaveLength(1);
    await click("Voltar à montagem");
    expect(view!.host.querySelector('[data-editor-viewer="source"]')).toBeNull();
    expect(view!.host.querySelector('[data-testid="montage-preview"]')).not.toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    await click("Abrir fonte selecionada");
    const insert=view!.host.querySelector<HTMLButtonElement>('.composition-source [aria-label="Adicionar no cursor"]')!;
    await act(async()=>insert.click());
    expect(onChange).toHaveBeenCalledOnce();
    expect(view!.host.querySelector(".composition-source")).toBeNull();
    expect(view!.host.querySelector('[data-testid="montage-preview"]')).not.toBeNull();
  });
  it("fecha, reabre e expande painéis sem alterar a montagem",async()=>{
    const {onChange}=await mount();
    await click("Expandir biblioteca");
    expect(view!.host.querySelector('[data-panel="library"]')?.getAttribute("data-expanded")).toBe("true");
    await click("Fechar biblioteca");
    expect(view!.host.querySelector('[data-panel="library"]')).toBeNull();
    await click("Mostrar biblioteca");
    expect(view!.host.querySelector('[data-panel="library"]')).not.toBeNull();
    await click("Fechar propriedades");
    expect(view!.host.querySelector(".editor-inspector")).toBeNull();
    await click("Mostrar propriedades");
    expect(view!.host.querySelector(".editor-inspector")).not.toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
  it("ajusta a biblioteca com teclado e importa pelo menu existente",async()=>{
    const {importVideo}=await mount();
    const separator=view!.host.querySelector<HTMLElement>('[role="separator"][aria-label="Redimensionar biblioteca"]')!;
    expect(separator).not.toBeNull();
    const initial=Number(separator.getAttribute("aria-valuenow"));
    await act(async()=>separator.dispatchEvent(new window.KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true,cancelable:true})));
    expect(Number(separator.getAttribute("aria-valuenow"))).toBeGreaterThan(initial);
    await click("Importar mídia");
    const option=Array.from(globalThis.document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(button=>button.textContent==="Vídeo na faixa principal")!;
    await act(async()=>option.click());
    expect(importVideo).toHaveBeenCalledOnce();
  });
});
