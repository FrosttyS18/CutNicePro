import { afterEach,describe,expect,it,vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { loadClipLibrary } from "../services/clip-library";
import { loadClipMedia,prepareClipEditing } from "../services/clip-media";
import { readWorkspace } from "../services/workspace-store";
import type { Clip } from "../lib/clips";
import { nativeMediaFixture } from "./fixtures/native-media-entry";

vi.mock("@tauri-apps/api/core",()=>({invoke:vi.fn()}));
afterEach(()=>{vi.clearAllMocks();vi.unstubAllGlobals();});
const clip: Clip = {id:"a".repeat(64),start:2,end:8,title:"Assunto do corte",score:80,reasons:[],review:"pending"};
const entry = {...nativeMediaFixture.referenceAvailable,mediaId:"m",originalName:"Vídeo.mp4",projectIds:["p"],analysis:{...nativeMediaFixture.referenceAvailable.analysis,durationMs:10000,width:640,height:360}};
describe("biblioteca persistente e mídia do corte",()=>{
  it("lista todos os projetos sem depender de preferência ou mídia ativa do navegador",async()=>{
    vi.stubGlobal("localStorage",{getItem:()=>{throw new Error("must not read workspace");}});
    vi.mocked(invoke).mockImplementation(async(command,args)=>command==="cleanup_clip_trash"?0:command === "load_editor_project" ? { version: 1, project: null, clips: {} } : ({version:1,mediaId:(args as {projectId:string}).projectId+"-media",transcriptHash:"hash",clips:[clip]}));
    const projects=["p","q"].map(id=>({id,name:id,created_at_ms:0,updated_at_ms:0,last_opened_at_ms:null}));
    const { entries: result, failed }=await loadClipLibrary(projects);
    expect(result.map(value=>[value.project.id,value.mediaId])).toEqual([["p","p-media"],["q","q-media"]]);
    expect(failed).toEqual([]);
    expect(invoke).toHaveBeenNthCalledWith(1,"cleanup_clip_trash",{projectId:"p"});
    expect(invoke).toHaveBeenCalledWith("get_project_clips",{projectId:"p"});
    expect(invoke).toHaveBeenCalledWith("get_project_clips",{projectId:"q"});
    expect(invoke).toHaveBeenCalledWith("load_editor_project",{projectId:"p"});
    expect(invoke).toHaveBeenCalledWith("load_editor_project",{projectId:"q"});
  });
  it("recupera fonte e transcrição e abre edição sem preferências anteriores",async()=>{
    const values=new Map<string,string>();vi.stubGlobal("localStorage",{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});
    vi.mocked(invoke).mockImplementation(async command=>command==="get_media" ? entry : {version:1,mediaId:"m",language:"pt",model:"tested",segments:[{id:"s",start:2,end:4,text:"Uma fala real",words:[{text:"Uma",start:2,end:2.2},{text:"fala",start:2.2,end:3},{text:"real",start:3,end:4}]}]});
    const source=await loadClipMedia("p","m");expect(source.url).toBe(`http://cnplocal.localhost/media/${entry.mediaId}.${entry.ext}`);expect(source.transcript[0].words?.[2].start).toBe(3);
    await prepareClipEditing("p","m",clip);const saved=readWorkspace("p");
    expect(saved.media?.mediaId).toBe("m");expect(saved.activeClipId).toBe(clip.id);expect(saved.settings.trimStart).toBe(2);expect(saved.transcriptMode).toBe("real");
  });
  it("recusa fonte de outro projeto e isola falha por projeto na biblioteca",async()=>{
    vi.mocked(invoke).mockImplementation(async command=>command==="get_media" ? {...entry,projectIds:["other"]} : null);
    await expect(loadClipMedia("p","m")).rejects.toThrow("indisponível");
    // um projeto falha, o outro continua visível; falha é informada, não oculta
    const good = {version:1,mediaId:"q-media",transcriptHash:"hash",clips:[clip]};
    vi.mocked(invoke).mockImplementation(async(command,args)=>{
      const {projectId} = args as {projectId:string};
      if (projectId === "p") throw new Error("read failure");
      if (command === "cleanup_clip_trash") return 0;
      return command === "load_editor_project" ? { version: 1, project: null, clips: {} } : good;
    });
    const projects=["p","q"].map(id=>({id,name:id,created_at_ms:0,updated_at_ms:0,last_opened_at_ms:null}));
    const { entries, failed } = await loadClipLibrary(projects);
    expect(entries.map(value=>value.project.id)).toEqual(["q"]);
    expect(failed.map(value=>value.id)).toEqual(["p"]);
    // falha TOTAL de todos os projetos continua sendo erro explícito
    vi.mocked(invoke).mockRejectedValue(new Error("read failure"));
    await expect(loadClipLibrary([{id:"p",name:"p",created_at_ms:0,updated_at_ms:0,last_opened_at_ms:null}])).rejects.toThrow();
    await expect(prepareClipEditing("p","m",clip)).rejects.toThrow("Reconecte".toLowerCase());
  });
});
