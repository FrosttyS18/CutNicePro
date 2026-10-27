import { useRef, useState } from "react";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useCompositionGesture } from "../components/editor/useCompositionGesture";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { splitSelection } from "../lib/composition-edit";
import { emptyWorkspace } from "../lib/workspace";
import type { Composition } from "../lib/composition-types";
import { reactHost } from "./react-host";

let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await mounted?.close(); mounted = undefined; });
function fixture() {
  const workspace = emptyWorkspace();
  workspace.media = { kind: "local", mediaId: "source", name: "source.mp4", duration: 10, width: 1920, height: 1080, videoId: null, url: null };
  const document = compositionFromLegacy(workspace);
  document.tracks.push({ id: "above", name: "Camada", kind: "visual", primary: false, locked: false, muted: false, hidden: false });
  return document;
}
async function setup(original=fixture(),anchorId=original.items[0].id) {
  const change = vi.fn(), error = vi.fn(), previewed = vi.fn(), trackDrop = vi.fn();
  function Harness() {
    const viewport = useRef<HTMLDivElement>(null);
    const [saved, setSaved] = useState(original), [preview, setPreview] = useState<Composition | null>(null);
    const document = preview ?? saved;
    const gesture = useCompositionGesture({ document, scale: 1, frame: 0, selected: [anchorId], magnetic: false, viewport,
      onSelect: vi.fn(), onChange: next => { change(next); setSaved(next); }, onError: error,
      onPreview: next => { previewed(next); setPreview(next); }, onTrackDropPreview: trackDrop });
    return <div ref={viewport} data-viewport>
      <div data-drop-new-track />
      {document.tracks.filter(track => track.kind === "visual").map(track => <div key={track.id} data-composition-track={track.id} data-track-kind="visual" data-primary={track.primary}>
        {document.items.filter(item => item.trackId === track.id).map(item => <div key={item.id} data-composition-item={item.id} onPointerDown={event => gesture.begin(event, item)}>Trecho</div>)}
      </div>)}
    </div>;
  }
  mounted = await reactHost(<Harness />);
  const rect = (top: number, bottom: number, left = 0) => ({ left, right: 1000, top, bottom, width: 1000 - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) });
  const viewport = mounted.host.querySelector<HTMLElement>("[data-viewport]")!;
  viewport.getBoundingClientRect = () => rect(0, 400);
  Object.defineProperty(viewport, "clientWidth", { configurable: true, value: 1000 });
  Object.defineProperty(viewport, "scrollWidth", { configurable: true, value: 3000 });
  mounted.host.querySelector<HTMLElement>("[data-drop-new-track]")!.getBoundingClientRect = () => rect(40, 64, 168);
  mounted.host.querySelector<HTMLElement>('[data-composition-track="V1"]')!.getBoundingClientRect = () => rect(100, 160, 168);
  mounted.host.querySelector<HTMLElement>('[data-composition-track="above"]')!.getBoundingClientRect = () => rect(200, 260, 168);
  return { original, change, error, previewed, trackDrop };
}
async function begin(id?:string) {
  const item = mounted!.host.querySelector<HTMLElement>(id?`[data-composition-item="${id}"]`:"[data-composition-item]")!;
  await act(async () => { item.dispatchEvent(new window.MouseEvent("pointerdown", { button: 0, clientX: 300, clientY: 130, bubbles: true })); });
}
async function move(x: number, y: number) {
  await act(async () => { window.dispatchEvent(new window.MouseEvent("pointermove", { clientX: x, clientY: y })); await new Promise(resolve => setTimeout(resolve, 20)); });
}
async function release(x: number, y: number) {
  await act(async () => { window.dispatchEvent(new window.MouseEvent("pointerup", { clientX: x, clientY: y })); });
}
it("ímã desligado permite espaço antes do vídeo e arrastar não cria cópias", async () => {
  const { original, change, error } = await setup();
  await begin();
  for (let index = 1; index <= 8; index++) await move(300 + index * 10, 130);
  await release(400, 130);
  expect(change).toHaveBeenCalledOnce(); expect(error).not.toHaveBeenCalled();
  const saved = change.mock.calls[0][0] as Composition;
  expect(saved.items.map(item => item.id)).toEqual(original.items.map(item => item.id));
  expect(saved.items[0]).toMatchObject({ startFrame: 100, durationFrames: 300, sourceStartUs: 0 });
});
it("arrastar para outra faixa muda a camada sem duplicar o vídeo", async () => {
  const { original, change, error } = await setup();
  await begin(); await move(360, 230); await release(360, 230);
  expect(change).toHaveBeenCalledOnce(); expect(error).not.toHaveBeenCalled();
  const saved = change.mock.calls[0][0] as Composition;
  expect(saved.items).toHaveLength(original.items.length);
  expect(saved.items.find(item => item.id === original.items[0].id)).toMatchObject({ trackId: "above", startFrame: 60 });
});
it("uma nova camada mantém a base durante o indicador e confirma uma única edição", async () => {
  const { original, change, error, previewed, trackDrop } = await setup();
  const node = mounted!.host.querySelector("[data-composition-item]");
  await begin();
  for (let index = 1; index <= 6; index++) await move(300 + index * 10, 50);
  expect(change).not.toHaveBeenCalled();
  expect(mounted!.host.querySelector("[data-composition-item]")).toBe(node);
  expect(node?.closest("[data-composition-track]")?.getAttribute("data-composition-track")).toBe("V1");
  expect([...mounted!.host.querySelectorAll("[data-composition-track]")].map(value => value.getAttribute("data-composition-track"))).toEqual(["V1", "above"]);
  expect(previewed.mock.calls.every(([value]) => value === null || JSON.stringify(value) === JSON.stringify(original))).toBe(true);
  const indicators = trackDrop.mock.calls.map(([value]) => value).filter(value => value !== null);
  expect(indicators.length).toBeGreaterThan(1);
  expect(new Set(indicators.map(value => value.trackId)).size).toBe(1);
  expect(indicators[indicators.length-1]).toMatchObject({ newTrack: true, frame: 60, durationFrames: 300 });
  await release(360, 50);
  expect(change).toHaveBeenCalledOnce(); expect(error).not.toHaveBeenCalled();
  const saved = change.mock.calls[0][0] as Composition;
  expect(saved.tracks).toHaveLength(original.tracks.length + 1);
  expect(saved.items[0].trackId).toBe(indicators[indicators.length-1].trackId);
  expect(saved.items.map(item => item.id)).toEqual(original.items.map(item => item.id));
  expect(trackDrop).toHaveBeenLastCalledWith(null);
});
it("um vídeo movido para cima sobrepõe o de baixo com áudio estável em faixa própria",async()=>{
  const source=fixture(),original=splitSelection(source,[source.items[0].id],150);
  const moving=original.items.find(item=>item.kind==="video"&&item.startFrame===150)!;
  const {change,error,previewed,trackDrop}=await setup(original,moving.id);
  await act(async()=>{mounted!.host.querySelector<HTMLElement>(`[data-composition-item="${moving.id}"]`)!.dispatchEvent(new window.MouseEvent("pointerdown",{button:0,clientX:400,clientY:130,bubbles:true}));});
  for(let index=1;index<=6;index++)await move(400-index*25,230);
  expect(previewed.mock.calls.every(([value])=>value===null||JSON.stringify(value)===JSON.stringify(original))).toBe(true);
  expect(trackDrop).toHaveBeenLastCalledWith(expect.objectContaining({trackId:"above",frame:0,durationFrames:150,newTrack:false}));
  await release(250,230);
  expect(change).toHaveBeenCalledOnce();expect(error).not.toHaveBeenCalled();
  const result=change.mock.calls[0][0] as Composition;
  expect(result.items.find(item=>item.id===moving.id)).toMatchObject({startFrame:0,trackId:"above",sourceStartUs:5_000_000});
  expect(result.items.map(item=>item.id)).toEqual(original.items.map(item=>item.id));
  const companion=original.items.find(item=>item.kind==="audio"&&item.groupId===moving.groupId)!;
  const audio=result.items.find(item=>item.id===companion.id)!;
  expect(audio).toMatchObject({startFrame:0,durationFrames:150,sourceStartUs:5_000_000,sourceEndUs:10_000_000});
  expect(audio.trackId).not.toBe(companion.trackId);
  expect(result.tracks.filter(track=>!original.tracks.some(old=>old.id===track.id))).toHaveLength(1);
  expect(trackDrop).toHaveBeenLastCalledWith(null);
});

