import { afterEach,describe,expect,it,vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { visibleClips, type LibraryClip } from "../lib/clip-library";
import { ClipGallery } from "../components/clips/ClipGallery";
import { AppSelect } from "../components/AppSelect";
import { ColorControl } from "../components/ColorControl";
import { installInputModality } from "../lib/input-modality";
import { parseEngineStatus,transcribeProject } from "../lib/transcription";
import { parseClips } from "../lib/clips";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({ invoke:vi.fn() }));
afterEach(() => { vi.unstubAllGlobals();vi.clearAllMocks(); });
const analysis={title:"Título do acontecimento",summary:"S".repeat(45),criteria:[{label:"Gancho",score:1,explanation:"explicação suficiente do critério",evidence:"evidência com três palavras"},{label:"Desenvolvimento",score:1,explanation:"explicação suficiente do critério",evidence:"evidência com três palavras"},{label:"Fechamento",score:1,explanation:"explicação suficiente do critério",evidence:"evidência com três palavras"}]};
const entries: LibraryClip[] = ["Davy Jones","Outro projeto"].map((name,index) => ({project:{id:`p${index}`,name,created_at_ms:0,updated_at_ms:0,last_opened_at_ms:null},mediaId:`m${index}`,
  clip:{id:String(index).repeat(64),start:index*10,end:60,title:index ? "Problemas na atualização" : "O jogo perdeu o progresso",score:index ? 90 : 83,reasons:["Final com frase concluída"],review:index ? "approved" : "pending",analysis}}));
describe("biblioteca de clipes e controles compartilhados", () => {
  it("combina projetos e filtra sem alterar os dados originais", () => {
    expect(visibleClips(entries,"all","score").map(item => item.project.name)).toEqual(["Outro projeto","Davy Jones"]);
    expect(visibleClips(entries,"approved","score").map(item => item.project.id)).toEqual(["p1"]);
    expect(visibleClips(entries,"all","duration")[0].project.id).toBe("p1");
    expect(entries[0].project.id).toBe("p0");
  });
  it("mostra prévia, título, duração, projeto e nota estimada na galeria existente", () => {
    vi.stubGlobal("localStorage",{getItem:()=>null});
    const html = renderToStaticMarkup(<ClipGallery entries={entries} showProject onInspect={()=>{}}/>);
    expect(html).toContain("Davy Jones"); expect(html).toContain("Outro projeto"); expect(html).toContain("60 s");
    expect(html).toContain("O jogo perdeu o progresso"); expect(html).toContain("Nota estimada: 83 de 100"); expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain("Tendência"); expect(html).not.toContain("<select");
  });
  it("separa erro e carregamento do estado vazio", () => {
    expect(renderToStaticMarkup(<ClipGallery entries={[]} loading onInspect={()=>{}}/>)).toContain("Carregando clipes");
    const error = renderToStaticMarkup(<ClipGallery entries={[]} error="Falhou" onInspect={()=>{}} onRetry={()=>{}}/>);
    expect(error).toContain('role="alert"'); expect(error).not.toContain("Nenhum clipe ainda");
  });
  it("usa lista e cores personalizadas sem abrir seletores do navegador", () => {
    const html = renderToStaticMarkup(<AppSelect value="large" aria-label="Opção" onChange={()=>{}}><option value="turbo">Rápido</option><option value="large">Completo</option></AppSelect>);
    expect(html).toContain('role="listbox"');expect(html).toContain('aria-selected="true"');expect(html).not.toContain("<select");
    const color = renderToStaticMarkup(<ColorControl value="#ffffff" onChange={()=>{}}/>);
    expect(color).not.toContain('type="color"');expect(color).toContain('type="text"');
  });
  it("ativa foco de navegação por teclado e remove ao usar ponteiro", () => {
    const target = new EventTarget() as EventTarget & {documentElement:{dataset:Record<string,string>}};
    target.documentElement={dataset:{}};
    const cleanup = installInputModality(target as unknown as Document);
    expect(target.documentElement.dataset.inputModality).toBe("pointer");
    const key = new Event("keydown");Object.assign(key,{key:"Tab",ctrlKey:false,altKey:false,metaKey:false});target.dispatchEvent(key);
    expect(target.documentElement.dataset.inputModality).toBe("keyboard");target.dispatchEvent(new Event("pointerdown"));
    expect(target.documentElement.dataset.inputModality).toBe("pointer");cleanup();target.dispatchEvent(key);
    expect(target.documentElement.dataset.inputModality).toBe("pointer");
  });
  it("envia somente a opção escolhida e valida as opções recebidas", async () => {
    vi.mocked(invoke).mockResolvedValue({version:1,mediaId:"m",language:"pt",model:"whisper-large-v3",segments:[]});
    await transcribeProject("p","m","j","large");
    expect(invoke).toHaveBeenCalledTimes(1);expect(invoke).toHaveBeenCalledWith("transcribe_project",{projectId:"p",mediaId:"m",jobId:"j",profile:"large"});
    expect(() => parseEngineStatus({available:true,model:"m",error:null,profiles:[{id:"invalid",available:true}]})).toThrow();
  });
});

