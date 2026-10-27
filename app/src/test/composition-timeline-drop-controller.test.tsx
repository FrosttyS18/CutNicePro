import { act } from "react";
import { afterEach,expect,it,vi } from "vitest";
import { CompositionTimeline } from "../components/editor/CompositionTimeline";
import { compositionFromLegacy } from "../lib/composition-legacy";
import type { CompositionTimelineDropController } from "../lib/composition-drop-controller";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";

let view:Awaited<ReturnType<typeof reactHost>>|undefined;
afterEach(async()=>{await view?.close();view=undefined;});
const rect=(top:number,bottom:number)=>({left:0,right:900,top,bottom,width:900,height:bottom-top,x:0,y:top,toJSON:()=>({})});
async function mount(){
  const data=emptyWorkspace();data.media={kind:"local",mediaId:"source",name:"Fonte.mp4",duration:10,width:640,height:360,videoId:null,url:null};
  const document=compositionFromLegacy(data,{hasAudio:false});
  const controller:{current:CompositionTimelineDropController|null}={current:null};
  view=await reactHost(<CompositionTimeline document={document} frame={0} selected={[]} mode="select" range={null} dropController={controller}
    onSelect={vi.fn()} onRange={vi.fn()} onSeek={vi.fn()} onChange={vi.fn()} onPreview={vi.fn()} onError={vi.fn()}/>);
  const viewport=view.host.querySelector<HTMLElement>('.composition-timeline__viewport')!;
  Object.defineProperties(viewport,{getBoundingClientRect:{value:()=>rect(30,300)},clientWidth:{value:900},scrollWidth:{value:1200}});
  view.host.querySelector<HTMLElement>('.composition-timeline__content')!.getBoundingClientRect=()=>rect(30,300);
  view.host.querySelector<HTMLElement>('.composition-ruler')!.getBoundingClientRect=()=>rect(30,70);
  view.host.querySelector<HTMLElement>('[data-drop-new-track]')!.getBoundingClientRect=()=>rect(70,94);
  view.host.querySelector<HTMLElement>('[data-composition-track="V1"]')!.getBoundingClientRect=()=>rect(240,300);
  return controller;
}
it("régua e cabeçalho não viram destinos de importação",async()=>{
  const controller=await mount();
  expect(controller.current!.resolve({x:522,y:50},"video")).toBeNull();
  expect(controller.current!.resolve({x:50,y:180},"video")).toBeNull();
});
it("feedback de nova camada acompanha o drop na área livre e desaparece ao sair",async()=>{
  const controller=await mount();
  await act(async()=>{controller.current!.hover({x:522,y:180},"audio");});
  const marker=view!.host.querySelector<HTMLElement>('[aria-label="Ponto de inserção"]')!;
  expect(marker).not.toBeNull();
  expect(parseFloat(marker.style.top)).toBeGreaterThan(94-30);
  expect(parseFloat(marker.style.top)+parseFloat(marker.style.height)).toBeLessThanOrEqual(300-30);
  expect(view!.host.textContent).not.toContain("Solte para criar uma camada");
  await act(async()=>{controller.current!.hover({x:950,y:180},"audio");});
  expect(view!.host.querySelector('[aria-label="Ponto de inserção"]')).toBeNull();
});
