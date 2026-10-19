import { useId, useState } from "react";
import { effectiveCaptionStyle, type CaptionStyle } from "../../lib/captions";
import { FloatingPanel } from "../workspace/FloatingPanel";
import { CaptionPresetGrid } from "./CaptionPresetGrid";
import { CaptionFontControls } from "./CaptionFontControls";
import { CaptionEffectControls } from "./CaptionEffectControls";
import { CaptionVisual } from "./CaptionVisual";
import "./captions.css";

interface Props { open:boolean; model:number; style?:CaptionStyle; onModel:(model:number)=>void; onStyle:(change:Partial<CaptionStyle>)=>void; onClose:()=>void }
const tabs=[{id:"presets",label:"Predefinições"},{id:"font",label:"Fonte"},{id:"effects",label:"Efeitos"}] as const;
export function CaptionPresetsDialog({open,model,style,onModel,onStyle,onClose}:Props) {
  const [tab,setTab]=useState<typeof tabs[number]["id"]>("presets");
  const id=useId();
  const selected=effectiveCaptionStyle(model,style);
  return <FloatingPanel open={open} title="Legendas" className="caption-editor-dialog" onClose={onClose}>
    <div className="caption-tabs" role="tablist" aria-label="Configurações de legenda">
      {tabs.map((item,index)=><button type="button" role="tab" key={item.id} id={`${id}-${item.id}`} aria-selected={tab===item.id}
        aria-controls={`${id}-panel`} tabIndex={tab===item.id?0:-1} onClick={()=>setTab(item.id)}
        onKeyDown={event=>{ const next=event.key==="ArrowRight"?(index+1)%tabs.length:event.key==="ArrowLeft"?(index+tabs.length-1)%tabs.length:event.key==="Home"?0:event.key==="End"?tabs.length-1:-1;
          if(next>=0){event.preventDefault();setTab(tabs[next].id);document.getElementById(`${id}-${tabs[next].id}`)?.focus();} }}>{item.label}</button>)}
    </div>
    <div className="caption-tab-panel" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`}>
      {tab==="presets"?<CaptionPresetGrid model={model} onModel={onModel}/>:<>
        <div className="caption-current-sample" aria-label="Amostra da legenda"><CaptionVisual sample style={selected}
          cue={{words:[{text:"Suas ideias",active:false,spoken:true},{text:"ganham voz",active:true,spoken:false}]}}/></div>
        {tab==="font"?<CaptionFontControls style={selected} onChange={onStyle}/>:<CaptionEffectControls style={selected} onChange={onStyle}/>}
      </>}
    </div>
    <button type="button" className="upload-primary flow-wide" onClick={onClose}>Concluir</button>
  </FloatingPanel>;
}
