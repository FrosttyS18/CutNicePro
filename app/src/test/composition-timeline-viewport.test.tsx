import { act } from "react";
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { CompositionTimeline } from "../components/editor/CompositionTimeline";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { compositionDuration } from "../lib/composition";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";

const editorCss=readFileSync(new URL("../components/editor/composition-editor.css",import.meta.url),"utf8");
const timelineCss=readFileSync(new URL("../components/editor/composition-timeline.css",import.meta.url),"utf8");
function wheelEvent(options:WheelEventInit){
  const event=new window.WheelEvent("wheel",{bubbles:true,cancelable:true,...options});
  Object.defineProperties(event,{ctrlKey:{value:Boolean(options.ctrlKey)},clientX:{value:options.clientX??0},clientY:{value:options.clientY??0}});
  return event;
}

let view:Awaited<ReturnType<typeof reactHost>>|undefined;
afterEach(async()=>{await view?.close();view=undefined;});
async function mount(){
  const workspace=emptyWorkspace();workspace.media={kind:"local",mediaId:"source",name:"Fonte.mp4",duration:100,width:1920,height:1080,videoId:null,url:null};
  const document=compositionFromLegacy(workspace),onChange=vi.fn();
  view=await reactHost(<div style={{width:800}}><section className="composition-editor"><div className="composition-editor__timeline"><CompositionTimeline document={document} frame={1500} selected={[document.items[0].id]} mode="select" range={null}
    onSelect={vi.fn()} onRange={vi.fn()} onSeek={vi.fn()} onChange={onChange} onPreview={vi.fn()} onError={vi.fn()}/></div></section></div>,environment=>{
    const style=environment.document.createElement("style");style.textContent=editorCss+"\n"+timelineCss;environment.document.head.append(style);
  });
  const viewport=view.host.querySelector<HTMLElement>(".composition-timeline__viewport")!;
  Object.defineProperty(viewport,"clientWidth",{configurable:true,value:800});
  Object.defineProperty(viewport,"getBoundingClientRect",{configurable:true,value:()=>({left:100,right:900,top:200,bottom:400,width:800,height:200})});
  await act(async()=>window.dispatchEvent(new window.Event("resize")));
  return {viewport,onChange,duration:compositionDuration(document)};
}
async function enlarge(){await act(async()=>view!.host.querySelector<HTMLButtonElement>('[aria-label="Aumentar zoom"]')!.click());}
function pixelsPerFrame(duration:number){return parseFloat(view!.host.querySelector<HTMLElement>('[data-kind="video"][data-composition-item]')!.style.width)/duration;}
it("Ctrl+roda aplica zoom no ponteiro sem zoom do navegador e atualiza o slider",async()=>{
  const {viewport,duration,onChange}=await mount();await enlarge();
  await act(async()=>{viewport.scrollLeft=240;viewport.dispatchEvent(new window.Event("scroll",{bubbles:true}));});
  const pointer=400,at=(viewport.scrollLeft+pointer-168)/pixelsPerFrame(duration);
  const slider=view!.host.querySelector<HTMLInputElement>('[aria-label="Zoom da linha do tempo"]')!,before=slider.valueAsNumber;
  const event=wheelEvent({ctrlKey:true,deltaY:-100,clientX:500,clientY:240});
  await act(async()=>{viewport.dispatchEvent(event);});
  expect(event.defaultPrevented).toBe(true);
  expect((viewport.scrollLeft+pointer-168)/pixelsPerFrame(duration)).toBeCloseTo(at,6);
  expect(slider.valueAsNumber).toBeGreaterThan(before);expect(onChange).not.toHaveBeenCalled();
  const cursor=()=>parseFloat(view!.host.querySelector<HTMLElement>(".composition-playhead")!.style.left);
  const prior=cursor(),headerWheel=wheelEvent({ctrlKey:true,deltaY:-50,clientX:20,clientY:100});
  await act(async()=>{view!.host.querySelector(".composition-timeline")!.dispatchEvent(headerWheel);});
  expect(headerWheel.defaultPrevented).toBe(true);expect(cursor()).toBeCloseTo(prior,6);
});
it("roda sem Ctrl e roda fora da timeline mantêm o comportamento nativo",async()=>{
  const {viewport,duration}=await mount(),before=pixelsPerFrame(duration);
  const normal=wheelEvent({deltaY:100});
  await act(async()=>{viewport.dispatchEvent(normal);});
  expect(normal.defaultPrevented).toBe(false);expect(pixelsPerFrame(duration)).toBe(before);
  const outside=wheelEvent({ctrlKey:true,deltaY:-100});
  await act(async()=>{globalThis.document.body.dispatchEvent(outside);});
  expect(outside.defaultPrevented).toBe(false);expect(pixelsPerFrame(duration)).toBe(before);
  const timeline=view!.host.querySelector(".composition-timeline")!,afterClose=wheelEvent({ctrlKey:true,deltaY:-100});
  await view!.close();view=undefined;timeline.dispatchEvent(afterClose);
  expect(afterClose.defaultPrevented).toBe(false);
});
it("Ctrl+roda para nos limites e nunca faz os vídeos desaparecerem",async()=>{
  const {viewport,duration,onChange}=await mount();
  for(let index=0;index<40;index++)await act(async()=>{viewport.dispatchEvent(wheelEvent({ctrlKey:true,deltaY:100,clientX:500,clientY:240}));});
  expect(pixelsPerFrame(duration)*duration).toBeCloseTo(38,6);
  expect(viewport.scrollLeft).toBe(0);
  const minus=view!.host.querySelector<HTMLButtonElement>('[aria-label="Diminuir zoom"]')!;
  expect(minus.getAttribute("aria-disabled")).toBe("true");
  for(let index=0;index<40;index++)await act(async()=>{viewport.dispatchEvent(wheelEvent({ctrlKey:true,deltaY:-100,clientX:500,clientY:240}));});
  const maximum=pixelsPerFrame(duration);
  expect(Number.isFinite(maximum)).toBe(true);expect(maximum).toBe(20);
  expect(view!.host.querySelector<HTMLButtonElement>('[aria-label="Aumentar zoom"]')!.getAttribute("aria-disabled")).toBe("true");
  const slider=view!.host.querySelector<HTMLInputElement>('[aria-label="Zoom da linha do tempo"]')!;
  expect(slider.valueAsNumber).toBe(100);
  for(let index=0;index<40;index++)await act(async()=>{viewport.dispatchEvent(wheelEvent({ctrlKey:true,deltaY:100,clientX:500,clientY:240}));});
  expect(pixelsPerFrame(duration)*duration).toBeCloseTo(38,6);expect(slider.valueAsNumber).toBeCloseTo(0,8);
  expect(onChange).not.toHaveBeenCalled();
});
it("limita o mínimo intrínseco do grid e mantém a rolagem na régua",async()=>{
  const {viewport}=await mount();await enlarge();await enlarge();
  expect(parseFloat(view!.host.querySelector<HTMLElement>(".composition-timeline__content")!.style.width)).toBeGreaterThan(800);
  const editor=window.getComputedStyle(view!.host.querySelector(".composition-editor")!);
  expect(editor.gridTemplateColumns.replace(/\s/g,"")).toBe("minmax(0,1fr)");
  for(const selector of [".composition-editor__timeline",".composition-timeline",".composition-timeline__viewport",".composition-timeline__zoom"]){
    const style=window.getComputedStyle(view!.host.querySelector(selector)!);
    expect(parseFloat(style.minWidth)).toBe(0);expect(style.maxWidth).toBe("100%");
  }
  expect(window.getComputedStyle(viewport).overflowX).toBe("auto");
  const controls=window.getComputedStyle(view!.host.querySelector(".composition-timeline__zoom-controls")!);
  expect(controls.display).toBe("grid");expect(controls.maxWidth).toBe("100%");
  expect(view!.host.querySelectorAll('.composition-timeline__zoom-controls button')).toHaveLength(3);
});
