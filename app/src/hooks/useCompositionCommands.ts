import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import { compositionDuration, itemEnd } from "../lib/composition";
import { removeRange, removeSelection, splitSelection } from "../lib/composition-edit";
import { duplicateSelection, extractComposition, insertComposition, overlayComposition } from "../lib/composition-insert";
import { linkedSelection } from "../lib/composition-operations";
import { canTrimSelectionAtPlayhead, trimSelectionAtPlayhead } from "../lib/composition-trim";
import { hasCompositionClipboard, readCompositionClipboard, subscribeCompositionClipboard, writeCompositionClipboard } from "../lib/composition-clipboard";
import type { Composition } from "../lib/composition-types";

interface Range { start: number; end: number }
interface Props {
  document: Composition; selected: string[]; frame: number; range: Range | null;
  onChange: (value: Composition) => void; onSelect: (ids: string[]) => void;
  onRange: (value: Range | null) => void; onSeek: (frame: number) => void;
  onError: (message: string) => void; onSave: () => unknown; onUndo: () => void;
  onRedo: () => void; onTogglePlay: () => void; enabled?: boolean;
  scope?:RefObject<HTMLElement|null>;
}
const commandInputSelector='input,textarea,select,[contenteditable="true"],[role="dialog"],dialog,[role="menu"],[data-editor-viewer="source"]';
const playbackInputSelector=`${commandInputSelector},[contenteditable]:not([contenteditable="false"]),[role="textbox"]`;
export function useCompositionCommands(props: Props) {
  const latest=useRef(props);
  useLayoutEffect(()=>{latest.current=props;},[props]);
  const canPaste=useSyncExternalStore(subscribeCompositionClipboard,hasCompositionClipboard,hasCompositionClipboard);
  const run=useCallback((operation:(current:Props)=>boolean|void)=>{
    try { operation(latest.current); }
    catch(error){latest.current.onError(error instanceof Error ? error.message : "Não foi possível editar a montagem");}
  },[]);
  const copy=useCallback(()=>{
    try {
      const {document,range,selected}=latest.current;
      const items=linkedSelection(document,selected);
      if(range && range.end>range.start) return writeCompositionClipboard(extractComposition(document,range.start,range.end));
      if(!items.length)return false;
      const start=Math.min(...items.map(item=>item.startFrame));
      const end=Math.max(...items.map(itemEnd));
      return writeCompositionClipboard(extractComposition({...document,items},start,end));
    } catch(error){
      latest.current.onError(error instanceof Error ? error.message : "Não foi possível copiar a montagem");
      return false;
    }
  },[]);
  const remove=useCallback((ripple=true)=>run(current=>{
    const {document,range,selected}=current;
    const next=range && range.end>range.start ? removeRange(document,range.start,range.end,ripple) : removeSelection(document,selected,ripple);
    current.onChange(next); current.onSelect([]); current.onRange(null);
    current.onSeek(Math.min(current.frame,compositionDuration(next)));
  }),[run]);
  const cut=useCallback(()=>{if(copy())remove();},[copy,remove]);
  const pasteWith=useCallback((mode:"overlay"|"sequence")=>run(current=>{
    const fragment=readCompositionClipboard();
    if(!fragment)return;
    const next=mode==="sequence" ? insertComposition(current.document,fragment,current.frame) : overlayComposition(current.document,fragment,current.frame);
    const existing=new Set(current.document.items.map(item=>item.id));
    current.onChange(next);current.onRange(null);current.onSelect(next.items.filter(item=>!existing.has(item.id)).map(item=>item.id));
  }),[run]);
  const paste=useCallback(()=>pasteWith("overlay"),[pasteWith]);
  const pasteInSequence=useCallback(()=>pasteWith("sequence"),[pasteWith]);
  const duplicate=useCallback(()=>run(current=>{
    const next=duplicateSelection(current.document,current.selected);
    const existing=new Set(current.document.items.map(item=>item.id));
    current.onChange(next);current.onSelect(next.items.filter(item=>!existing.has(item.id)).map(item=>item.id));
  }),[run]);
  const split=useCallback(()=>run(current=>{
    if(current.enabled===false)return;
    const ids=current.selected.length ? current.selected : current.document.items.filter(item=>item.startFrame<current.frame && itemEnd(item)>current.frame).map(item=>item.id);
    const next=splitSelection(current.document,ids,current.frame);
    if(next===current.document)return;
    current.onChange(next);current.onRange(null);
  }),[run]);
  const trimAt=useCallback((side:"left"|"right")=>run(current=>{
    if(current.enabled===false)return;
    const next=trimSelectionAtPlayhead(current.document,current.selected,current.frame,side);
    if(next===current.document)return;
    current.onChange(next);current.onRange(null);
    current.onSelect(current.selected.filter(id=>next.items.some(item=>item.id===id)));
  }),[run]);
  const trimLeft=useCallback(()=>trimAt("left"),[trimAt]);
  const trimRight=useCallback(()=>trimAt("right"),[trimAt]);
  useEffect(()=>{
    const modalOpen=()=>Boolean(document.querySelector('dialog[open]:not([data-modeless]),[aria-modal="true"]'));
    const captureSpace=(event:KeyboardEvent)=>{
      const current=latest.current;
      if(event.key!==" "||current.enabled===false||event.defaultPrevented||event.isComposing||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;
      const target=event.target instanceof HTMLElement?event.target:null;
      if(!target||!current.scope?.current?.contains(target)||!target.closest('[data-editor-timeline]')||target.closest(playbackInputSelector)||modalOpen())return;
      event.preventDefault();event.stopPropagation();
      if(!event.repeat)current.onTogglePlay();
    };
    const handle=(event:KeyboardEvent)=>{
      const current=latest.current;
      if(current.enabled===false || event.defaultPrevented)return;
      const target=event.target instanceof HTMLElement ? event.target : null;
      if(current.scope?.current && !current.scope.current.contains(target) && !current.scope.current.contains(document.activeElement))return;
      if(target?.closest(commandInputSelector))return;
      const key=event.key.toLowerCase(); const control=event.ctrlKey||event.metaKey;
      if(key===" "){
        if(event.isComposing||control||event.altKey||event.shiftKey||target?.closest(`${playbackInputSelector},button,[role="button"],a[href]`)||modalOpen())return;
        if(event.repeat){event.preventDefault();return;}
      }
      let action:(()=>unknown)|undefined;
      if(control){
        if(key==="d")action=duplicate;
        else if(key==="b")action=split;
        else if(key==="c")action=copy;
        else if(key==="x")action=cut;
        else if(key==="v")action=event.shiftKey ? pasteInSequence : paste;
        else if(key==="s")action=current.onSave;
        else if(key==="z")action=event.shiftKey ? current.onRedo : current.onUndo;
        else if(key==="y")action=current.onRedo;
        else if(key==="a")action=()=>current.onSelect(current.document.items.map(item=>item.id));
      } else if(key==="delete"||key==="backspace")action=()=>remove(!event.shiftKey);
      else if((key==="q"||key==="w")&&!event.altKey&&!event.shiftKey)action=key==="q"?trimLeft:trimRight;
      else if(key===" ")action=current.onTogglePlay;
      else if(key==="escape")action=()=>{current.onRange(null);current.onSelect([]);};
      else if(key==="i"&&compositionDuration(current.document)>0)action=()=>{const start=Math.min(current.frame,compositionDuration(current.document)-1);current.onRange({start,end:Math.min(compositionDuration(current.document),Math.max(start+1,current.range?.end??compositionDuration(current.document)))});};
      else if(key==="o"&&current.frame>0)action=()=>current.onRange({start:Math.max(0,Math.min(current.range?.start??0,current.frame-1)),end:current.frame});
      else if((key==="arrowleft"||key==="arrowright") && target?.closest('[data-editor-timeline]'))action=()=>current.onSeek(Math.max(0,Math.min(compositionDuration(current.document),current.frame+(key==="arrowleft"?-1:1)*(event.shiftKey?10:1))));
      if(action){event.preventDefault();void action();}
    };
    window.addEventListener("keydown",captureSpace,true);
    window.addEventListener("keydown",handle);
    return()=>{window.removeEventListener("keydown",captureSpace,true);window.removeEventListener("keydown",handle);};
  },[copy,cut,duplicate,paste,pasteInSequence,remove,split,trimLeft,trimRight]);
  const canTrim=props.enabled!==false&&canTrimSelectionAtPlayhead(props.document,props.selected,props.frame);
  return {copy,cut,paste,pasteInSequence,duplicate,remove,split,canPaste,trimLeft,trimRight,canTrimLeft:canTrim,canTrimRight:canTrim};
}
