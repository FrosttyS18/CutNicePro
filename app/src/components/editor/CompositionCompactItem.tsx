import { useRef, type PointerEvent } from "react";
import { MagnifyingGlassPlusIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlassPlus";
import { useEditorTooltip } from "../../hooks/useEditorTooltip";

interface Props {
  name:string;
  image?:string;
  onBegin:(event:PointerEvent<HTMLElement>)=>void;
  onReveal:()=>void;
}

export function CompositionCompactItem({name,image,onBegin,onReveal}:Props){
  const anchor=useRef<HTMLButtonElement>(null);
  const tooltip=useEditorTooltip(anchor,`${name} · Duplo clique ou Enter para ampliar o trecho`);
  const reveal=()=>{tooltip.hide();onReveal();};
  return <>
    <button ref={anchor} type="button" className="composition-item__compact" aria-label={`Ampliar trecho: ${name}`}
      aria-describedby={tooltip.descriptionId} {...tooltip.trigger} onPointerDown={onBegin} onDoubleClick={reveal}
      onKeyDown={event=>{
        tooltip.trigger.onKeyDown(event);
        if(event.key==="Enter"){event.preventDefault();event.stopPropagation();reveal();}
      }}>
      {image&&<img src={image} alt="" loading="lazy" decoding="async"/>}
      <MagnifyingGlassPlusIcon size={15} aria-hidden="true"/>
    </button>
    {tooltip.portal}
  </>;
}
