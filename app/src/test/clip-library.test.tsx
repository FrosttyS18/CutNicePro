import { afterEach,describe,expect,it,vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { visibleClips, type LibraryClip } from "../lib/clip-library";
import { ClipGallery } from "../components/clips/ClipGallery";
import { AppSelect } from "../components/AppSelect";
import { ColorControl } from "../components/ColorControl";
import { installInputModality } from "../lib/input-modality";
import { parseEngineStatus,transcribeProject } from "../lib/transcription";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({ invoke:vi.fn() }));
afterEach(() => { vi.unstubAllGlobals();vi.clearAllMocks(); });
const entries: LibraryClip[] = ["Davy Jones","Outro projeto"].map((name,index) => ({project:{id:`p${index}`,name,created_at_ms:0,updated_at_ms:0,last_opened_at_ms:null},mediaId:`m${index}`,
  clip:{id:String(index).repeat(64),start:index*10,end:60,title:index ? "Problemas na atualização" : "O jogo perdeu o progresso",score:index ? 90 : 83,reasons:["Final com frase concluída"],review:index ? "approved" : "pending"}}));
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
