import { afterEach,describe,expect,it,vi } from "vitest";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { invoke } from "@tauri-apps/api/core";
import { ClipInspection } from "../components/clips/ClipInspection";
import { ClipTools } from "../components/clips/ClipTools";
import { defaultEditorSettings } from "../lib/workspace";
import { visibleClips,type LibraryClip } from "../lib/clip-library";
import { reactHost } from "./react-host";

vi.mock("@tauri-apps/api/core",()=>({invoke:vi.fn()}));
vi.mock("@tauri-apps/api/event",()=>({listen:vi.fn(async()=>()=>undefined)}));
vi.mock("../hooks/useClipMedia",()=>({useClipMedia:()=>({source:null,loading:false,error:null})}));
const entry:LibraryClip={project:{id:"p",name:"Projeto",created_at_ms:0,updated_at_ms:0,last_opened_at_ms:null},mediaId:"m",
  clip:{id:"a".repeat(64),start:0,end:30,title:"Trecho salvo",score:80,reasons:[],review:"pending"}};
const collection={version:1,mediaId:"m",transcriptHash:"h",clips:[entry.clip]};
let mounted:Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async()=>{await mounted?.close();mounted=undefined;vi.clearAllMocks();});
function reads(){vi.mocked(invoke).mockImplementation(async command=>command==="get_clips" ? collection : null);}

describe("fluxo de clipes com efeitos e cliques do React",()=>{
  it("abrir corte salvo não inicia geração nem análise",async()=>{
    reads();mounted=await reactHost(<ClipInspection entry={entry} onClose={()=>undefined} onEdit={()=>undefined}/>);
    expect(vi.mocked(invoke).mock.calls.map(([name])=>name)).toEqual(["get_clips","clips_job"]);
    expect(mounted.host.textContent).toContain("Analisar trecho");
  });
  it("exclui (recuperável), informa e fecha somente depois de persistir",async()=>{
    reads();const close=vi.fn(),changed=vi.fn();
    vi.mocked(invoke).mockImplementation(async command=>command==="get_clips" ? collection : command==="delete_clip" ? {...collection,clips:[{...entry.clip,deleted:true}]} : null);
    mounted=await reactHost(<ClipInspection entry={entry} onClose={close} onChanged={changed} onEdit={()=>undefined}/>);
    await mounted.click("Excluir clipe");
    expect(invoke).toHaveBeenCalledWith("delete_clip",{projectId:"p",mediaId:"m",clipId:entry.clip.id});
    expect(changed).toHaveBeenCalledWith("Clipe excluído.");expect(close).toHaveBeenCalledOnce();
  });
  it("mantém inspeção aberta e mostra falha quando exclusão não é salva",async()=>{
    reads();const close=vi.fn(),changed=vi.fn();
    vi.mocked(invoke).mockImplementation(async command=>{if(command==="delete_clip")throw new Error("disk failure");return command==="get_clips"?collection:null;});
    mounted=await reactHost(<ClipInspection entry={entry} onClose={close} onChanged={changed} onEdit={()=>undefined}/>);
    await mounted.click("Excluir clipe");expect(close).not.toHaveBeenCalled();expect(changed).not.toHaveBeenCalled();
    expect(mounted.host.querySelector('[role="alert"]')).not.toBeNull();
  });
  it("baixar vídeo não exige aprovação e chama export_video com o clipe",async()=>{
    reads();const close=vi.fn();
    vi.mocked(invoke).mockImplementation(async command=>command==="get_clips" ? collection : command==="export_video" ? true : null);
    mounted=await reactHost(<ClipInspection entry={entry} onClose={close} onChanged={()=>undefined} onEdit={()=>undefined}/>);
    await mounted.click("Baixar vídeo");
    const call=vi.mocked(invoke).mock.calls.find(([name])=>name==="export_video");
    expect(call).toBeDefined();
    expect(call![1]).toMatchObject({projectId:"p",mediaId:"m",clipId:entry.clip.id});
  });
  it("rejeitados e excluídos saem da lista ativa e continuam consultáveis",()=>{
    const entries=[entry,
      {...entry,clip:{...entry.clip,id:"b".repeat(64),review:"rejected" as const}},
      {...entry,clip:{...entry.clip,id:"c".repeat(64),deleted:true}}];
    expect(visibleClips(entries,"active","score")).toEqual([entry]);
    expect(visibleClips(entries,"rejected","score")).toHaveLength(1);
    expect(visibleClips(entries,"deleted","score")).toHaveLength(1);
    expect(visibleClips(entries,"all","score")).toHaveLength(3);
  });
  it.each([
    {name:"análise de outra instância não abre modal de geração",operation:"analyze" as const,state:"running" as const,visible:false},
    {name:"geração em andamento é restaurada ao voltar ao projeto",operation:"generate" as const,state:"running" as const,visible:true},
    {name:"falha antiga não reaparece ao abrir cortes salvos",operation:"generate" as const,state:"failed" as const,visible:false},
  ])("$name",async({operation,state,visible})=>{
    const controller={collection:null,job:{jobId:"j",projectId:"p",state,stage:"analyzing" as const,progress:0,error:null},operation,
      ownedJob:false,busy:state === "running",loading:false,error:null,notice:null,generate:vi.fn(async()=>({status:"completed"} as const)),analyze:vi.fn(async()=>({status:"completed"} as const)),exportVideo:vi.fn(async()=>({status:"completed"} as const)),review:vi.fn(async()=>true),remove:vi.fn(async()=>true),restore:vi.fn(async()=>true),cancel:vi.fn(async()=>true),reload:vi.fn()};
    mounted=await reactHost(<ClipTools controller={controller} settings={defaultEditorSettings()} ready disabled={false} onSave={async()=>true} onShowClips={()=>undefined} onFullVideo={()=>undefined}/>);
    expect(Boolean(mounted.host.querySelector("dialog[open]"))).toBe(visible);
  });
});

