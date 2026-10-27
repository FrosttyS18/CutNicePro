import { act } from "react";
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { CompositionTrackLane } from "../components/editor/CompositionTrackLane";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";

let view:Awaited<ReturnType<typeof reactHost>>|undefined;
afterEach(async()=>{await view?.close();view=undefined;});

async function mount(color?:string,overlays=0){
  const workspace=emptyWorkspace();
  workspace.media={kind:"local",mediaId:"source",name:"Fonte.mp4",duration:10,width:1920,height:1080,videoId:null,url:null};
  const document=compositionFromLegacy(workspace);
  const track={...document.tracks.find(track=>track.primary)!,name:"Material da entrevista principal",...(color?{color}:{})};
  view=await reactHost(<div className="composition-timeline__lanes">{Array.from({length:overlays},(_,index)=><CompositionTrackLane key={index} track={{...track,id:`overlay-${index}`,primary:false,name:`Sobreposição ${index+1}`}}
    items={[]} assets={document.assets} fps={document.fps} width={1000} scale={1} startPixel={0} visibleWidth={900} selected={new Set()} onBegin={vi.fn()} onEdgeKey={vi.fn()} onSelect={vi.fn()}/>)}<CompositionTrackLane track={track} items={document.items.filter(item=>item.trackId===track.id)} assets={document.assets}
    fps={document.fps} width={1000} scale={1} startPixel={0} visibleWidth={900} selected={new Set()} onBegin={vi.fn()} onEdgeKey={vi.fn()} onSelect={vi.fn()}/></div>,environment=>{
    const sheet=environment.document.createElement("style");
    sheet.textContent=readFileSync(new URL("../components/editor/composition-timeline.css",import.meta.url),"utf8");
    environment.document.head.append(sheet);
  });
  return track;
}

it("mantém a faixa principal fixa na base com fundo opaco e espaços flexíveis",async()=>{
  await mount();
  const lane=view!.host.querySelector<HTMLElement>('[data-composition-track="V1"]')!;
  expect(lane.dataset.primary).toBe("true");
  const style=window.getComputedStyle(lane);
  expect(style.position).toBe("sticky");
  expect(style.bottom).toBe("0px");
  expect(style.zIndex).toBe("2");
  expect(style.flexShrink).toBe("0");
  expect(style.borderTopWidth).toBe("1px");
  expect(style.borderTopStyle).toBe("solid");
  expect(style.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  const lanes=window.getComputedStyle(lane.parentElement!);
  expect(lanes.display).toBe("flex");
  expect(lanes.flexDirection).toBe("column");
  const rules=Array.from(document.styleSheets).flatMap(sheet=>Array.from(sheet.cssRules));
  const spacers=rules.filter(rule=>"selectorText" in rule&&typeof rule.selectorText==="string"&&rule.selectorText.includes(".composition-timeline__lanes::")) as CSSStyleRule[];
  expect(spacers.length).toBeGreaterThan(0);
  expect(spacers.some(rule=>rule.style.flex==="1 1 0%"||rule.style.flexGrow==="1")).toBe(true);
});

it("usa a cor só nos indicadores e superfícies da timeline sem modificar a mídia",async()=>{
  const track=await mount("#79B8FF");
  const lane=view!.host.querySelector<HTMLElement>('[data-composition-track="V1"]')!;
  expect(lane.style.getPropertyValue("--composition-track-color")).toBe(track.color);
  expect(lane.querySelector('[aria-hidden="true"][data-track-color]')).not.toBeNull();
  const name=lane.querySelector<HTMLElement>(".composition-track__label > strong")!;
  await act(async()=>name.dispatchEvent(new window.MouseEvent("mouseenter")));
  await act(async()=>name.focus());
  expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(track.name);
  expect(name.hasAttribute("title")).toBe(false);
});

it("mantém os controles da principal acima dos cabeçalhos das cinquenta faixas encobertas",async()=>{
  await mount(undefined,50);
  const lanes=Array.from(view!.host.querySelectorAll<HTMLElement>('[data-composition-track]'));
  expect(lanes).toHaveLength(51);
  const main=lanes.find(lane=>lane.dataset.primary==="true")!;
  const level=Number(window.getComputedStyle(main).zIndex);
  for(const lane of lanes.filter(lane=>lane!==main)){
    expect(window.getComputedStyle(lane).zIndex).toBe("0");
    expect(Number(window.getComputedStyle(lane).zIndex)).toBeLessThan(level);
  }
});