describe("biblioteca cumulativa e ações diretas nos cards (atualização 19)",()=>{
  const clip=(id:string,extra:Partial<LibraryClip["clip"]> = {})=>({id:id.length >= 64 ? id : id.repeat(64),start:0,end:30,title:"Trecho",score:80,reasons:[],review:"pending" as const,...extra});
  it("aceita coleção com mais de 12 clipes e campos novos (assinatura, exclusão, motor)",()=>{
    const clips=Array.from({length:15},(_,index)=>clip(String(index).padStart(64,"0"),{deleted:index===1?true:undefined,analysisSignature:index===2?"x".repeat(64):undefined,engine:index===3?{backend:"standard",model:"m",template:"t",sampling:"s",seed:42}:undefined}));
    const parsed=parseClips({version:1,mediaId:"m",transcriptHash:"h",clips});
    expect(parsed.clips).toHaveLength(15);
  });
  it("rejeita tipo inválido em campo novo",()=>{
    expect(()=>parseClips({version:1,mediaId:"m",transcriptHash:"h",clips:[clip("a",{deleted:"sim" as unknown as boolean})]})).toThrow();
  });
  it("cards ativos exibem Editar, Baixar e Excluir; Desfazer aparece no aviso",()=>{
    vi.stubGlobal("localStorage",{getItem:()=>null});
    const active:LibraryClip={...entries[0],clip:clip("a")};
    const html=renderToStaticMarkup(<ClipGallery entries={[active]} showProject onInspect={()=>{}} onRetry={()=>{}}
      notice="Clipe excluído." onEdit={()=>{}} onDownload={()=>{}} onDelete={()=>{}} onRestore={()=>{}} undoDelete={{onUndo:()=>{}}}/>);
    expect(html).toContain(">Editar<");
    expect(html).toContain(">Baixar<");
    expect(html).toContain(">Excluir<");
    expect(html).toContain("Desfazer");
    // sem handlers, os cards seguem apenas com a prévia (comportamento anterior)
    const plain=renderToStaticMarkup(<ClipGallery entries={[active]} onInspect={()=>{}}/>);
    expect(plain).not.toContain(">Editar<");
  });
  it("filtro Excluídos mostra o card com Restaurar e o esconde dos Ativos",()=>{
    expect(visibleClips([{...entries[0],clip:clip("b",{deleted:true})}],"active","score")).toHaveLength(0);
    expect(visibleClips([{...entries[0],clip:clip("b",{deleted:true})}],"deleted","score")).toHaveLength(1);
  });
  it("nota antiga NÃO é publicada como avaliação concluída (upd 20)",()=>{
    vi.stubGlobal("localStorage",{getItem:()=>null});
    const analysis={title:"T",summary:"S",criteria:[{label:"Gancho",score:1,explanation:"a",evidence:"e e e"},{label:"Desenvolvimento",score:1,explanation:"a",evidence:"e e e"},{label:"Fechamento",score:1,explanation:"a",evidence:"e e e"}]};
    const stale:LibraryClip={...entries[0],clip:clip("a",{analysis,analysisStale:true})};
    const valid:LibraryClip={...entries[0],clip:clip("b",{analysis,score:90})};
    const failed:LibraryClip={...entries[0],clip:clip("c",{analysisError:"sem análise"})};
    const absent:LibraryClip={...entries[0],clip:clip("d")};
    const html=renderToStaticMarkup(<ClipGallery entries={[stale,failed,absent]} onInspect={()=>{}}/>);
    expect(html).toContain("Análise desatualizada");
    expect(html).toContain("Análise pendente");
    expect(html).toContain("Sem análise");
    expect(html).not.toContain("Nota estimada");
    // a nota numérica só aparece com análise válida
    const validHtml=renderToStaticMarkup(<ClipGallery entries={[valid]} onInspect={()=>{}}/>);
    expect(validHtml).toContain("Nota estimada: 90 de 100");
    // ordenação por nota: válida antes de desatualizada/ausente
    const ordered=visibleClips([stale,valid,absent],"all","score");
    expect(ordered[0]).toBe(valid);
  });
  it("parseClips aceita analysisStale booleano e rejeita tipo errado",()=>{
    const analysis={title:"Título válido aqui",summary:"S".repeat(45),criteria:[{label:"Gancho",score:1,explanation:"explicação suficiente do critério",evidence:"evidência com três palavras"},{label:"Desenvolvimento",score:1,explanation:"explicação suficiente do critério",evidence:"evidência com três palavras"},{label:"Fechamento",score:1,explanation:"explicação suficiente do critério",evidence:"evidência com três palavras"}]};
    expect(parseClips({version:1,mediaId:"m",transcriptHash:"h",clips:[clip("a",{analysis,analysisStale:true})]}).clips[0].analysisStale).toBe(true);
    expect(()=>parseClips({version:1,mediaId:"m",transcriptHash:"h",clips:[clip("a",{analysisStale:"sim" as unknown as boolean})]})).toThrow();
  });
});
