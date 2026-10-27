import { useId,useState,type CSSProperties } from "react";
import { EditorPopover } from "./EditorPopover";
import { EditorNameField } from "./EditorNameField";
import { markerColors } from "../../lib/composition-markers";
import { formatCompositionTimecode,parseCompositionPosition } from "../../lib/composition-timecode";
import type { CompositionMarker,FrameRate } from "../../lib/composition-types";

interface Props {marker:CompositionMarker;fps:FrameRate;x:number;y:number;onClose:()=>void;onApply:(patch:Pick<CompositionMarker,"name"|"frame"|"color">)=>void;onRemove:()=>void}
export function CompositionMarkerEditor({marker,fps,x,y,onClose,onApply,onRemove}:Props){
  const id=useId();
  const [name,setName]=useState(marker.name),[time,setTime]=useState(formatCompositionTimecode(marker.frame,fps));
  const [color,setColor]=useState(marker.color),[error,setError]=useState("");
  return <EditorPopover label="Editar marcador" x={x} y={y} onClose={onClose}>
    <form onSubmit={event=>{
      event.preventDefault();
      try{onApply({name:name.trim(),frame:parseCompositionPosition(time,fps),color});}
      catch(cause){setError(cause instanceof Error?cause.message:"Não foi possível alterar o marcador.");}
    }}>
      <EditorNameField id={`${id}-name`} label="Nome" value={name} onChange={value=>{setName(value);setError("");}} invalid={Boolean(error)} describedBy={error?`${id}-error`:undefined}/>
      <label htmlFor={`${id}-time`}>Posição<input id={`${id}-time`} value={time} maxLength={24} onChange={event=>{setTime(event.target.value);setError("");}} inputMode="decimal" aria-invalid={Boolean(error)} aria-describedby={`${id}-hint${error?` ${id}-error`:""}`} autoComplete="off"/></label>
      <span id={`${id}-hint`} className="sr-only">Minutos, segundos e milissegundos. Exemplo: 03:01.250.</span>
      <div className="editor-popover__colors" role="group" aria-label="Cor do marcador">{markerColors.map(value=><button key={value} type="button" className="editor-popover__color" aria-label={`Cor ${value}`} aria-pressed={color.toUpperCase()===value}
        style={{"--swatch":value} as CSSProperties} onClick={()=>setColor(value)}><span aria-hidden="true"/></button>)}</div>
      {error&&<p id={`${id}-error`} className="editor-popover__error" role="alert">{error}</p>}
      <div className="editor-popover__actions"><button className="flow-button dialog-action--primary" type="submit">Concluir</button><button className="flow-button dialog-action--danger" type="button" onClick={onRemove}>Excluir</button></div>
    </form>
  </EditorPopover>;
}
