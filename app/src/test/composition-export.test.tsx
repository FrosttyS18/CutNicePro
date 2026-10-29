import { act, useLayoutEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listen, type EventCallback } from "@tauri-apps/api/event";
import { useCompositionExport } from "../hooks/useCompositionExport";
import { exportEditorDocument } from "../lib/ipc";
import { cancelClips, getClipJob, type ClipJob } from "../lib/clips";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";

vi.mock("../lib/ipc",()=>({exportEditorDocument:vi.fn()}));
vi.mock("@tauri-apps/api/event",()=>({listen:vi.fn()}));
vi.mock("../lib/clips",async importOriginal=>({...await importOriginal<typeof import("../lib/clips")>(),cancelClips:vi.fn(),getClipJob:vi.fn()}));

const receipt = { id: "d7529093-d489-4ee7-b44c-1828d6763142", path: "C:/exports/teste.mp4", bytes: 100, reused: false };
let mounted:Awaited<ReturnType<typeof reactHost>>|undefined;
let receiver:EventCallback<unknown>|undefined;
let hook:ReturnType<typeof useCompositionExport>;
const off=vi.fn();
function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(reason:unknown)=>void;const promise=new Promise<T>((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};}
function fixture(){const workspace=emptyWorkspace();workspace.media={kind:"local",mediaId:"source",name:"source.mp4",duration:10,width:1920,height:1080,videoId:null,url:null};return compositionFromLegacy(workspace);}
function Probe({projectId="project"}:{projectId?:string}){const current=useCompositionExport(projectId);useLayoutEffect(()=>{hook=current;},[current]);return null;}
function event(value:Partial<ClipJob>={}){const calls=vi.mocked(exportEditorDocument).mock.calls;return {jobId:calls[calls.length-1]?.[2]??"missing",projectId:"project",state:"running",stage:"rendering",operation:"export",progress:20,error:null,...value};}
function emit(payload:unknown){receiver?.({event:"clips://job",id:0,payload});}
beforeEach(()=>{
  vi.clearAllMocks();receiver=undefined;
  vi.mocked(listen).mockImplementation(async(_name,callback)=>{receiver=callback;return off;});
  vi.mocked(getClipJob).mockResolvedValue(null);
  vi.mocked(cancelClips).mockResolvedValue(true);
});
afterEach(async()=>{await mounted?.close();mounted=undefined;});

