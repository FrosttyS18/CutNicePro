import { act,useLayoutEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCompositionImport } from "../hooks/useCompositionImport";
import { open } from "@tauri-apps/plugin-dialog";
import { reactHost } from "./react-host";
vi.mock("@tauri-apps/plugin-dialog",()=>({open:vi.fn(async()=>"C:/fixtures/image.png")}));
vi.mock("../lib/ipc",()=>({importMedia:vi.fn()}));
const ipc=await import("../lib/ipc");
let mounted:Awaited<ReturnType<typeof reactHost>>|undefined;
afterEach(async()=>{await mounted?.close();mounted=undefined;vi.clearAllMocks();});
const entry={mediaId:"asset",sha256:"asset",ext:"png",originalName:"image.png",createdAtMs:1,projectIds:["project"],sizeBytes:10,unavailable:false,analysis:{durationMs:0,width:640,height:480,hasAudio:false,videoCodec:"png",audioCodec:null,fps:0}};
describe("importação de mídias no editor",()=>{
  it("recebe imagem gerenciada e insere somente após análise válida",async()=>{
    const complete=vi.fn();const error=vi.fn();let importer:ReturnType<typeof useCompositionImport>;
    vi.mocked(ipc.importMedia).mockResolvedValue({entry,analysisError:null});
    function Probe(){importer=useCompositionImport("project",complete,error);return null;}
    mounted=await reactHost(<Probe/>);
    await act(async()=>{await importer.pick("image",true);});
    expect(ipc.importMedia).toHaveBeenCalledWith("project","C:/fixtures/image.png",expect.any(Function),expect.any(AbortSignal),"image");
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({kind:"image",mediaId:"asset",durationUs:0,width:640}),true,"cursor");
    expect(error).not.toHaveBeenCalled();
  });
  it("falha de análise não cria um item parcial nem altera a montagem",async()=>{
    const complete=vi.fn();const error=vi.fn();let importer:ReturnType<typeof useCompositionImport>;
    vi.mocked(ipc.importMedia).mockResolvedValue({entry:{...entry,analysis:null},analysisError:"Arquivo danificado"});
    function Probe(){importer=useCompositionImport("project",complete,error);return null;}
    mounted=await reactHost(<Probe/>);
    await act(async()=>{await importer.pick("image");});
    expect(complete).not.toHaveBeenCalled();expect(error).toHaveBeenCalledWith("Arquivo danificado");expect(importer!.busy).toBe(false);
  });
  it("aceita commit nativo confirmado quando cancelar chegou depois da gravação",async()=>{
    const complete=vi.fn();const error=vi.fn();let importer!:ReturnType<typeof useCompositionImport>;
    let finish!:(value:Awaited<ReturnType<typeof ipc.importMedia>>)=>void;
    vi.mocked(ipc.importMedia).mockReturnValue(new Promise(resolve=>{finish=resolve;}));
    function Probe(){importer=useCompositionImport("project",complete,error);return null;}
    mounted=await reactHost(<Probe/>);
    let pending!:Promise<void>;
    await act(async()=>{pending=importer.pick("image",true,"end");});
    await act(async()=>{importer.cancel();});
    expect(vi.mocked(ipc.importMedia).mock.lastCall![3]!.aborted).toBe(true);
    await act(async()=>{finish({entry,analysisError:null});await pending;});
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({mediaId:"asset"}),true,"end");
    expect(error).not.toHaveBeenCalled();expect(importer.busy).toBe(false);
  });
  it("desmontar cancela a operação e ignora commit tardio sem inserir mídia",async()=>{
    const complete=vi.fn();const error=vi.fn();let importer!:ReturnType<typeof useCompositionImport>;
    let finish!:(value:Awaited<ReturnType<typeof ipc.importMedia>>)=>void;
    vi.mocked(ipc.importMedia).mockReturnValue(new Promise(resolve=>{finish=resolve;}));
    function Probe(){importer=useCompositionImport("project",complete,error);return null;}
    mounted=await reactHost(<Probe/>);
    let pending!:Promise<void>;
    await act(async()=>{pending=importer.pick("image");});
    const signal=vi.mocked(ipc.importMedia).mock.lastCall![3]!;
    await mounted.close();mounted=undefined;
    expect(signal.aborted).toBe(true);
    await act(async()=>{finish({entry,analysisError:null});await pending;});
    expect(complete).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled();
  });
  it("captura o destino da operação pendente e ignora uma segunda escolha concorrente",async()=>{
    const complete=vi.fn();let importer!:ReturnType<typeof useCompositionImport>;
    let finish!:(value:Awaited<ReturnType<typeof ipc.importMedia>>)=>void;
    vi.mocked(ipc.importMedia).mockReturnValue(new Promise(resolve=>{finish=resolve;}));
    function Probe(){importer=useCompositionImport("project",complete,vi.fn());return null;}
    mounted=await reactHost(<Probe/>);
    let pending!:Promise<void>;
    await act(async()=>{pending=importer.pick("image",true,"start");});
    await act(async()=>{await importer.pick("image",false,"end");});
    await act(async()=>{finish({entry,analysisError:null});await pending;});
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({mediaId:"asset"}),true,"start");
    expect(ipc.importMedia).toHaveBeenCalledTimes(1);
  });
  it("cancelar o seletor não deixa destino para a próxima importação no cursor",async()=>{
    const complete=vi.fn();let importer!:ReturnType<typeof useCompositionImport>;
    vi.mocked(open).mockResolvedValueOnce(null);
    vi.mocked(ipc.importMedia).mockResolvedValue({entry,analysisError:null});
    function Probe(){importer=useCompositionImport("project",complete,vi.fn());return null;}
    mounted=await reactHost(<Probe/>);
    await act(async()=>{await importer.pick("image",false,"end");});
    expect(complete).not.toHaveBeenCalled();
    await act(async()=>{await importer.pick("image");});
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({mediaId:"asset"}),false,"cursor");
  });
  it("trocar projeto descarta conclusão antiga e preserva o destino do novo projeto",async()=>{
    const complete=vi.fn();let importer!:ReturnType<typeof useCompositionImport>;
    let finish!:(value:Awaited<ReturnType<typeof ipc.importMedia>>)=>void;
    vi.mocked(ipc.importMedia).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;})).mockResolvedValue({entry,analysisError:null});
    function Probe({project}:{project:string}){importer=useCompositionImport(project,complete,vi.fn());return null;}
    mounted=await reactHost(<Probe project="first"/>);
    let pending!:Promise<void>;
    await act(async()=>{pending=importer.pick("image",false,"start");});
    const signal=vi.mocked(ipc.importMedia).mock.lastCall![3]!;
    await mounted.render(<Probe project="second"/>);
    expect(signal.aborted).toBe(true);
    await act(async()=>{await importer.pick("image",false,"end");});
    await act(async()=>{finish({entry,analysisError:null});await pending;});
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({mediaId:"asset"}),false,"end");
    expect(importer.busy).toBe(false);
  });
  it("importa da biblioteca com filtro único sem inserir ou escolher camada",async()=>{
    const complete=vi.fn(),imported=vi.fn();let importer!:ReturnType<typeof useCompositionImport>;
    vi.mocked(ipc.importMedia).mockResolvedValue({entry,analysisError:null});
    function Probe(){importer=useCompositionImport("project",complete,vi.fn(),imported);return null;}
    mounted=await reactHost(<Probe/>);
    await act(async()=>{await importer.pickLibrary();});
    expect(complete).not.toHaveBeenCalled();
    expect(imported).toHaveBeenCalledWith(expect.objectContaining({kind:"image",mediaId:"asset"}),{kind:"library"});
    expect(vi.mocked(open).mock.lastCall![0]?.filters?.[0].extensions).toEqual(expect.arrayContaining(["mp4","png","wav"]));
  });
  it("importa caminho nativo com alvo capturado sem abrir diálogo e libera em cancelamento",async()=>{
    const complete=vi.fn(),imported=vi.fn();let importer!:ReturnType<typeof useCompositionImport>;
    let finish!:(value:Awaited<ReturnType<typeof ipc.importMedia>>)=>void;
    vi.mocked(ipc.importMedia).mockReturnValue(new Promise(resolve=>{finish=resolve;}));
    function Probe(){importer=useCompositionImport("project",complete,vi.fn(),imported);return null;}
    mounted=await reactHost(<Probe/>);
    const intent={kind:"drop" as const,target:{frame:750,trackId:"V2"}};
    let pending!:Promise<void>;
    await act(async()=>{pending=importer.importPath("C:/fixtures/image.png",intent);});
    expect(open).not.toHaveBeenCalled();
    await act(async()=>{importer.cancel();finish({entry,analysisError:null});await pending;});
    expect(imported).toHaveBeenCalledWith(expect.objectContaining({kind:"image"}),intent);
    expect(complete).not.toHaveBeenCalled();expect(importer.busy).toBe(false);
  });
  it("arquivo externo sem extensão suportada não inicia job",async()=>{
    const error=vi.fn(),imported=vi.fn();let importer!:ReturnType<typeof useCompositionImport>;
    function Probe(){importer=useCompositionImport("project",vi.fn(),error,imported);return null;}
    mounted=await reactHost(<Probe/>);
    await act(async()=>{await importer.importPath("C:/fixtures/programa.exe",{kind:"library"});});
    expect(ipc.importMedia).not.toHaveBeenCalled();expect(imported).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("Formato não suportado"));
  });
  it("trocar corte no mesmo projeto cancela o drop pendente e ignora commit tardio",async()=>{
    const imported=vi.fn();let importer!:ReturnType<typeof useCompositionImport>;
    let finish!:(value:Awaited<ReturnType<typeof ipc.importMedia>>)=>void;
    vi.mocked(ipc.importMedia).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
    function Probe({clip}:{clip:string}){
      importer=useCompositionImport("project",vi.fn(),vi.fn(),imported,clip);
      useLayoutEffect(()=>{if(clip==="second")oldProgress(4,8);},[clip]);
      return null;
    }
    mounted=await reactHost(<Probe clip="first"/>);
    let pending!:Promise<void>;
    await act(async()=>{pending=importer.importPath("C:/image.png",{kind:"drop",target:{frame:30,trackId:"V2"}});});
    const signal=vi.mocked(ipc.importMedia).mock.lastCall![3]!;
    const oldProgress=vi.mocked(ipc.importMedia).mock.lastCall![2];
    await mounted.render(<Probe clip="second"/>);
    expect(signal.aborted).toBe(true);
    expect(importer.busy).toBe(false);
    expect(importer.progress).toBeNull();
    await act(async()=>{finish({entry,analysisError:null});await pending;});
    expect(imported).not.toHaveBeenCalled();
  });
});