describe("geração incremental e mensagens do diálogo (atualização 19)",()=>{
  function controller(collection:import("../lib/clips").ClipCollection|null){
    return {collection,job:null,operation:undefined as never,ownedJob:false,busy:false,loading:false,error:null,notice:null,
      generate:vi.fn(async()=>({status:"completed"} as const)),analyze:vi.fn(async()=>({status:"completed"} as const)),exportVideo:vi.fn(async()=>({status:"completed"} as const)),review:vi.fn(async()=>true),remove:vi.fn(async()=>true),restore:vi.fn(async()=>true),cancel:vi.fn(async()=>true),reload:vi.fn()};
  }
  /** O botão da barra E o de confirmação têm o mesmo rótulo ("Gerar cortes"):
   *  clica o PRIMÁRIO do diálogo ABERTO, não o primeiro da página. */
  async function clickDialogGenerate(){
    const buttons=Array.from(mounted!.host.querySelectorAll<HTMLButtonElement>("dialog[open] button"));
    const primary=buttons.find(button=>button.classList.contains("upload-primary"));
    if(!primary) throw new Error("Botão de confirmação não encontrado no diálogo");
    await act(async()=>{primary.click();});
  }
  async function openDialog(controller2:ReturnType<typeof controller>){
    mounted=await reactHost(<ClipTools controller={controller2} settings={defaultEditorSettings()} ready disabled={false} onSave={async()=>true} onShowClips={()=>undefined} onFullVideo={()=>undefined}/>);
    await mounted.click("Gerar cortes");
    return mounted;
  }
  it("com coleção existente o botão continua 'Gerar cortes' e o diálogo promete acréscimo, não substituição",async()=>{
    const existing:import("../lib/clips").ClipCollection={version:1,mediaId:"m",transcriptHash:"h",clips:[entry.clip]};
    const c=controller(existing);
    await openDialog(c);
    expect(mounted!.host.textContent).toContain("Os novos cortes serão adicionados aos que você já tem.");
    expect(mounted!.host.textContent).not.toContain("substituirão a lista atual");
    await clickDialogGenerate();
    expect(c.generate).toHaveBeenCalledTimes(1);
  });
  it("automática (padrão) não envia duração nem quantidade; personalizada envia com mínima técnica",async()=>{
    const existing:import("../lib/clips").ClipCollection={version:1,mediaId:"m",transcriptHash:"h",clips:[entry.clip]};
    // padrão do diálogo = AUTOMÁTICA: nenhum valor fixo escondido
    const c=controller(existing);
    await openDialog(c);
    await clickDialogGenerate();
    // atualização 17: Gemma 4 é o único motor (sempre no payload) + ajuste
    // de preenchimento (fit) escolhido no modal; sem duração/quantidade
    expect(c.generate).toHaveBeenCalledWith({automatic:true,format:"9:16",fit:"cover",quality:"qwen35"});
    // personalizada: duração/quantidade explícitas; mínima técnica (10), sem vínculo com a máxima
    const c2=controller(existing);
    await openDialog(c2);
    await mounted!.chooseOption("Geração","Personalizada");
    await clickDialogGenerate();
    expect(c2.generate).toHaveBeenCalledWith({minSeconds:10,maxSeconds:60,count:3,format:"9:16",fit:"cover",quality:"qwen35"});
    // manter vídeo inteiro propaga fit=contain em qualquer modo; selo Gemma 4
    // e ausência do seletor "Análise" conferidos com o diálogo ABERTO
    const c3=controller(existing);
    await openDialog(c3);
    expect(mounted!.host.textContent).toContain("IA local: Qwen3.5-4B");
    expect(mounted!.host.querySelector('[aria-label="Análise"]')).toBeNull();
    await mounted!.chooseOption("Ajuste do vídeo","Manter vídeo inteiro (admite espaços)");
    await clickDialogGenerate();
    expect(c3.generate).toHaveBeenCalledWith({automatic:true,format:"9:16",fit:"contain",quality:"qwen35"});
  });
  it("novas gerações usam Qwen3.5 sem alterar a origem dos clipes antigos",async()=>{
    const c=controller({version:1,mediaId:"m",transcriptHash:"h",clips:[entry.clip],engine:{backend:"experimentalGemma",model:"gemma-4-12b-it-qat-q4_0.gguf",template:"gemma4-canonical-nothink",sampling:"temp 1.0, top_k 64, top_p 0.95, min_p 0, seed 42",seed:42}});
    await openDialog(c);
    expect(mounted!.host.textContent).toContain("IA local: Qwen3.5-4B");
    expect(c.collection?.engine?.backend).toBe("experimentalGemma");
    expect(mounted!.host.querySelector('[aria-label="Análise"]')).toBeNull();
  });
});

