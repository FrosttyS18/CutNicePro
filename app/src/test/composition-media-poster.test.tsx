import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { CompositionMediaPoster } from "../components/editor/CompositionMediaPoster";
import { loadClipThumbnail, type ClipThumbnail } from "../services/clip-thumbnails";
import { reactHost } from "./react-host";
import type { CompositionAsset } from "../lib/composition-types";

vi.mock("../services/clip-thumbnails",()=>({loadClipThumbnail:vi.fn()}));
let view:Awaited<ReturnType<typeof reactHost>>|undefined;
afterEach(async()=>{await view?.close();view=undefined;vi.clearAllMocks();});
const asset:CompositionAsset={id:"source",mediaId:"first",name:"Entrevista.mp4",kind:"video",durationUs:10_000_000,width:1920,height:1080,transcript:[]};
function deferred(){let resolve!:(value:ClipThumbnail)=>void;const promise=new Promise<ClipThumbnail>(done=>{resolve=done;});return {promise,resolve};}

it("busca um único poster barato e usa a prévia disponível enquanto aguarda",async()=>{
  const pending=deferred();vi.mocked(loadClipThumbnail).mockReturnValueOnce(pending.promise);
  view=await reactHost(<CompositionMediaPoster asset={asset} preview="blob:timeline"/>);
  expect(loadClipThumbnail).toHaveBeenCalledWith("first",.4);
  expect(view.host.querySelector("video")).toBeNull();
  expect(view.host.querySelector("img")?.src).toBe("blob:timeline");
  await act(async()=>pending.resolve({src:"data:image/jpeg;base64,poster",width:160,height:90}));
  expect(view.host.querySelector("img")?.getAttribute("src")).toBe("data:image/jpeg;base64,poster");
});

it("ignora resposta atrasada de outra mídia e resposta após desmontar",async()=>{
  const first=deferred(),second=deferred();
  vi.mocked(loadClipThumbnail).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  view=await reactHost(<CompositionMediaPoster asset={asset}/>);
  await view.render(<CompositionMediaPoster asset={{...asset,mediaId:"second",durationUs:200_000}}/>);
  expect(loadClipThumbnail).toHaveBeenLastCalledWith("second",.1);
  await act(async()=>first.resolve({src:"data:image/jpeg;base64,old",width:160,height:90}));
  expect(view.host.querySelector("img")).toBeNull();
  await view.render(<span>Fechado</span>);
  await act(async()=>second.resolve({src:"data:image/jpeg;base64,late",width:160,height:90}));
  expect(view.host.textContent).toBe("Fechado");
  expect(view.host.querySelector("img")).toBeNull();
});

it("imagens usam a URL existente e áudios usam ícone sem pedir poster",async()=>{
  view=await reactHost(<CompositionMediaPoster asset={{...asset,kind:"image"}} imageUrl="blob:image"/>);
  expect(view.host.querySelector("img")?.src).toBe("blob:image");
  await view.render(<CompositionMediaPoster asset={{...asset,kind:"audio"}}/>);
  expect(view.host.querySelector("img")).toBeNull();
  expect(view.host.querySelector("svg")).not.toBeNull();
  expect(loadClipThumbnail).not.toHaveBeenCalled();
});
