import { act, useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCompositionCommands } from "../hooks/useCompositionCommands";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";
import type { Composition } from "../lib/composition-types";
import { compositionDuration } from "../lib/composition";

let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async()=>{ await mounted?.close(); mounted=undefined; });
function fixture() {
  const data=emptyWorkspace();
  data.media={kind:"local",mediaId:"source",name:"source.mp4",duration:10,width:1920,height:1080,videoId:null,url:null};
  return compositionFromLegacy(data);
}
describe("comandos da montagem",()=>{
  it("Espaço sobre um botão não é capturado como Play da montagem",async()=>{
    const document=fixture();const play=vi.fn();
    function Probe(){useCompositionCommands({document,selected:[],frame:0,range:null,onChange:vi.fn(),onSelect:vi.fn(),onRange:vi.fn(),onSeek:vi.fn(),onError:vi.fn(),onSave:vi.fn(),onUndo:vi.fn(),onRedo:vi.fn(),onTogglePlay:play});return <button type="button">Salvar</button>;}
    mounted=await reactHost(<Probe/>);
    const button=mounted.host.querySelector("button")!;
    const event=new window.KeyboardEvent("keydown",{key:" ",bubbles:true,cancelable:true});
    await act(async()=>{button.focus();button.dispatchEvent(event);});
    expect(play).not.toHaveBeenCalled();expect(event.defaultPrevented).toBe(false);
  });
  it("não exclui itens quando o foco está fora do editor",async()=>{
    const document=fixture();const change=vi.fn();
    function Probe(){const scope=useRef<HTMLElement|null>(null);useCompositionCommands({document,selected:[document.items[0].id],frame:30,range:null,scope,onChange:change,onSelect:vi.fn(),onRange:vi.fn(),onSeek:vi.fn(),onError:vi.fn(),onSave:vi.fn(),onUndo:vi.fn(),onRedo:vi.fn(),onTogglePlay:vi.fn()});return <><section ref={scope} tabIndex={-1}>Editor</section><button type="button">Navegação</button></>;}
    mounted=await reactHost(<Probe/>);
    await act(async()=>{const outside=mounted!.host.querySelector<HTMLButtonElement>("button")!;outside.focus();outside.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Delete",bubbles:true}));});
    expect(change).not.toHaveBeenCalled();
  });
  it("setas movimentam somente a timeline, sem interferir no visualizador",async()=>{
    const document=fixture();const seek=vi.fn();
    function Probe(){const scope=useRef<HTMLElement|null>(null);useCompositionCommands({document,selected:[],frame:30,range:null,scope,onChange:vi.fn(),onSelect:vi.fn(),onRange:vi.fn(),onSeek:seek,onError:vi.fn(),onSave:vi.fn(),onUndo:vi.fn(),onRedo:vi.fn(),onTogglePlay:vi.fn()});return <section ref={scope}><div data-editor-viewer="montage" tabIndex={0}>Visualizador</div><div data-editor-timeline tabIndex={0}>Timeline</div></section>;}
    mounted=await reactHost(<Probe/>);
    const viewer=mounted.host.querySelector<HTMLElement>('[data-editor-viewer]')!;const timeline=mounted.host.querySelector<HTMLElement>('[data-editor-timeline]')!;
    await act(async()=>{viewer.focus();viewer.dispatchEvent(new window.KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));});
    expect(seek).not.toHaveBeenCalled();
    await act(async()=>{timeline.focus();timeline.dispatchEvent(new window.KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));});
    expect(seek).toHaveBeenCalledWith(31);
  });
  it("Ctrl+D duplica o grupo com identidades novas sem salvar",async()=>{
    const document=fixture(); const change=vi.fn(); const save=vi.fn();
    function Probe(){useCompositionCommands({document,selected:[document.items[0].id],frame:30,range:null,onChange:change,onSelect:vi.fn(),onRange:vi.fn(),onSeek:vi.fn(),onError:vi.fn(),onSave:save,onUndo:vi.fn(),onRedo:vi.fn(),onTogglePlay:vi.fn()});return null;}
    mounted=await reactHost(<Probe/>);
    await act(async()=>{window.dispatchEvent(new window.KeyboardEvent("keydown",{key:"d",ctrlKey:true,cancelable:true}));});
    const next=change.mock.calls[0][0] as Composition;
    expect(next.items).toHaveLength(4);
    expect(new Set(next.items.map(item=>item.id)).size).toBe(4);
    expect(compositionDuration(next)).toBe(300);
    expect(next.items.every(item=>item.startFrame===0)).toBe(true);
    expect(next.items.filter(item=>document.items.some(original=>original.id===item.id))).toEqual(document.items);
    expect(change).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });
  it("Delete remove um intervalo e fecha o espaço; não intercepta texto",async()=>{
    const document=fixture(); const change=vi.fn();
    function Probe(){useCompositionCommands({document,selected:[],frame:30,range:{start:30,end:60},onChange:change,onSelect:vi.fn(),onRange:vi.fn(),onSeek:vi.fn(),onError:vi.fn(),onSave:vi.fn(),onUndo:vi.fn(),onRedo:vi.fn(),onTogglePlay:vi.fn()});return <input aria-label="Texto"/>;}
    mounted=await reactHost(<Probe/>);
    await act(async()=>{mounted!.host.querySelector("input")!.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Delete",bubbles:true}));});
    expect(change).not.toHaveBeenCalled();
    await act(async()=>{window.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Delete"}));});
    expect((change.mock.calls[0][0] as Composition).items.filter(item=>item.kind==="video").reduce((sum,item)=>sum+item.durationFrames,0)).toBe(270);
  });
  it("copiar e colar preserva o intervalo da fonte e seleciona os itens novos",async()=>{
    const document=fixture(); const change=vi.fn(); const select=vi.fn();
    let commands:ReturnType<typeof useCompositionCommands>;
    function Probe(){commands=useCompositionCommands({document,selected:[],frame:120,range:{start:30,end:60},onChange:change,onSelect:select,onRange:vi.fn(),onSeek:vi.fn(),onError:vi.fn(),onSave:vi.fn(),onUndo:vi.fn(),onRedo:vi.fn(),onTogglePlay:vi.fn()});return null;}
    mounted=await reactHost(<Probe/>);
    await act(async()=>{commands.copy();});
    expect(change).not.toHaveBeenCalled();
    await act(async()=>{commands.paste();});
    const next=change.mock.calls[0][0] as Composition;
    const pasted=next.items.find(item=>item.kind==="video" && item.startFrame===120)!;
    expect(pasted.sourceStartUs).toBe(1_000_000);
    expect(pasted.sourceEndUs).toBe(2_000_000);
    expect(compositionDuration(next)).toBe(300);
    expect(next.items.filter(item=>document.items.some(original=>original.id===item.id))).toEqual(document.items);
    expect(select).toHaveBeenCalledWith(expect.arrayContaining([pasted.id]));
  });
  it("Ctrl+Shift+V mantém inserção sequencial explícita enquanto Ctrl+V sobrepõe",async()=>{
    const document=fixture();const change=vi.fn();
    function Probe(){useCompositionCommands({document,selected:[],frame:120,range:{start:30,end:60},onChange:change,onSelect:vi.fn(),onRange:vi.fn(),onSeek:vi.fn(),onError:vi.fn(),onSave:vi.fn(),onUndo:vi.fn(),onRedo:vi.fn(),onTogglePlay:vi.fn()});return null;}
    mounted=await reactHost(<Probe/>);
    await act(async()=>{window.dispatchEvent(new window.KeyboardEvent("keydown",{key:"c",ctrlKey:true,cancelable:true}));});
    await act(async()=>{window.dispatchEvent(new window.KeyboardEvent("keydown",{key:"v",ctrlKey:true,shiftKey:true,cancelable:true}));});
    expect(compositionDuration(change.mock.calls[0][0] as Composition)).toBe(330);
    change.mockClear();
    await act(async()=>{window.dispatchEvent(new window.KeyboardEvent("keydown",{key:"v",ctrlKey:true,cancelable:true}));});
    expect(compositionDuration(change.mock.calls[0][0] as Composition)).toBe(300);
    expect(change).toHaveBeenCalledTimes(1);
  });
  it("mantém uma cópia isolada entre projetos e remontagens do editor",async()=>{
    const source=fixture();const change=vi.fn();let commands:ReturnType<typeof useCompositionCommands>;
    function Probe({document}:{document:Composition}){commands=useCompositionCommands({document,selected:[document.items[0]?.id].filter(Boolean),frame:0,range:null,onChange:change,onSelect:vi.fn(),onRange:vi.fn(),onSeek:vi.fn(),onError:vi.fn(),onSave:vi.fn(),onUndo:vi.fn(),onRedo:vi.fn(),onTogglePlay:vi.fn()});return null;}
    mounted=await reactHost(<Probe document={source}/>);
    await act(async()=>{commands.copy();});
    source.assets[0].name="alterada.mp4";
    await mounted.render(<span/>);
    const destination=compositionFromLegacy(emptyWorkspace());
    await mounted.render(<Probe document={destination}/>);
    expect(commands!.canPaste).toBe(true);
    await act(async()=>{commands.paste();});
    const pasted=change.mock.calls[0][0] as Composition;
    expect(pasted.assets[0].name).toBe("source.mp4");
    expect(pasted.items).toHaveLength(2);
    expect(pasted.items[0].id).not.toBe(source.items[0].id);
  });
  it("não recorta quando a cópia atual falha ou não contém seleção",async()=>{
    const document=fixture();const change=vi.fn();const error=vi.fn();let commands:ReturnType<typeof useCompositionCommands>;
    function Probe({selected,range}:{selected:string[];range:{start:number;end:number}|null}){commands=useCompositionCommands({document,selected,frame:0,range,onChange:change,onSelect:vi.fn(),onRange:vi.fn(),onSeek:vi.fn(),onError:error,onSave:vi.fn(),onUndo:vi.fn(),onRedo:vi.fn(),onTogglePlay:vi.fn()});return null;}
    mounted=await reactHost(<Probe selected={[document.items[0].id]} range={null}/>);
    await act(async()=>{commands.copy();});
    await mounted.render(<Probe selected={[]} range={null}/>);
    await act(async()=>{commands.cut();});
    expect(change).not.toHaveBeenCalled();
    await mounted.render(<Probe selected={[]} range={{start:0,end:99999}}/>);
    await act(async()=>{commands.cut();});
    expect(error).toHaveBeenCalledWith("Intervalo inválido");
    expect(change).not.toHaveBeenCalled();
  });
});