it("o indicador usa o tempo efetivo permitido por colisões em vez do deslocamento bruto",async()=>{
  const original=fixture();
  original.items.push({...structuredClone(original.items[0]),id:"obstacle",trackId:"above",groupId:"obstacle",followsMain:false,durationFrames:100,sourceEndUs:3_333_333});
  const {change,error,trackDrop}=await setup(original);
  await begin();await move(360,230);
  expect(trackDrop).toHaveBeenLastCalledWith(expect.objectContaining({trackId:"above",frame:100,durationFrames:300,newTrack:false}));
  await release(360,230);
  expect(error).not.toHaveBeenCalled();expect(change).toHaveBeenCalledOnce();
  const saved=change.mock.calls[0][0] as Composition;
  expect(saved.items[0]).toMatchObject({trackId:"above",startFrame:100});
  expect(saved.items.find(item=>item.id==="obstacle")).toEqual(original.items.find(item=>item.id==="obstacle"));
});

it("pointerup sem rAF confirma somente o último destino vertical",async()=>{
  const {original,change,error,trackDrop}=await setup();
  await begin();
  await act(async()=>{
    window.dispatchEvent(new window.MouseEvent("pointermove",{clientX:330,clientY:50}));
    window.dispatchEvent(new window.MouseEvent("pointerup",{clientX:390,clientY:230}));
  });
  expect(error).not.toHaveBeenCalled();expect(change).toHaveBeenCalledOnce();
  const saved=change.mock.calls[0][0] as Composition;
  expect(saved.items[0]).toMatchObject({trackId:"above",startFrame:90});
  expect(saved.items.map(item=>item.id)).toEqual(original.items.map(item=>item.id));
  expect(saved.tracks).toEqual(original.tracks);
  expect(trackDrop).toHaveBeenLastCalledWith(null);
});

