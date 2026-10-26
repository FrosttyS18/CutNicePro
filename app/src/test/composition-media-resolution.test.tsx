import { act, useLayoutEffect } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useCompositionMedia } from "../hooks/useCompositionMedia";
import type { CompositionAsset } from "../lib/composition-types";
import type { MediaEntryDto } from "../lib/ipc";
import { reactHost } from "./react-host";

vi.mock("../lib/ipc",()=>({getMedia:vi.fn(),mediaUrl:vi.fn(()=>"http://cnplocal.localhost/available.mp4")}));
const ipc=await import("../lib/ipc");
const asset:CompositionAsset={id:"asset",mediaId:"media",name:"Entrevista.mp4",kind:"video",durationUs:10_000_000,width:1920,height:1080,transcript:[]};
const assets=[asset];
const available:MediaEntryDto={mediaId:"media",sha256:"a".repeat(64),sizeBytes:100,ext:"mp4",originalName:asset.name,createdAtMs:1,projectIds:["p"],analysis:null,unavailable:false};
let view:Awaited<ReturnType<typeof reactHost>>|undefined;
let entries:ReturnType<typeof useCompositionMedia>={};
afterEach(async()=>{await view?.close();view=undefined;vi.clearAllMocks();entries={};});
function Probe({sources=assets,sourceUrl}:{sources?:CompositionAsset[];sourceUrl?:string}){
  const current=useCompositionMedia(sources,sourceUrl?"media":undefined,sourceUrl);
  useLayoutEffect(()=>{entries=current;},[current]);
  return null;
}

it("não cria URL para mídia marcada indisponível e orienta reconexão",async()=>{
  vi.mocked(ipc.getMedia).mockResolvedValue({...available,unavailable:true});
  view=await reactHost(<Probe/>);
  expect(entries.asset.url).toBeNull();
  expect(entries.asset.error).toContain("Reconecte");expect(entries.asset.error).toContain(asset.name);
  expect(ipc.mediaUrl).not.toHaveBeenCalled();
});
it("resolve mídia disponível pelo contrato de URL existente",async()=>{
  vi.mocked(ipc.getMedia).mockResolvedValue(available);
  view=await reactHost(<Probe/>);
  expect(entries.asset).toEqual({url:"http://cnplocal.localhost/available.mp4",error:null});
  expect(ipc.mediaUrl).toHaveBeenCalledWith(available);
});
it("resposta antiga não substitui o erro da nova mídia após trocar a fonte",async()=>{
  let finish!:(value:MediaEntryDto)=>void;
  vi.mocked(ipc.getMedia).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce({...available,mediaId:"missing",unavailable:true});
  view=await reactHost(<Probe sources={assets}/>);
  await view.render(<Probe sources={[{...asset,mediaId:"missing",name:"Vídeo ausente.mp4"}]}/>);
  expect(entries.asset.url).toBeNull();expect(entries.asset.error).toContain("Vídeo ausente.mp4");
  await act(async()=>finish(available));
  expect(entries.asset.url).toBeNull();expect(entries.asset.error).toContain("Vídeo ausente.mp4");
});
it("preserva a URL de sessão já fornecida sem nova consulta",async()=>{
  view=await reactHost(<Probe sourceUrl="blob:session"/>);
  expect(entries.asset).toEqual({url:"blob:session",error:null});
  expect(ipc.getMedia).not.toHaveBeenCalled();expect(ipc.mediaUrl).not.toHaveBeenCalled();
});
