import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCompositionImport } from "../hooks/useCompositionImport";
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
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({kind:"image",mediaId:"asset",durationUs:0,width:640}),true);
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
});