it.each(["Escape","resize"])("retornar à origem e cancelar por %s remove indicador sem criar faixa ou edição",async reason=>{
  const {original,change,error,trackDrop}=await setup();
  const node=mounted!.host.querySelector("[data-composition-item]");
  await begin();await move(360,50);await move(360,230);await move(300,130);
  expect(trackDrop).toHaveBeenLastCalledWith(null);
  expect(mounted!.host.querySelector("[data-composition-item]")).toBe(node);
  await act(async()=>{window.dispatchEvent(reason==="Escape"?new window.KeyboardEvent("keydown",{key:"Escape",cancelable:true}):new window.Event("resize"));});
  await release(360,230);
  expect(change).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled();
  expect(trackDrop).toHaveBeenLastCalledWith(null);
  expect([...mounted!.host.querySelectorAll("[data-composition-track]")].map(value=>value.getAttribute("data-composition-track"))).toEqual(original.tracks.filter(track=>track.kind==="visual").map(track=>track.id));
});

it.each([[1100,230],[360,20],[20,230]])("soltar fora, na régua ou no gutter (%s,%s) cancela o destino vertical anterior",async(x,y)=>{
  const {change,error,trackDrop}=await setup();
  await begin();await move(360,230);await release(x,y);
  expect(change).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled();
  expect(trackDrop).toHaveBeenLastCalledWith(null);
});

it("o corpo da principal fixa recebe o arraste mesmo sobrepondo uma faixa anterior no DOM",async()=>{
  const original=fixture();
  original.tracks.sort((left,right)=>Number(left.primary)-Number(right.primary));
  const {change,error}=await setup(original);
  const overlay=mounted!.host.querySelector<HTMLElement>('[data-composition-track="above"]')!;
  overlay.getBoundingClientRect=mounted!.host.querySelector<HTMLElement>('[data-composition-track="V1"]')!.getBoundingClientRect;
  await begin();await release(360,130);
  expect(error).not.toHaveBeenCalled();
  const next=change.mock.calls[0][0] as Composition;
  expect(next.items[0]).toMatchObject({trackId:"V1",startFrame:60});
});

it("uma principal fixa bloqueada impede soltar na camada encoberta",async()=>{
  const original=fixture();
  original.items[0].trackId="above";
  original.tracks.find(track=>track.primary)!.locked=true;
  original.tracks.sort((left,right)=>Number(left.primary)-Number(right.primary));
  const {change,error}=await setup(original);
  const overlay=mounted!.host.querySelector<HTMLElement>('[data-composition-track="above"]')!;
  overlay.getBoundingClientRect=mounted!.host.querySelector<HTMLElement>('[data-composition-track="V1"]')!.getBoundingClientRect;
  await begin();await release(360,130);
  expect(change).not.toHaveBeenCalled();
  expect(error).toHaveBeenCalledOnce();
});
