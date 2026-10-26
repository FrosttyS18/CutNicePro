import { expect,it } from "vitest";
import { compositionDropTarget,physicalDropPoint,type CompositionDropGeometry } from "../lib/composition-drop-geometry";

const geometry:CompositionDropGeometry={rect:{left:100,right:1100,top:100,bottom:500},scrollLeft:600,inset:48,scale:2,
  newTrack:{left:100,right:1500,top:130,bottom:154},
  lanes:[{trackId:"V1",kind:"visual",locked:false,rect:{left:100,right:1500,top:200,bottom:260}},
    {trackId:"V2",kind:"visual",locked:true,rect:{left:100,right:1500,top:260,bottom:320}},
    {trackId:"A1",kind:"audio",locked:false,rect:{left:100,right:1500,top:320,bottom:380}}]};

it("usa a posição CSS, gutter, respiro e rolagem sem limitar ao fim atual",()=>{
  expect(compositionDropTarget(geometry,{x:492,y:230},"image")).toEqual({frame:400,trackId:"V1"});
  expect(compositionDropTarget({...geometry,scale:4},{x:492,y:230},"video")).toEqual({frame:200,trackId:"V1"});
  expect(compositionDropTarget({...geometry,inset:24},{x:492,y:230},"video")).toEqual({frame:412,trackId:"V1"});
});

it("rejeita cabeçalho, fora do viewport, faixa bloqueada e tipo incompatível",()=>{
  for(const [x,y,kind] of [[200,230,"image"],[1120,230,"image"],[492,290,"video"],[492,350,"image"],[492,230,"audio"]] as const)
    expect(compositionDropTarget(geometry,{x,y},kind)).toBeNull();
  expect(compositionDropTarget(geometry,{x:492,y:350},"audio")).toEqual({frame:400,trackId:"A1"});
  expect(compositionDropTarget(geometry,{x:492,y:140},"image")).toEqual({frame:400,trackId:null});
  expect(compositionDropTarget(geometry,{x:492,y:140},"audio")).toEqual({frame:400,trackId:null});
});

it("converte physical em CSS uma vez em DPI e zoom diferentes",()=>{
  for(const ratio of [1,1.25,1.5,1.875,2]){
    const point=physicalDropPoint({x:492*ratio,y:230*ratio},ratio)!;
    expect(compositionDropTarget(geometry,point,"image")).toEqual({frame:400,trackId:"V1"});
  }
  expect(physicalDropPoint({x:1,y:2},0)).toBeNull();
  expect(physicalDropPoint({x:Infinity,y:2},1)).toBeNull();
});
