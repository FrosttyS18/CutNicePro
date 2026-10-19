import { useId } from "react";
import { captionPresets } from "../../lib/captions";
import { CaptionVisual } from "./CaptionVisual";

export function CaptionPresetGrid({model,onModel}:{model:number;onModel:(id:number)=>void}) {
  const id=useId();
  return <fieldset className="caption-preset-grid"><legend className="upload-sr-only">Estilo de legenda</legend>
    {captionPresets.map((preset,index)=><label key={preset.name}>
      <input type="radio" name={id} checked={model===index} onChange={()=>onModel(index)}/>
      <span className="caption-preset-grid__sample" aria-hidden="true">{index===0?
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/></svg>:
        <CaptionVisual sample style={preset.style} cue={{words:[{text:"Suas ideias",active:false,spoken:true},{text:"ganham voz",active:true,spoken:false}]}}/>}
      </span><span>{preset.name}</span>
    </label>)}
  </fieldset>;
}