describe("prévia da inspeção usa o intervalo EDITADO (upd 20)",()=>{
  it("limites efetivos = edição salva dentro do clipe (não os limites originais)",()=>{
    const storage=new Map<string,string>();
    const edited=defaultEditorSettings();
    edited.trimStart=5; edited.trimEnd=25; edited.captionModel=0;
    storage.set("cnp.workspace.v1.p",JSON.stringify({version:2,media:null,transcript:[],transcriptMode:"empty",settings:defaultEditorSettings(),tool:"editor",clipEdits:{[entry.clip.id]:edited}}));
    vi.stubGlobal("localStorage",{getItem:(k:string)=>storage.get(k) ?? null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)});
    const html=renderToStaticMarkup(<ClipInspection entry={entry} onClose={()=>undefined} onEdit={()=>undefined}/>);
    // seek e controles respeitam 5–25 (intervalo editado), não 0–30 (clip)
    expect(html).toContain('min="5"');
    expect(html).toContain('max="25"');
    expect(html).toContain("· 20 s");
    expect(html).not.toContain("· 30 s");
    vi.unstubAllGlobals();
  });
  it("sem edição salva, os limites originais do clipe valem",()=>{
    vi.stubGlobal("localStorage",{getItem:()=>null});
    const html=renderToStaticMarkup(<ClipInspection entry={entry} onClose={()=>undefined} onEdit={()=>undefined}/>);
    expect(html).toContain('min="0"');
    expect(html).toContain('max="30"');
    expect(html).toContain("· 30 s");
    vi.unstubAllGlobals();
  });
});
