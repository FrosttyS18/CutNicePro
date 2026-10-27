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

it("destina à principal fixa quando ela encobre outras faixas ou a zona de nova camada",()=>{
  const overlap={left:100,right:1500,top:200,bottom:260};
  const sticky:CompositionDropGeometry={...geometry,newTrack:overlap,lanes:[
    {...geometry.lanes[1],locked:false,rect:overlap},
    {...geometry.lanes[0],primary:true,rect:overlap},
  ]};
  expect(compositionDropTarget(sticky,{x:492,y:230},"video")).toEqual({frame:400,trackId:"V1"});
  expect(compositionDropTarget({...sticky,lanes:sticky.lanes.map(lane=>lane.primary?{...lane,locked:true}:lane)},{x:492,y:230},"video")).toBeNull();
  expect(compositionDropTarget(sticky,{x:492,y:230},"audio")).toBeNull();
});

it("aceita toda área útil vazia e usa a principal em vez de exigir a faixa azul",()=>{
  const expanded={...geometry,lanes:geometry.lanes.map((lane,index)=>({...lane,primary:index===0}))};
  for(const y of [160,190,400,480]){
    expect(compositionDropTarget(expanded,{x:492,y},"video")).toEqual({frame:400,trackId:"V1"});
    expect(compositionDropTarget(expanded,{x:492,y},"image")).toEqual({frame:400,trackId:"V1"});
    expect(compositionDropTarget(expanded,{x:492,y},"audio")).toEqual({frame:400,trackId:null});
  }
});

it("área vazia sem principal utilizável cria camada e mantém drop explícito bloqueado",()=>{
  const locked={...geometry,lanes:geometry.lanes.map((lane,index)=>({...lane,primary:index===0,locked:true}))};
  expect(compositionDropTarget(locked,{x:492,y:420},"image")).toEqual({frame:400,trackId:null});
  expect(compositionDropTarget(locked,{x:492,y:230},"image")).toBeNull();
  expect(compositionDropTarget({...geometry,lanes:[]},{x:492,y:420},"video")).toEqual({frame:400,trackId:null});
});

it("canvas vazio cria camada quando a principal já tem conteúdo mesmo após o fim",()=>{
  const occupied={...geometry,lanes:geometry.lanes.map((lane,index)=>({...lane,primary:index===0,occupied:index===0}))};
  expect(compositionDropTarget(occupied,{x:492,y:420},"video")).toEqual({frame:400,trackId:null});
  expect(compositionDropTarget(occupied,{x:492,y:420},"image")).toEqual({frame:400,trackId:null});
  expect(compositionDropTarget(occupied,{x:492,y:230},"video")).toEqual({frame:400,trackId:"V1"});
});

it("exclui régua e cabeçalho da área útil sem perder cálculo de scroll",()=>{
  const content={...geometry,contentTop:154,lanes:geometry.lanes.map((lane,index)=>({...lane,primary:index===0}))};
  expect(compositionDropTarget(content,{x:492,y:120},"image")).toBeNull();
  expect(compositionDropTarget(content,{x:492,y:153},"image")).toBeNull();
  expect(compositionDropTarget(content,{x:492,y:154},"image")).toEqual({frame:400,trackId:"V1"});
  expect(compositionDropTarget({...content,scrollLeft:0},{x:244,y:154},"image")).toEqual({frame:0,trackId:"V1"});
});
