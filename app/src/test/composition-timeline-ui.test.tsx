import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompositionTimeline } from "../components/editor/CompositionTimeline";
import { emptyWorkspace } from "../lib/workspace";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { splitSelection } from "../lib/composition-edit";
import type { Composition } from "../lib/composition-types";
import { reactHost } from "./react-host";

let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await mounted?.close(); mounted = undefined; });
function fixture() {
  const workspace = emptyWorkspace();
  workspace.media = { kind: "local", mediaId: "source", name: "video.mp4", duration: 60, width: 1920, height: 1080, videoId: null, url: null };
  workspace.settings.trimStart=10; workspace.settings.trimEnd=12;
  return compositionFromLegacy(workspace);
}
async function mount(document: Composition, change = vi.fn()) {
  mounted = await reactHost(<CompositionTimeline document={document} frame={0} selected={[document.items[0].id]} mode="select" range={null}
    onSelect={() => undefined} onRange={() => undefined} onSeek={() => undefined} onChange={change} onPreview={() => undefined} onError={() => undefined} />);
  return mounted;
}
describe("timeline da montagem", () => {
  it("cancela o frame pendente quando solta o cursor",async()=>{
    const pending=new Map<number,FrameRequestCallback>();let token=0;
    mounted=await reactHost(<CompositionTimeline document={fixture()} frame={0} selected={[]} mode="select" range={null}
      onSelect={vi.fn()} onRange={vi.fn()} onSeek={vi.fn()} onChange={vi.fn()} onPreview={vi.fn()} onError={vi.fn()}/>,environment=>{
      Object.defineProperty(environment,"requestAnimationFrame",{configurable:true,value:(callback:FrameRequestCallback)=>{pending.set(++token,callback);return token;}});
      Object.defineProperty(environment,"cancelAnimationFrame",{configurable:true,value:(id:number)=>{pending.delete(id);}});
    });
    const baseline=pending.size;
    const cursor=mounted.host.querySelector<HTMLElement>('[aria-label="Arrastar cursor da montagem"]')!;
    await act(async()=>{
      cursor.dispatchEvent(new window.MouseEvent("pointerdown",{button:0,clientX:200,bubbles:true}));
      window.dispatchEvent(new window.MouseEvent("pointermove",{clientX:220}));
      window.dispatchEvent(new window.MouseEvent("pointerup",{clientX:230}));
    });
    expect(pending.size).toBe(baseline);
  });
  it("amplia seleção por Shift e cancela um arrasto sem criar edição",async()=>{
    let document=fixture();const first=document.items[0].id;
    document=splitSelection(document,[first],20);
    document=splitSelection(document,[document.items.find(item=>item.kind==="video"&&item.startFrame===20)!.id],40);
    const select=vi.fn();const change=vi.fn();const preview=vi.fn();
    mounted=await reactHost(<CompositionTimeline document={document} frame={10} selected={[first]} mode="select" range={null}
      onSelect={select} onRange={vi.fn()} onSeek={vi.fn()} onChange={change} onPreview={preview} onError={vi.fn()}/>);
    const videos=Array.from(mounted.host.querySelectorAll<HTMLElement>('[data-composition-item][data-kind="video"]'));
    await act(async()=>{videos[2].dispatchEvent(new window.MouseEvent("pointerdown",{button:0,shiftKey:true,clientX:200,bubbles:true}));});
    expect(select).toHaveBeenLastCalledWith(videos.map(item=>item.dataset.compositionItem));
    await act(async()=>{
      videos[0].querySelector<HTMLElement>('[aria-label^="Ajustar fim"]')!.dispatchEvent(new window.MouseEvent("pointerdown",{button:0,clientX:0,bubbles:true}));
      window.dispatchEvent(new window.MouseEvent("pointermove",{clientX:100}));
      window.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Escape",cancelable:true}));
      window.dispatchEvent(new window.MouseEvent("pointerup",{clientX:200}));
    });
    expect(change).not.toHaveBeenCalled();
    expect(preview).toHaveBeenLastCalledWith(null,10);
  });
  it("limita alça pela fonte vinculada sem arredondar para fora",async()=>{
    const document=fixture();document.assets[0].durationUs=12_050_000;document.items[1].sourceEndUs=12_040_000;
    const error=vi.fn();const change=vi.fn();
    mounted=await reactHost(<CompositionTimeline document={document} frame={0} selected={[]} mode="select" range={null}
      onSelect={vi.fn()} onRange={vi.fn()} onSeek={vi.fn()} onChange={change} onPreview={vi.fn()} onError={error}/>);
    const edge=mounted.host.querySelector<HTMLElement>('[aria-label="Ajustar fim de video.mp4"]')!;
    await act(async()=>{
      edge.dispatchEvent(new window.MouseEvent("pointerdown",{button:0,clientX:0,bubbles:true}));
      window.dispatchEvent(new window.MouseEvent("pointerup",{clientX:1000}));
    });
    expect(error).not.toHaveBeenCalled();expect(change).not.toHaveBeenCalled();
  });
  it("busca um frame exato e não aplica zoom ao digitar no campo",async()=>{
    const seek=vi.fn();
    mounted=await reactHost(<CompositionTimeline document={fixture()} frame={5} selected={[]} mode="select" range={null}
      onSelect={vi.fn()} onRange={vi.fn()} onSeek={seek} onChange={vi.fn()} onPreview={vi.fn()} onError={vi.fn()}/>);
    await act(async()=>mounted!.host.querySelector<HTMLButtonElement>('[aria-label="Posição precisa"]')!.click());
    const cursor=mounted.host.querySelector<HTMLInputElement>('[aria-label="Cursor da montagem em frames"]')!;
    expect(cursor).toBeTruthy();
    await act(async()=>{cursor.focus();});
    await act(async()=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(cursor),"value")!.set!.call(cursor,"37");cursor.dispatchEvent(new window.Event("input",{bubbles:true}));cursor.dispatchEvent(new window.Event("change",{bubbles:true}));});
    expect(seek).toHaveBeenLastCalledWith(37);
    const content=mounted.host.querySelector<HTMLElement>('.composition-timeline__content')!;const before=content.style.width;
    await act(async()=>{cursor.dispatchEvent(new window.KeyboardEvent("keydown",{key:"+",bubbles:true,cancelable:true}));});
    expect(content.style.width).toBe(before);
  });
  it("inclui a rolagem do viewport no deslocamento e usa o callback atual",async()=>{
    const document=fixture();const oldChange=vi.fn();const latestChange=vi.fn();
    const render=(onChange:typeof oldChange)=><CompositionTimeline document={document} frame={0} selected={[document.items[0].id]} mode="select" range={null}
      onSelect={vi.fn()} onRange={vi.fn()} onSeek={vi.fn()} onChange={onChange} onPreview={vi.fn()} onError={vi.fn()}/>;
    mounted=await reactHost(render(oldChange));
    const edge=mounted.host.querySelector<HTMLElement>('[aria-label="Ajustar fim de video.mp4"]')!;
    await act(async()=>{edge.dispatchEvent(new window.MouseEvent("pointerdown",{button:0,clientX:200,bubbles:true}));});
    await mounted.render(render(latestChange));
    mounted.host.querySelector<HTMLElement>('.composition-timeline__viewport')!.scrollLeft=100;
    await act(async()=>{window.dispatchEvent(new window.MouseEvent("pointerup",{clientX:200}));});
    expect(oldChange).not.toHaveBeenCalled();expect(latestChange).toHaveBeenCalledOnce();
    expect((latestChange.mock.calls[0][0] as Composition).items[0].durationFrames).toBeGreaterThan(60);
  });
  it("marca intervalo sobre a miniatura no modo Intervalo",async()=>{
    const document=fixture();const onRange=vi.fn();
    mounted=await reactHost(<CompositionTimeline document={document} frame={0} selected={[]} mode="range" range={null}
      onSelect={vi.fn()} onRange={onRange} onSeek={vi.fn()} onChange={vi.fn()} onPreview={vi.fn()} onError={vi.fn()}/>);
    const item=mounted.host.querySelector<HTMLElement>('[data-composition-item]')!;
    await act(async()=>{
      item.dispatchEvent(new window.MouseEvent("pointerdown",{button:0,clientX:180,bubbles:true}));
      window.dispatchEvent(new window.MouseEvent("pointermove",{clientX:230}));
      window.dispatchEvent(new window.MouseEvent("pointerup",{clientX:230}));
    });
    expect(onRange.mock.calls.length).toBeGreaterThan(1);
    const range=onRange.mock.calls[onRange.mock.calls.length-1][0];
    expect(range.end).toBeGreaterThan(range.start);
  });
  it("mostra itens e alças dentro de faixas identificadas, em tempo de saída", async () => {
    const host=await mount(fixture());
    expect(host.host.textContent).toContain("Principal");
    expect(host.host.querySelectorAll('[data-composition-item]')).toHaveLength(1);
    expect(host.host.querySelector('[data-kind="video"][data-source-audio="true"] .composition-item__wave')).not.toBeNull();
    expect(fixture().items).toHaveLength(2);
    expect(host.host.querySelector('[aria-label="Ajustar início de video.mp4"]')).toBeTruthy();
    expect(host.host.querySelector('[aria-label="Ajustar fim de video.mp4"]')).toBeTruthy();
    expect(host.host.querySelector('[data-composition-item]')?.getAttribute("data-start-frame")).toBe("0");
  });
  it("ajusta uma borda por teclado em um frame sem alterar a fonte original", async () => {
    const document=fixture(); const change=vi.fn(); const host=await mount(document,change);
    const edge=host.host.querySelector<HTMLElement>('[aria-label="Ajustar início de video.mp4"]')!;
    await act(async()=>{edge.dispatchEvent(new window.KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));});
    expect(change).toHaveBeenCalledOnce();
    const changed=change.mock.calls[0][0] as Composition;
    expect(changed.items[0].durationFrames).toBe(59);
    expect(document.items[0].durationFrames).toBe(60);
  });
  it("commita um arrasto uma única vez e usa a última posição do ponteiro", async () => {
    const change=vi.fn(); const host=await mount(fixture(),change);
    const edge=host.host.querySelector<HTMLElement>('[aria-label="Ajustar fim de video.mp4"]')!;
    await act(async()=>{
      edge.dispatchEvent(new window.MouseEvent("pointerdown",{button:0,clientX:0,bubbles:true}));
      window.dispatchEvent(new window.MouseEvent("pointermove",{clientX:10}));
      window.dispatchEvent(new window.MouseEvent("pointermove",{clientX:100}));
      window.dispatchEvent(new window.MouseEvent("pointerup",{clientX:100}));
    });
    expect(change).toHaveBeenCalledOnce();
    expect((change.mock.calls[0][0] as Composition).items[0].durationFrames).toBeGreaterThan(60);
  });
});
