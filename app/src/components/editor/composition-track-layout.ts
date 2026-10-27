import type { CompositionItem } from "../../lib/composition-types";

export const compactItemThreshold=20;

export function trackDisplayEnd(items:ReadonlyArray<Pick<CompositionItem,"startFrame"|"durationFrames">>,scale:number,inset:number,compact=true):number{
  return items.reduce((end,item)=>{
    const width=item.durationFrames*scale;
    return Math.max(end,inset+item.startFrame*scale+(compact&&width<compactItemThreshold?24:Math.max(3,width)));
  },inset);
}
