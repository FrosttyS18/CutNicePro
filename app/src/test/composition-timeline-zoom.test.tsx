import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { CompositionTimeline } from "../components/editor/CompositionTimeline";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { compositionDuration } from "../lib/composition";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";

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
  return {viewport,item,onSelect,onChange,duration:compositionDuration(document)};
}
async function zoom(label:string){
  const button=view!.host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  await act(async()=>button.click());
}
async function scroll(viewport:HTMLElement,left:number){await act(async()=>{viewport.scrollLeft=left;viewport.dispatchEvent(new window.Event("scroll",{bubbles:true}));});}
function cursorPixel(viewport:HTMLElement){return parseFloat(view!.host.querySelector<HTMLElement>(".composition-playhead")!.style.left)-viewport.scrollLeft;}

it("preserva a posição visível do cursor ao aumentar e diminuir zoom após rolar",async()=>{
  const {viewport,item,onSelect,onChange}=await mount(1500);
  await zoom("Aumentar zoom");await scroll(viewport,240);
  const before=cursorPixel(viewport);
  expect(before).toBeGreaterThan(144);expect(before).toBeLessThan(800);
  await zoom("Aumentar zoom");expect(cursorPixel(viewport)).toBeCloseTo(before,6);
  await zoom("Diminuir zoom");expect(cursorPixel(viewport)).toBeCloseTo(before,6);
  const slider=view!.host.querySelector<HTMLInputElement>('[aria-label="Zoom da linha do tempo"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(slider),"value")!.set!.call(slider,"50");slider.dispatchEvent(new window.Event("input",{bubbles:true}));});
  expect(cursorPixel(viewport)).toBeCloseTo(before,6);
  expect(item.getAttribute("data-selected")).toBe("true");
  expect(onSelect).not.toHaveBeenCalled();expect(onChange).not.toHaveBeenCalled();
});

it("preserva o tempo central se o cursor está fora da vista e Ajustar retorna à origem",async()=>{
  const {viewport,item,duration}=await mount(0);
  await zoom("Aumentar zoom");await scroll(viewport,250);
  expect(cursorPixel(viewport)).toBeLessThan(144);
  const center=()=> (viewport.scrollLeft+(800-144)/2-24)/(parseFloat(item.style.width)/duration);
  const before=center();
  await zoom("Aumentar zoom");expect(center()).toBeCloseTo(before,6);
  await zoom("Diminuir zoom");expect(center()).toBeCloseTo(before,6);
  await zoom("Ajustar à largura");expect(viewport.scrollLeft).toBe(0);
  expect(parseFloat(item.style.width)).toBeCloseTo(608,6);
  expect(item.getAttribute("data-selected")).toBe("true");
});
