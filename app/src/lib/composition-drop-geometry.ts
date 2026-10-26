import type { MediaKind } from "./composition-types";
import type { CompositionDropTarget } from "./composition-asset-drop";

export interface CompositionDropPoint{x:number;y:number}
interface Rect{left:number;right:number;top:number;bottom:number}
interface Lane{rect:Rect;trackId:string;kind:"visual"|"audio"|"caption";locked:boolean}
export interface CompositionDropGeometry{
  rect:Rect;scrollLeft:number;inset:number;scale:number;lanes:Lane[];newTrack?:Rect;
}
export function containsDropPoint(rect:Rect,point:CompositionDropPoint):boolean{
  return rect.right>rect.left&&rect.bottom>rect.top&&point.x>=rect.left&&point.x<rect.right&&point.y>=rect.top&&point.y<rect.bottom;
}
export function physicalDropPoint(point:CompositionDropPoint,pixelRatio:number):CompositionDropPoint|null{
  if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||!Number.isFinite(pixelRatio)||pixelRatio<=0)return null;
  return {x:point.x/pixelRatio,y:point.y/pixelRatio};
}
export function compositionDropTarget(geometry:CompositionDropGeometry,point:CompositionDropPoint,kind:MediaKind):CompositionDropTarget|null{
  if(!containsDropPoint(geometry.rect,point)||point.x<geometry.rect.left+144||!Number.isFinite(geometry.scale)||geometry.scale<=0)return null;
  const frame=Math.round((point.x-geometry.rect.left+geometry.scrollLeft-144-geometry.inset)/geometry.scale);
  if(!Number.isSafeInteger(frame))return null;
  if(geometry.newTrack&&containsDropPoint(geometry.newTrack,point))return {frame:Math.max(0,frame),trackId:null};
  const lane=geometry.lanes.find(lane=>containsDropPoint(lane.rect,point));
  if(!lane||lane.locked||lane.kind!==(kind==="audio"?"audio":"visual"))return null;
  return {frame:Math.max(0,frame),trackId:lane.trackId};
}
