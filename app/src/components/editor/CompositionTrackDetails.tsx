import { useId, useState, type CSSProperties } from "react";
import type { CompositionTrack } from "../../lib/composition-types";
import { markerColors } from "../../lib/composition-markers";
import { EditorPopover } from "./EditorPopover";
import { EditorNameField } from "./EditorNameField";

interface Props {
  track:CompositionTrack;x:number;y:number;onClose:()=>void;
  onChange:(patch:{name:string;color?:string})=>void;
}

export function CompositionTrackDetails({track,x,y,onClose,onChange}:Props){
  const id=useId();
  const [name,setName]=useState(track.name);
  const [color,setColor]=useState(track.color);
  const [error,setError]=useState("");
  return <EditorPopover label="Editar faixa" x={x} y={y} onClose={onClose} width={264}>
    <form className="composition-track-details" onSubmit={event=>{
      event.preventDefault();
      const value=name.trim();
      if(!value||Array.from(value).length>120){setError("Use um nome de 1 a 120 caracteres.");return;}
      if(value!==track.name||color!==track.color)onChange({name:value,...(color===undefined?{}:{color})});
      onClose();
    }}>
      <EditorNameField id={`${id}-name`} label="Nome da faixa" value={name} onChange={value=>{setName(value);setError("");}} invalid={Boolean(error)} describedBy={error?`${id}-error`:undefined} autoFocus/>
      <fieldset className="editor-popover__colors" aria-label="Cor da faixa">
        <legend>Cor</legend>
        {markerColors.map(value=><button key={value} type="button" className="editor-popover__color" aria-label={`Cor ${value}`} aria-pressed={color?.toUpperCase()===value}
          style={{"--swatch":value} as CSSProperties} onClick={()=>setColor(value)}><span aria-hidden="true"/></button>)}
      </fieldset>
      {error&&<p id={`${id}-error`} role="alert" className="editor-popover__error">{error}</p>}
      <div className="editor-popover__actions"><button type="submit" className="flow-button dialog-action--primary">Concluir</button></div>
    </form>
  </EditorPopover>;
}