describe("exportação de uma revisão da montagem",()=>{
  it.each([[receipt,"completed"],[null,"dialog-cancelled"]] as const)("retorno nativo %s produz %s",async(value,status)=>{
    vi.mocked(exportEditorDocument).mockResolvedValue(value);
    mounted=await reactHost(<Probe/>);
    await act(async()=>{expect(await hook.exportDocument(fixture(),null)).toEqual({status});});
    expect(hook.busy).toBe(false);expect(hook.error).toBeNull();expect(off).toHaveBeenCalledOnce();
    if(value)expect(hook.job?.state).toBe("completed");
    else expect(hook.job?.state).not.toBe("completed");
  });
  it("clona antes de aguardar o listener e bloqueia duas exportações rápidas",async()=>{
    const subscribed=deferred<()=>void>();vi.mocked(listen).mockReturnValueOnce(subscribed.promise);
    vi.mocked(exportEditorDocument).mockResolvedValue(receipt);
    const request = { fileName: "Um", directory: null, options: { resolution: "original" as const, quality: "high" as const } };
    const document=fixture();mounted=await reactHost(<Probe/>);
    let pending:ReturnType<typeof hook.exportDocument>;
    await act(async()=>{pending=hook.exportDocument(document,"clip",request);expect(await hook.exportDocument(document,"clip")).toEqual({status:"blocked"});});
    document.items[0].durationFrames=1; request.fileName="Outro";
    expect(exportEditorDocument).not.toHaveBeenCalled();expect(hook.busy).toBe(true);
    await act(async()=>{subscribed.resolve(off);expect(await pending).toEqual({status:"completed"});});
    expect(exportEditorDocument).toHaveBeenCalledOnce();
    const [projectId,clipId,,snapshot]=vi.mocked(exportEditorDocument).mock.calls[0];
    expect(vi.mocked(exportEditorDocument).mock.calls[0][4]?.fileName).toBe("Um");
    expect(projectId).toBe("project");expect(clipId).toBe("clip");expect(snapshot.items[0].durationFrames).toBe(300);
  });
  it("ignora jobs alheios e reconhece cancelamento real do próprio job",async()=>{
    const native=deferred<typeof receipt | null>();vi.mocked(exportEditorDocument).mockReturnValueOnce(native.promise);
    mounted=await reactHost(<Probe/>);let pending:ReturnType<typeof hook.exportDocument>;
    await act(async()=>{pending=hook.exportDocument(fixture(),null);});
    await act(async()=>{emit(event({jobId:"foreign",progress:90}));emit(event({projectId:"other",progress:80}));emit({jobId:hook.job?.jobId,progress:999});});
    expect(hook.job?.progress).toBe(0);
    await act(async()=>{emit(event({progress:42}));});expect(hook.job?.progress).toBe(42);
    await act(async()=>{expect(await hook.cancel()).toBe(true);});
    expect(cancelClips).toHaveBeenCalledWith(hook.job?.jobId);
    await act(async()=>{emit(event({state:"cancelled",progress:42}));emit(event({progress:90}));native.reject("cancelado");expect(await pending).toEqual({status:"cancelled"});});
    expect(hook.error).toBeNull();expect(hook.busy).toBe(false);
    expect(hook.job?.progress).toBe(42);
  });
  it("recupera estado cancelado sem evento e apresenta falha com mensagem existente",async()=>{
    vi.mocked(exportEditorDocument).mockImplementationOnce(async()=>{vi.mocked(getClipJob).mockResolvedValue(event({state:"cancelled"}));throw "cancelado";});
    mounted=await reactHost(<Probe/>);
    await act(async()=>{expect(await hook.exportDocument(fixture(),null)).toEqual({status:"cancelled"});});
    vi.mocked(getClipJob).mockResolvedValue(null);vi.mocked(exportEditorDocument).mockRejectedValueOnce("disk full");
    await act(async()=>{expect(await hook.exportDocument(fixture(),null)).toEqual({status:"failed",error:"Não há espaço suficiente para concluir. Libere espaço no disco e tente novamente."});});
    expect(hook.error).toContain("espaço");expect(hook.job?.state).toBe("failed");
  });
  it("troca de projeto ignora retorno antigo sem liberar o novo bloqueio",async()=>{
    const old=deferred<typeof receipt | null>();const next=deferred<typeof receipt | null>();vi.mocked(exportEditorDocument).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    mounted=await reactHost(<Probe/>);let previous:ReturnType<typeof hook.exportDocument>;let current:ReturnType<typeof hook.exportDocument>;
    await act(async()=>{previous=hook.exportDocument(fixture(),null);});
    const oldReceiver=receiver;
    await mounted.render(<Probe projectId="next"/>);
    await act(async()=>{current=hook.exportDocument(fixture(),null);});
    await act(async()=>{oldReceiver?.({event:"clips://job",id:0,payload:event({projectId:"project",state:"failed",error:"antigo"})});old.resolve(receipt);expect(await previous).toEqual({status:"abandoned"});});
    expect(hook.busy).toBe(true);expect(hook.error).toBeNull();
    await act(async()=>{expect(await hook.exportDocument(fixture(),null)).toEqual({status:"blocked"});next.resolve(receipt);expect(await current).toEqual({status:"completed"});});
    expect(cancelClips).not.toHaveBeenCalled();
  });
  it("desmontar retira listener sem cancelar job nativo e ignora conclusão tardia",async()=>{
    const native=deferred<typeof receipt | null>();vi.mocked(exportEditorDocument).mockReturnValueOnce(native.promise);
    mounted=await reactHost(<Probe/>);let pending:ReturnType<typeof hook.exportDocument>;
    await act(async()=>{pending=hook.exportDocument(fixture(),null);});
    await mounted.close();mounted=undefined;expect(off).toHaveBeenCalledOnce();expect(cancelClips).not.toHaveBeenCalled();
    native.resolve(receipt);expect(await pending!).toEqual({status:"abandoned"});
  });
  it("remove listener resolvido após desmontagem sem iniciar exportação",async()=>{
    const subscribed=deferred<()=>void>();vi.mocked(listen).mockReturnValueOnce(subscribed.promise);
    mounted=await reactHost(<Probe/>);let pending:ReturnType<typeof hook.exportDocument>;
    await act(async()=>{pending=hook.exportDocument(fixture(),null);});
    await mounted.close();mounted=undefined;subscribed.resolve(off);
    expect(await pending!).toEqual({status:"abandoned"});expect(off).toHaveBeenCalledOnce();expect(exportEditorDocument).not.toHaveBeenCalled();
  });
  it("cancelar antes do registro impede o início nativo",async()=>{
    const subscribed=deferred<()=>void>();vi.mocked(listen).mockReturnValueOnce(subscribed.promise);
    mounted=await reactHost(<Probe/>);let pending:ReturnType<typeof hook.exportDocument>;
    await act(async()=>{pending=hook.exportDocument(fixture(),null);expect(await hook.cancel()).toBe(true);});
    await act(async()=>{subscribed.resolve(off);expect(await pending).toEqual({status:"cancelled"});});
    expect(exportEditorDocument).not.toHaveBeenCalled();expect(cancelClips).not.toHaveBeenCalled();expect(hook.busy).toBe(false);
  });
  it("falha ao registrar eventos não inicia o nativo nem retém bloqueio",async()=>{
    vi.mocked(listen).mockRejectedValueOnce("listener indisponível");mounted=await reactHost(<Probe/>);
    await act(async()=>{expect((await hook.exportDocument(fixture(),null)).status).toBe("failed");});
    expect(exportEditorDocument).not.toHaveBeenCalled();expect(hook.busy).toBe(false);expect(hook.error).toBeTruthy();
  });
});
