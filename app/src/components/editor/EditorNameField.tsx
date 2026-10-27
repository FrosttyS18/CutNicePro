import { useId } from "react";
import { compositionNameLimit } from "../../lib/composition-text";

interface Props {id:string;label:string;value:string;onChange:(value:string)=>void;invalid?:boolean;describedBy?:string;autoFocus?:boolean}
export function EditorNameField({id,label,value,onChange,invalid,describedBy,autoFocus}:Props){
  const countId=useId();
  return <div className="editor-name-field">
    <label htmlFor={id}>{label}<input id={id} aria-label={label} value={value} maxLength={compositionNameLimit*2} aria-invalid={invalid} aria-describedby={[countId,describedBy].filter(Boolean).join(" ")}
      autoComplete="off" autoFocus={autoFocus} onInput={event=>{
        const next=Array.from(event.currentTarget.value).slice(0,compositionNameLimit).join("");
        if(event.currentTarget.value!==next)event.currentTarget.value=next;
        onChange(next);
      }}/></label>
    <span id={countId} className="editor-name-field__count">{Array.from(value).length}/{compositionNameLimit} caracteres</span>
  </div>;
}
