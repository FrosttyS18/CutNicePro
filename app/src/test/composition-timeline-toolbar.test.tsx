import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { CompositionTimeline } from "../components/editor/CompositionTimeline";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";

let view:Awaited<ReturnType<typeof reactHost>>|undefined;
afterEach(async()=>{await view?.close();view=undefined;});
function fixture(){const workspace=emptyWorkspace();workspace.media={kind:"local",mediaId:"source",name:"Fonte.mp4",duration:60,width:1920,height:1080,videoId:null,url:null};return compositionFromLegacy(workspace);}
const noop=()=>{};
async function click(label:string){const button=view!.host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;await act(async()=>button.click());}

it("agrupa o zoom compacto e abre o ajuste preciso de frame sob ação",async()=>{
  const onSeek=vi.fn();
  view=await reactHost(<CompositionTimeline document={fixture()} frame={37} selected={[]} mode="select" range={null} onSelect={noop} onRange={noop} onSeek={onSeek} onChange={noop} onPreview={noop} onError={noop}/>);
  const zoom=view.host.querySelector('[aria-label="Zoom da timeline"]');
  expect(zoom).not.toBeNull();
  expect(zoom!.querySelector('[aria-label="Diminuir zoom"]')).not.toBeNull();
  expect(zoom!.querySelector('[aria-label="Zoom da linha do tempo"]')).not.toBeNull();
  expect(zoom!.querySelector('[aria-label="Aumentar zoom"]')).not.toBeNull();
  expect(zoom!.querySelector('[aria-label="Ajustar à largura"]')).not.toBeNull();
  expect(view.host.querySelector('input[type="number"]')).toBeNull();
  await click("Posição precisa");
  const field=view.host.querySelector<HTMLInputElement>('[aria-label="Cursor da montagem em frames"]')!;
  expect(field.value).toBe("37");
  await act(async()=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field),"value")!.set!.call(field,"123");field.dispatchEvent(new window.Event("input",{bubbles:true}));});
  expect(onSeek).toHaveBeenLastCalledWith(123);
});
it("inicia com ímã ativo e permite alternar sem editar o documento",async()=>{
  const onChange=vi.fn(),onMagneticChange=vi.fn();
  view=await reactHost(<CompositionTimeline document={fixture()} frame={0} selected={[]} mode="select" range={null} onSelect={noop} onRange={noop} onSeek={noop} onChange={onChange} onPreview={noop} onError={noop} onMagneticChange={onMagneticChange}/>);
  expect(view.host.querySelector('[aria-label="Ímã da faixa principal"]')?.getAttribute("aria-pressed")).toBe("true");
  await click("Ímã da faixa principal");
  expect(onMagneticChange).toHaveBeenLastCalledWith(false);
  expect(view.host.querySelector('[aria-label="Ímã da faixa principal"]')?.getAttribute("aria-pressed")).toBe("false");
  expect(onChange).not.toHaveBeenCalled();
});
it("exibe camadas pela ordem visual e mantém a ordem do documento",async()=>{
  const document=fixture();
  document.items=document.items.map(item=>item.kind==="audio"?{...item,groupId:"independent"}:item);
  document.tracks.push({id:"V2",name:"Camada 2",kind:"visual",primary:false,locked:false,hidden:false,muted:false},{id:"V3",name:"Camada 3",kind:"visual",primary:false,locked:false,hidden:false,muted:false});
  const before=document.tracks.map(track=>track.id);
  view=await reactHost(<CompositionTimeline document={document} frame={0} selected={[]} mode="select" range={null} onSelect={noop} onRange={noop} onSeek={noop} onChange={noop} onPreview={noop} onError={noop}/>);
  expect(Array.from(view.host.querySelectorAll(".composition-track__label>strong")).map(label=>label.textContent)).toEqual(["Camada 3","Camada 2","Principal","Áudio da fonte"]);
  expect(document.tracks.map(track=>track.id)).toEqual(before);
  expect(view.host.querySelector('[data-drop-new-track][aria-label="Nova camada de vídeo"]')).not.toBeNull();
});
