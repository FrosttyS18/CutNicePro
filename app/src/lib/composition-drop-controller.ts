import type { CompositionDropTarget } from "./composition-asset-drop";
import type { CompositionDropPoint } from "./composition-drop-geometry";
import type { MediaKind } from "./composition-types";

export interface CompositionTimelineDropController{
  contains:(point:CompositionDropPoint)=>boolean;
  resolve:(point:CompositionDropPoint,kind:MediaKind)=>CompositionDropTarget|null;
  hover:(point:CompositionDropPoint,kind:MediaKind)=>CompositionDropTarget|null;
  clear:()=>void;
}
