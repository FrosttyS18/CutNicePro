import { act, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { CompositionTimeline } from "../components/editor/CompositionTimeline";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { compositionDuration } from "../lib/composition";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";
import type { Composition } from "../lib/composition-types";

let view:Awaited<ReturnType<typeof reactHost>>|undefined;
afterEach(async()=>{await view?.close();view=undefined;});
async function mount(frame:number){
  const workspace=emptyWorkspace();
  workspace.media={kind:"local",mediaId:"source",name:"Fonte.mp4",duration:100,width:1920,height:1080,videoId:null,url:null};
  const document=compositionFromLegacy(workspace),onSelect=vi.fn(),onChange=vi.fn();
  view=await reactHost(<CompositionTimeline document={document} frame={frame} selected={[document.items[0].id]} mode="select" range={null}
    onSelect={onSelect} onRange={vi.fn()} onSeek={vi.fn()} onChange={onChange} onPreview={vi.fn()} onError={vi.fn()}/>);
  const viewport=view.host.querySelector<HTMLElement>(".composition-timeline__viewport")!;
  Object.defineProperty(viewport,"clientWidth",{configurable:true,value:800});
  await act(async()=>window.dispatchEvent(new window.Event("resize")));
  const item=view.host.querySelector<HTMLElement>('[data-kind="video"][data-composition-item]')!;
  return {document,viewport,item,onSelect,onChange,duration:compositionDuration(document)};
}
async function zoom(label:string){
  const button=view!.host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  await act(async()=>button.click());
}
async function scroll(viewport:HTMLElement,left:number){await act(async()=>{viewport.scrollLeft=left;viewport.dispatchEvent(new window.Event("scroll",{bubbles:true}));});}
function cursorPixel(){return parseFloat(view!.host.querySelector<HTMLElement>(".composition-playhead")!.style.left);}

it("preserva a posição visível do cursor ao aumentar e diminuir zoom após rolar",async()=>{
  const {viewport,item,onSelect,onChange}=await mount(1500);
  await zoom("Aumentar zoom");await scroll(viewport,240);
  const before=cursorPixel();
  expect(before).toBeGreaterThan(144);expect(before).toBeLessThan(800);
  await zoom("Aumentar zoom");expect(cursorPixel()).toBeCloseTo(before,6);
  await zoom("Diminuir zoom");expect(cursorPixel()).toBeCloseTo(before,6);
  const slider=view!.host.querySelector<HTMLInputElement>('[aria-label="Zoom da linha do tempo"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(slider),"value")!.set!.call(slider,"50");slider.dispatchEvent(new window.Event("input",{bubbles:true}));});
  expect(cursorPixel()).toBeCloseTo(before,6);
  expect(item.getAttribute("data-selected")).toBe("true");
  expect(onSelect).not.toHaveBeenCalled();expect(onChange).not.toHaveBeenCalled();
});

it("preserva o tempo central se o cursor está fora da vista e Ajustar retorna à origem",async()=>{
  const {viewport,item,duration}=await mount(0);
  await zoom("Aumentar zoom");await scroll(viewport,250);
  expect(cursorPixel()).toBeLessThan(144);
  const center=()=> (viewport.scrollLeft+(800-144)/2-24)/(parseFloat(item.style.width)/duration);
  const before=center();
  await zoom("Aumentar zoom");expect(center()).toBeCloseTo(before,6);
  await zoom("Diminuir zoom");expect(center()).toBeCloseTo(before,6);
  await zoom("Ajustar à largura");expect(viewport.scrollLeft).toBe(0);
  expect(parseFloat(item.style.width)).toBeCloseTo(608,6);
  expect(item.getAttribute("data-selected")).toBe("true");
});

it.each([[800,false,30],[1440,true,60]] as const)("fit inicial de um frame respeita os limites em %spx, extremidades=%s e fps=%s",async(available,additions,fps)=>{
  const workspace=emptyWorkspace();workspace.media={kind:"local",mediaId:"source",name:"Fonte.mp4",duration:1/fps,width:1920,height:1080,videoId:null,url:null};
  const document=compositionFromLegacy(workspace,{hasAudio:false}),onChange=vi.fn(),onSeek=vi.fn();
  document.fps={numerator:fps,denominator:1};
  const menu=[{label:"Vídeo",icon:null,onSelect:vi.fn()}];
  view=await reactHost(<CompositionTimeline document={document} frame={0} selected={[]} mode="select" range={null}
    startAddItems={additions?menu:undefined} endAddItems={additions?menu:undefined}
    onSelect={vi.fn()} onRange={vi.fn()} onSeek={onSeek} onChange={onChange} onPreview={vi.fn()} onError={vi.fn()}/>);
  const viewport=view.host.querySelector<HTMLElement>(".composition-timeline__viewport")!;
  Object.defineProperty(viewport,"clientWidth",{configurable:true,value:available});
  await act(async()=>window.dispatchEvent(new window.Event("resize")));
  const item=view.host.querySelector<HTMLElement>('[data-composition-item]')!;
  expect(parseFloat(item.style.width)).toBe(20);
  expect(view.host.querySelector('[aria-label="Diminuir zoom"]')?.getAttribute("aria-disabled")).toBe("false");
  await zoom("Diminuir zoom");expect(parseFloat(item.style.width)).toBeLessThan(20);
  expect(onChange).not.toHaveBeenCalled();expect(onSeek).not.toHaveBeenCalled();
});

it("revalida zoom após aparar a montagem, redimensionar a janela e voltar a ampliar sua duração",async()=>{
  const {document,onChange,viewport}=await mount(0);const onSeek=vi.fn();
  const video=document.items.find(item=>item.kind==="video")!;
  const render=async(durationFrames:number)=>{
    const current={...document,items:[{...video,durationFrames,sourceEndUs:Math.round(durationFrames/30*1e6)}]};
    await view!.render(<CompositionTimeline document={current} frame={0} selected={[video.id]} mode="select" range={null}
      onSelect={vi.fn()} onRange={vi.fn()} onSeek={onSeek} onChange={onChange} onPreview={vi.fn()} onError={vi.fn()}/>);
    return view!.host.querySelector<HTMLElement>('[data-composition-item]')!;
  };
  const short=await render(1);expect(parseFloat(short.style.width)).toBeGreaterThanOrEqual(3);
  const slider=view!.host.querySelector<HTMLInputElement>('[aria-label="Zoom da linha do tempo"]')!;
  expect(Number.isFinite(slider.valueAsNumber)).toBe(true);
  Object.defineProperty(viewport,"clientWidth",{configurable:true,value:1440});
  await act(async()=>window.dispatchEvent(new window.Event("resize")));
  await zoom("Aumentar zoom");await zoom("Diminuir zoom");await zoom("Ajustar à largura");
  expect(parseFloat(short.style.width)).toBe(20);
  const long=await render(20_000_000);
  expect(parseFloat(long.style.width)).toBeLessThanOrEqual(16_000_000);
  expect(Number.isFinite(slider.valueAsNumber)).toBe(true);
  await zoom("Diminuir zoom");expect(parseFloat(long.style.width)).toBeLessThan(16_000_000);
  expect(onChange).not.toHaveBeenCalled();expect(onSeek).not.toHaveBeenCalled();
});

it("mantém zoom utilizável e finito numa montagem vazia",async()=>{
  const {document,onChange}=await mount(0);
  await view!.render(<CompositionTimeline document={{...document,items:[]}} frame={0} selected={[]} mode="select" range={null}
    onSelect={vi.fn()} onRange={vi.fn()} onSeek={vi.fn()} onChange={onChange} onPreview={vi.fn()} onError={vi.fn()}/>);
  await zoom("Ajustar à largura");await zoom("Diminuir zoom");await zoom("Aumentar zoom");
  const slider=view!.host.querySelector<HTMLInputElement>('[aria-label="Zoom da linha do tempo"]')!;
  expect(Number.isFinite(slider.valueAsNumber)).toBe(true);
  expect(slider.valueAsNumber).toBeGreaterThanOrEqual(0);expect(slider.valueAsNumber).toBeLessThanOrEqual(100);
  expect(view!.host.querySelector('[data-composition-item]')).toBeNull();expect(onChange).not.toHaveBeenCalled();
});

it("aparar até um trecho compacto mantém a escala do gesto e normaliza somente ao soltar",async()=>{
  const workspace=emptyWorkspace();workspace.media={kind:"local",mediaId:"source",name:"Fonte.mp4",duration:100,width:1920,height:1080,videoId:null,url:null};
  const original=compositionFromLegacy(workspace,{hasAudio:false});const main=original.items[0];
  const change=vi.fn(),seek=vi.fn(),error=vi.fn();const requests=new Map<number,FrameRequestCallback>();let sequence=0;
  function Harness(){
    const [saved,setSaved]=useState(original),[preview,setPreview]=useState<Composition|null>(null);
    return <CompositionTimeline document={preview??saved} frame={0} selected={[main.id]} mode="select" range={null}
      onSelect={vi.fn()} onRange={vi.fn()} onSeek={seek} onChange={next=>{change(next);setSaved(next);}} onPreview={setPreview} onError={error}/>;
  }
  view=await reactHost(<Harness/>,environment=>{
    Object.defineProperty(environment,"requestAnimationFrame",{configurable:true,value:(callback:FrameRequestCallback)=>{const id=++sequence;requests.set(id,callback);return id;}});
    Object.defineProperty(environment,"cancelAnimationFrame",{configurable:true,value:(id:number)=>{requests.delete(id);}});
  });
  const viewport=view.host.querySelector<HTMLElement>(".composition-timeline__viewport")!;
  Object.defineProperties(viewport,{clientWidth:{configurable:true,value:800},scrollWidth:{configurable:true,value:800},
    getBoundingClientRect:{configurable:true,value:()=>({left:0,right:800,top:0,bottom:200,width:800,height:200})}});
  await act(async()=>window.dispatchEvent(new window.Event("resize")));
  const item=()=>view!.host.querySelector<HTMLElement>('[data-composition-item]')!;
  const scale=parseFloat(item().style.width)/main.durationFrames,startX=168+main.durationFrames*scale;
  const edge=view.host.querySelector<HTMLButtonElement>('[aria-label="Ajustar fim de Fonte.mp4"]')!;
  await act(async()=>edge.dispatchEvent(new window.MouseEvent("pointerdown",{button:0,clientX:startX,bubbles:true})));
  const move=async(x:number)=>{
    await act(async()=>window.dispatchEvent(new window.MouseEvent("pointermove",{clientX:x})));
    const callbacks=[...requests.values()];requests.clear();await act(async()=>callbacks.forEach(callback=>callback(0)));
    return main.durationFrames+Math.round((x-startX)/scale);
  };
  const shortFrames=await move(180);
  expect(parseFloat(item().style.width)/shortFrames).toBeCloseTo(scale,6);
  const finalFrames=await move(190);
  await act(async()=>window.dispatchEvent(new window.MouseEvent("pointerup",{clientX:190})));
  expect(change).toHaveBeenCalledTimes(1);
  expect((change.mock.lastCall![0] as Composition).items[0].durationFrames).toBe(finalFrames);
  expect(parseFloat(item().style.width)).toBeGreaterThanOrEqual(16);
  expect(seek).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled();
});
