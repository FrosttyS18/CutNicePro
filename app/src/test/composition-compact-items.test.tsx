import { act } from "react";
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { CompositionTimeline } from "../components/editor/CompositionTimeline";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";
const timelineStyles=readFileSync(new URL("../components/editor/composition-timeline.css",import.meta.url),"utf8");

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

it("não amplia por Enter no meio de um arraste e volta a ampliar após cancelar",async()=>{
  const {callbacks,item}=await mount();
  const control=item().querySelector<HTMLElement>('[aria-label^="Ampliar trecho"]')!;
  const before=item().style.width;
  await act(async()=>control.dispatchEvent(new window.MouseEvent("pointerdown",{button:0,clientX:300,bubbles:true})));
  await act(async()=>control.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true})));
  expect(item().style.width).toBe(before);expect(item().getAttribute("data-compact")).toBe("true");
  await act(async()=>window.dispatchEvent(new window.Event("pointercancel")));
  await act(async()=>control.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true})));
  expect(item().getAttribute("data-compact")).not.toBe("true");
  expect(callbacks.onChange).not.toHaveBeenCalled();expect(callbacks.onSeek).not.toHaveBeenCalled();
});

it.each([false,true])("separa os botões de adicionar do marcador curto, com cauda longa=%s",async tail=>{
  const legacy=emptyWorkspace();
  legacy.media={kind:"local",mediaId:"source",name:"Fonte.mp4",duration:1200,width:1920,height:1080,videoId:null,url:null};
  const document=compositionFromLegacy(legacy,{hasAudio:false});
  const main=document.items.find(item=>item.kind==="video")!;
  const short={...main,id:"short",startFrame:tail?main.durationFrames:0,durationFrames:1,sourceEndUs:33333};
  document.items=tail?[main,short]:[short];
  const before=JSON.stringify(document);
  const callbacks={onSelect:vi.fn(),onRange:vi.fn(),onSeek:vi.fn(),onChange:vi.fn(),onPreview:vi.fn(),onError:vi.fn()};
  const insert=vi.fn();
  const menu=[{label:"Vídeo na faixa principal",icon:null,onSelect:insert}];
  view=await reactHost(<CompositionTimeline document={document} frame={0} selected={[short.id]} mode="select" range={null}
    startAddItems={menu} endAddItems={menu} {...callbacks}/>,environment=>{
    const style=environment.document.createElement("style");style.textContent=timelineStyles;environment.document.head.append(style);
  });
  const lane=view.host.querySelector<HTMLElement>(`[data-composition-track="${main.trackId}"] .composition-track__items`)!;
  const item=lane.querySelector<HTMLElement>('[data-composition-item="short"]')!;
  const marker=item.querySelector<HTMLButtonElement>('[aria-label^="Ampliar trecho"]')!;
  const start=lane.querySelector<HTMLElement>('[aria-label="Adicionar no início"]')!.closest<HTMLElement>('.composition-track__add')!;
  const end=lane.querySelector<HTMLElement>('[aria-label="Adicionar no fim"]')!.closest<HTMLElement>('.composition-track__add')!;
  const markerRight=parseFloat(item.style.left)+parseFloat(window.getComputedStyle(marker).width);
  const startRight=parseFloat(start.style.left)+parseFloat(window.getComputedStyle(start.querySelector("button")!).width);
  const endLeft=parseFloat(end.style.left);
  const endRight=endLeft+parseFloat(window.getComputedStyle(end.querySelector("button")!).width);
  expect(marker).not.toBeNull();
  expect(parseFloat(item.style.left)-startRight).toBeGreaterThanOrEqual(8);
  expect(endLeft-markerRight).toBeGreaterThanOrEqual(8);
  expect(endRight).toBeLessThanOrEqual(parseFloat(lane.style.width));
  await act(async()=>marker.dispatchEvent(new window.MouseEvent("dblclick",{bubbles:true})));
  expect(callbacks.onSelect).toHaveBeenLastCalledWith([short.id]);
  expect(lane.querySelector('[data-composition-item="short"]')?.getAttribute("data-compact")).not.toBe("true");
  expect(callbacks.onSeek).not.toHaveBeenCalled();expect(callbacks.onChange).not.toHaveBeenCalled();
  expect(insert).not.toHaveBeenCalled();expect(JSON.stringify(document)).toBe(before);
  await act(async()=>end.querySelector<HTMLButtonElement>("button")!.click());
  const option=[...view.host.ownerDocument.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(button=>button.textContent==="Vídeo na faixa principal")!;
  await act(async()=>option.click());expect(insert).toHaveBeenCalledTimes(1);
});

it.each([1,2,8])("zoom continua reversível após revelar um trecho isolado de %s frames",async frames=>{
  const legacy=emptyWorkspace();legacy.media={kind:"local",mediaId:"source",name:"Fonte.mp4",duration:1200,width:1920,height:1080,videoId:null,url:null};
  const document=compositionFromLegacy(legacy,{hasAudio:false});
  const main=document.items.find(item=>item.kind==="video")!;
  document.items=[{...main,durationFrames:frames,sourceEndUs:Math.round(frames/30*1e6)}];
  const before=JSON.stringify(document);
  const callbacks={onSelect:vi.fn(),onRange:vi.fn(),onSeek:vi.fn(),onChange:vi.fn(),onPreview:vi.fn(),onError:vi.fn()};
  const menu=[{label:"Vídeo",icon:null,onSelect:vi.fn()}];
  view=await reactHost(<CompositionTimeline document={document} frame={0} selected={[]} mode="select" range={null}
    startAddItems={menu} endAddItems={menu} {...callbacks}/>);
  const item=()=>view!.host.querySelector<HTMLElement>('[data-composition-item]')!;
  const marker=item().querySelector<HTMLElement>('[aria-label^="Ampliar trecho"]')!;
  await act(async()=>marker.dispatchEvent(new window.MouseEvent("dblclick",{bubbles:true})));
  const slider=view.host.querySelector<HTMLInputElement>('[aria-label="Zoom da linha do tempo"]')!;
  const minus=view.host.querySelector<HTMLButtonElement>('[aria-label="Diminuir zoom"]')!;
  const plus=view.host.querySelector<HTMLButtonElement>('[aria-label="Aumentar zoom"]')!;
  expect(minus.getAttribute("aria-disabled")).toBe("false");
  const expanded=parseFloat(item().style.width);
  await act(async()=>minus.click());expect(parseFloat(item().style.width)).toBeLessThan(expanded);
  await act(async()=>plus.click());expect(parseFloat(item().style.width)).toBeCloseTo(expanded,6);
  await act(async()=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(slider),"value")!.set!.call(slider,"0");slider.dispatchEvent(new window.Event("input",{bubbles:true}));});
  expect(slider.valueAsNumber).toBe(0);expect(plus.getAttribute("aria-disabled")).toBe("false");
  const timeline=view.host.querySelector(".composition-timeline")!;
  const wheel=(deltaY:number)=>{
    const event=new window.WheelEvent("wheel",{bubbles:true,cancelable:true,deltaY});
    Object.defineProperty(event,"ctrlKey",{value:true});return event;
  };
  for(let count=0;count<20;count++)await act(async()=>timeline.dispatchEvent(wheel(-100)));
  expect(slider.valueAsNumber).toBe(100);
  expect(parseFloat(item().style.width)/frames).toBeLessThanOrEqual(20);
  for(let count=0;count<20;count++)await act(async()=>timeline.dispatchEvent(wheel(100)));
  expect(slider.valueAsNumber).toBe(0);
  await act(async()=>view!.host.querySelector<HTMLButtonElement>('[aria-label="Ajustar à largura"]')!.click());
  expect(parseFloat(item().style.width)/frames).toBeLessThanOrEqual(20);
  expect(minus.getAttribute("aria-disabled")).toBe("false");
  expect(callbacks.onChange).not.toHaveBeenCalled();expect(callbacks.onSeek).not.toHaveBeenCalled();
  expect(JSON.stringify(document)).toBe(before);
});
