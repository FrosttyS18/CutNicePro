import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { CompositionTimeline } from "../components/editor/CompositionTimeline";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";

let view:Awaited<ReturnType<typeof reactHost>>|undefined;
afterEach(async()=>{await view?.close();view=undefined;});

async function mount(durationFrames=150){
  const legacy=emptyWorkspace();
  legacy.media={kind:"local",mediaId:"source",name:"Fonte.mp4",duration:1200,width:1920,height:1080,videoId:null,url:null};
  const document=compositionFromLegacy(legacy,{hasAudio:false});
  document.assets.push({...document.assets[0],id:"image",mediaId:"image",kind:"image",durationUs:0,name:"Imagem.png"});
  document.tracks.push({id:"overlay",name:"Camada 2",kind:"visual",primary:false,locked:false,hidden:false,muted:false});
  document.items.push({...structuredClone(document.items[0]),id:"image-item",assetId:"image",trackId:"overlay",kind:"image",startFrame:3000,durationFrames,sourceStartUs:0,sourceEndUs:0,groupId:"image"});
  const callbacks={onSelect:vi.fn(),onRange:vi.fn(),onSeek:vi.fn(),onChange:vi.fn(),onPreview:vi.fn(),onError:vi.fn()};
  view=await reactHost(<CompositionTimeline document={document} frame={600} selected={[]} mode="select" range={null}
    previews={{image:{frames:["cnplocal://media/image.png"],peaks:[]}}} {...callbacks}/>);
  return {document,callbacks,item:()=>view!.host.querySelector<HTMLElement>('[data-composition-item="image-item"]')!};
}

it("mantém imagem curta visível sem alterar seu tempo e usa a imagem com duração de fonte zero",async()=>{
  const {document,callbacks,item}=await mount();
  expect(item().getAttribute("data-compact")).toBe("true");
  expect(item().querySelector('img')?.getAttribute("src")).toBe("cnplocal://media/image.png");
  expect(item().querySelector('[aria-label^="Ampliar trecho"]')).not.toBeNull();
  expect(item().dataset.startFrame).toBe("3000");
  expect(document.items.find(value=>value.id==="image-item")?.durationFrames).toBe(150);
  expect(callbacks.onChange).not.toHaveBeenCalled();expect(callbacks.onSeek).not.toHaveBeenCalled();
});

it.each(["mouse","keyboard"])("amplia o trecho por %s sem seek nem alteração do documento",async method=>{
  const {document,callbacks,item}=await mount();const before=JSON.stringify(document);
  const control=item().querySelector<HTMLElement>('[aria-label^="Ampliar trecho"]')!;
  expect(control).not.toBeNull();
  await act(async()=>{
    if(method==="mouse")control.dispatchEvent(new window.MouseEvent("dblclick",{bubbles:true}));
    else control.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true}));
  });
  expect(item().getAttribute("data-compact")).not.toBe("true");
  expect(item().querySelectorAll('[aria-label^="Ajustar"]')).toHaveLength(2);
  expect(document.items.find(value=>value.id==="image-item")?.durationFrames).toBe(150);
  expect(callbacks.onSelect).toHaveBeenLastCalledWith(["image-item"]);
  expect(callbacks.onSeek).not.toHaveBeenCalled();expect(callbacks.onChange).not.toHaveBeenCalled();
  expect(JSON.stringify(document)).toBe(before);
});

it("permite revelar um único frame e volta ao resumo pelo ajuste à largura",async()=>{
  const {callbacks,item}=await mount(1);
  const reveal=item().querySelector<HTMLElement>('[aria-label^="Ampliar trecho"]')!;
  expect(reveal).not.toBeNull();
  await act(async()=>reveal.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true})));
  expect(item().getAttribute("data-compact")).not.toBe("true");
  await act(async()=>view!.host.querySelector<HTMLButtonElement>('[aria-label="Ajustar à largura"]')!.click());
  expect(item().getAttribute("data-compact")).toBe("true");
  expect(callbacks.onChange).not.toHaveBeenCalled();expect(callbacks.onSeek).not.toHaveBeenCalled();
});

it("usa a imagem também quando ampliada e não cria waveform de fonte inexistente",async()=>{
  const {item}=await mount(1200);
  expect(item().getAttribute("data-compact")).not.toBe("true");
  const images=[...item().querySelectorAll("img")];expect(images.length).toBeGreaterThan(0);
  expect(images.every(image=>image.getAttribute("src")==="cnplocal://media/image.png")).toBe(true);
  expect(item().querySelector("canvas")).toBeNull();
});
