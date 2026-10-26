import { useRef, useState } from "react";
import { CursorIcon } from "@phosphor-icons/react/dist/csr/Cursor";
import { SelectionIcon } from "@phosphor-icons/react/dist/csr/Selection";
import { ScissorsIcon } from "@phosphor-icons/react/dist/csr/Scissors";
import { ArrowLineLeftIcon } from "@phosphor-icons/react/dist/csr/ArrowLineLeft";
import { ArrowLineRightIcon } from "@phosphor-icons/react/dist/csr/ArrowLineRight";
import { CopyIcon } from "@phosphor-icons/react/dist/csr/Copy";
import { ClipboardIcon } from "@phosphor-icons/react/dist/csr/Clipboard";
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { EditorAction } from "./EditorAction";
import { EditorMenu, type EditorMenuItem } from "./EditorMenu";

interface Props { mode:"select"|"range"; onMode:(mode:"select"|"range")=>void; selected:boolean; range:boolean;
  commands:{split:()=>void;duplicate:()=>void;copy:()=>void;cut:()=>void;paste:()=>void;remove:(ripple?:boolean)=>void;canPaste:boolean;trimLeft:()=>void;trimRight:()=>void;canTrimLeft:boolean;canTrimRight:boolean};
  addItems:EditorMenuItem[];
}
export function CompositionToolbar({mode,onMode,selected,range,commands,addItems}:Props){
  const anchor=useRef<HTMLDivElement>(null);
  const [menu,setMenu]=useState<{x:number;y:number}|null>(null);
  return <div className="composition-toolbar" role="toolbar" aria-label="Edição da montagem">
    <EditorAction compact label="Selecionar (V)" pressed={mode==="select"} icon={<CursorIcon size={17}/>} onClick={()=>onMode("select")}/>
    <EditorAction compact label="Marcar intervalo (R)" pressed={mode==="range"} icon={<SelectionIcon size={17}/>} onClick={()=>onMode("range")}/>
    <span className="composition-toolbar__divider" aria-hidden="true"/>
    <EditorAction compact label="Dividir no cursor (Ctrl+B)" icon={<ScissorsIcon size={17}/>} onClick={commands.split}/>
    <EditorAction compact label="Excluir à esquerda do cursor (Q)" disabled={!commands.canTrimLeft} icon={<ArrowLineLeftIcon size={17}/>} onClick={commands.trimLeft}/>
    <EditorAction compact label="Excluir à direita do cursor (W)" disabled={!commands.canTrimRight} icon={<ArrowLineRightIcon size={17}/>} onClick={commands.trimRight}/>
    <EditorAction compact label="Duplicar (Ctrl+D)" disabled={!selected} icon={<CopyIcon size={17}/>} onClick={commands.duplicate}/>
    <EditorAction compact label="Copiar (Ctrl+C)" disabled={!selected&&!range} icon={<CopyIcon size={17}/>} onClick={commands.copy}/>
    <EditorAction compact label="Colar no cursor (Ctrl+V)" disabled={!commands.canPaste} icon={<ClipboardIcon size={17}/>} onClick={commands.paste}/>
    <EditorAction compact label="Excluir e fechar espaço (Delete)" disabled={!selected&&!range} icon={<TrashIcon size={17}/>} onClick={()=>commands.remove()}/>
    <div ref={anchor} className="composition-toolbar__add"><EditorAction compact label="Adicionar" icon={<PlusIcon size={17} aria-hidden="true"/>} onClick={()=>{const rect=anchor.current!.getBoundingClientRect();setMenu({x:rect.left,y:rect.bottom+8});}}/></div>
    {menu && <EditorMenu label="Adicionar à montagem" {...menu} items={addItems} onClose={()=>setMenu(null)}/>}
  </div>;
}
