import { describe, expect, it } from "vitest";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { scrollTimelineAtPointer, selectionForClick, trimDeltaBounds } from "../lib/composition-gesture";

function fixture(){
  const workspace=emptyWorkspace();
  workspace.media={kind:"local",mediaId:"source",name:"source.mp4",duration:10,width:1920,height:1080,videoId:null,url:null};
  return compositionFromLegacy(workspace);
}
describe("limites e seleção da timeline",()=>{
  it("rola nas bordas da área de mídia e respeita o limite do conteúdo",()=>{
    const element={clientWidth:900,scrollWidth:1800,scrollLeft:400,getBoundingClientRect:()=>({left:100,right:1000})} as HTMLElement;
    expect(scrollTimelineAtPointer(element,999)).toBe(true);expect(element.scrollLeft).toBeGreaterThan(400);
    element.scrollLeft=900;expect(scrollTimelineAtPointer(element,999)).toBe(false);
    element.scrollLeft=400;expect(scrollTimelineAtPointer(element,245)).toBe(true);expect(element.scrollLeft).toBeLessThan(400);
    expect(scrollTimelineAtPointer(element,600)).toBe(false);
  });
  it("limita pelo membro vinculado mais curto e por frames completos da fonte",()=>{
    const document=fixture();const item=document.items[0];
    item.sourceEndUs=9_950_000;item.durationFrames=299;
    document.items[1]={...document.items[1],sourceEndUs:9_990_000,durationFrames:299};
    expect(trimDeltaBounds(document,item,"end")).toEqual([-298,0]);
    document.items[1].sourceEndUs=9_966_667;
    expect(trimDeltaBounds(document,item,"end")[1]).toBe(1);
  });
  it("não permite avançar o início de um grupo até duração zero",()=>{
    const document=fixture();const item=document.items[0];
    document.items[1].durationFrames=2;
    expect(trimDeltaBounds(document,item,"start")[1]).toBe(1);
  });
  it("amplia Shift e alterna grupos vinculados com Ctrl",()=>{
    const document=fixture();const first=document.items[0];first.durationFrames=30;
    const middle={...first,id:"middle",groupId:"middle",startFrame:30};
    const last={...first,id:"last",groupId:"last",startFrame:60};
    document.items.push(middle,last);
    expect(selectionForClick(document,[first.id],last,{shift:true},first.id)).toEqual([first.id,"middle","last"]);
    expect(selectionForClick(document,[first.id],document.items[1],{control:true},first.id)).toEqual([]);
    expect(selectionForClick(document,[first.id],last,{control:true},first.id)).toEqual([first.id,"last"]);
  });
});
