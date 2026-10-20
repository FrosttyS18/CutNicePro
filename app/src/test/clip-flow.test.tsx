import { afterEach,describe,expect,it,vi } from "vitest";
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
  it("rejeita, informa e fecha somente depois de persistir",async()=>{
    reads();const close=vi.fn(),changed=vi.fn();
    vi.mocked(invoke).mockImplementation(async command=>command==="get_clips" ? collection : command==="review_clip" ? {...collection,clips:[{...entry.clip,review:"rejected"}]} : null);
    mounted=await reactHost(<ClipInspection entry={entry} onClose={close} onChanged={changed} onEdit={()=>undefined}/>);
    await mounted.click("Rejeitar");
    expect(invoke).toHaveBeenCalledWith("review_clip",{projectId:"p",mediaId:"m",clipId:entry.clip.id,review:"rejected"});
    expect(changed).toHaveBeenCalledWith("Clipe rejeitado.");expect(close).toHaveBeenCalledOnce();
  });
  it("mantém inspeção aberta e mostra falha quando rejeição não é salva",async()=>{
    reads();const close=vi.fn(),changed=vi.fn();
    vi.mocked(invoke).mockImplementation(async command=>{if(command==="review_clip")throw new Error("disk failure");return command==="get_clips"?collection:null;});
    mounted=await reactHost(<ClipInspection entry={entry} onClose={close} onChanged={changed} onEdit={()=>undefined}/>);
    await mounted.click("Rejeitar");expect(close).not.toHaveBeenCalled();expect(changed).not.toHaveBeenCalled();
    expect(mounted.host.querySelector('[role="alert"]')).not.toBeNull();
  });
  it("rejeitados saem da lista ativa e continuam consultáveis",()=>{
    const entries=[entry,{...entry,clip:{...entry.clip,id:"b".repeat(64),review:"rejected" as const}}];
    expect(visibleClips(entries,"active","score")).toEqual([entry]);expect(visibleClips(entries,"rejected","score")).toHaveLength(1);
  });
  it.each([
    {name:"análise de outra instância não abre modal de geração",operation:"analyze" as const,state:"running" as const,visible:false},
    {name:"geração em andamento é restaurada ao voltar ao projeto",operation:"generate" as const,state:"running" as const,visible:true},
    {name:"falha antiga não reaparece ao abrir cortes salvos",operation:"generate" as const,state:"failed" as const,visible:false},
  ])("$name",async({operation,state,visible})=>{
    const controller={collection:null,job:{jobId:"j",projectId:"p",state,stage:"analyzing" as const,progress:0,error:null},operation,
      ownedJob:false,busy:state === "running",loading:false,error:null,notice:null,generate:vi.fn(),analyze:vi.fn(),exportVideo:vi.fn(),review:vi.fn(async()=>true),cancel:vi.fn(async()=>true),reload:vi.fn()};
    mounted=await reactHost(<ClipTools controller={controller} settings={defaultEditorSettings()} ready disabled={false} onSave={async()=>true} onShowClips={()=>undefined} onFullVideo={()=>undefined}/>);
    expect(Boolean(mounted.host.querySelector("dialog[open]"))).toBe(visible);
  });
});

describe("modo experimental de qualidade (Gemma 4)",()=>{
  function controller(collection:import("../lib/clips").ClipCollection|null){
    return {collection,job:null,operation:undefined as never,ownedJob:false,busy:false,loading:false,error:null,notice:null,
      generate:vi.fn(async()=>{}),analyze:vi.fn(async()=>{}),exportVideo:vi.fn(async()=>{}),review:vi.fn(async()=>true),cancel:vi.fn(async()=>true),reload:vi.fn()};
  }
  async function openDialog(controller2:ReturnType<typeof controller>){
    mounted=await reactHost(<ClipTools controller={controller2} settings={defaultEditorSettings()} ready disabled={false} onSave={async()=>true} onShowClips={()=>undefined} onFullVideo={()=>undefined}/>);
    await mounted.click(controller2.collection ? "Atualizar cortes" : "Gerar cortes");
    return mounted;
  }
  it("automática (padrão) não envia duração nem quantidade; personalizada envia com mínima técnica",async()=>{
    const existing:import("../lib/clips").ClipCollection={version:1,mediaId:"m",transcriptHash:"h",clips:[entry.clip]};
    // padrão do diálogo = AUTOMÁTICA: nenhum valor fixo escondido
    const c=controller(existing);
    await openDialog(c);
    await mounted!.click("Gerar cortes");
    expect(c.generate).toHaveBeenCalledWith({automatic:true,format:"9:16"});
    // personalizada: duração/quantidade explícitas; mínima técnica (10), sem vínculo com a máxima
    const c2=controller(existing);
    await openDialog(c2);
    await mounted!.chooseOption("Geração","Personalizada");
    await mounted!.click("Gerar cortes");
    expect(c2.generate).toHaveBeenCalledWith({minSeconds:10,maxSeconds:60,count:3,format:"9:16"});
    // experimental soma quality em qualquer modo
    const c3=controller(existing);
    await openDialog(c3);
    await mounted!.chooseOption("Análise","Experimental (Gemma 4)");
    await mounted!.click("Gerar cortes");
    expect(c3.generate).toHaveBeenCalledWith({automatic:true,format:"9:16",quality:"experimentalGemma"});
  });
  it("coleção experimental é identificada na lista de cortes",async()=>{
    const c=controller({version:1,mediaId:"m",transcriptHash:"h",clips:[entry.clip],engine:{backend:"experimentalGemma",model:"gemma-4-12b-it-qat-q4_0.gguf",template:"gemma4-canonical-nothink",sampling:"temp 1.0, top_k 64, top_p 0.95, min_p 0, seed 42",seed:42}});
    mounted=await reactHost(<ClipTools controller={c} settings={defaultEditorSettings()} ready disabled={false} onSave={async()=>true} onShowClips={()=>undefined} onFullVideo={()=>undefined}/>);
    expect(mounted.host.textContent).toContain("experimental");
  });
});
