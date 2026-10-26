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
  const change = vi.fn(), error = vi.fn(), previewed = vi.fn();
  function Harness() {
    const viewport = useRef<HTMLDivElement>(null);
    const [saved, setSaved] = useState(original), [preview, setPreview] = useState<Composition | null>(null);
    const document = preview ?? saved;
    const gesture = useCompositionGesture({ document, scale: 1, frame: 0, selected: [anchorId], magnetic: false, viewport,
      onSelect: vi.fn(), onChange: next => { change(next); setSaved(next); }, onError: error,
      onPreview: next => { previewed(next); setPreview(next); } });
    return <div ref={viewport} data-viewport>
      <div data-drop-new-track />
      {document.tracks.filter(track => track.kind === "visual").map(track => <div key={track.id} data-composition-track={track.id} data-track-kind="visual">
        {document.items.filter(item => item.trackId === track.id).map(item => <div key={item.id} data-composition-item={item.id} onPointerDown={event => gesture.begin(event, item)}>Trecho</div>)}
      </div>)}
    </div>;
  }
  mounted = await reactHost(<Harness />);
  const rect = (top: number, bottom: number) => ({ left: 0, right: 1000, top, bottom, width: 1000, height: bottom - top, x: 0, y: top, toJSON: () => ({}) });
  const viewport = mounted.host.querySelector<HTMLElement>("[data-viewport]")!;
  viewport.getBoundingClientRect = () => rect(0, 400);
  Object.defineProperty(viewport, "clientWidth", { configurable: true, value: 1000 });
  Object.defineProperty(viewport, "scrollWidth", { configurable: true, value: 3000 });
  mounted.host.querySelector<HTMLElement>("[data-drop-new-track]")!.getBoundingClientRect = () => rect(40, 64);
  mounted.host.querySelector<HTMLElement>('[data-composition-track="V1"]')!.getBoundingClientRect = () => rect(100, 160);
  mounted.host.querySelector<HTMLElement>('[data-composition-track="above"]')!.getBoundingClientRect = () => rect(200, 260);
  return { original, change, error, previewed };
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
it("uma nova camada conserva identidade durante previews e confirma uma única edição", async () => {
  const { original, change, error, previewed } = await setup();
  await begin();
  for (let index = 1; index <= 6; index++) await move(300 + index * 10, 50);
  expect(change).not.toHaveBeenCalled();
  await release(360, 50);
  expect(change).toHaveBeenCalledOnce(); expect(error).not.toHaveBeenCalled();
  const saved = change.mock.calls[0][0] as Composition;
  const trackIds = previewed.mock.calls.flatMap(call => { const value = call[0] as Composition | null; return value ? value.tracks.filter(track => !original.tracks.some(old => old.id === track.id)).map(track => track.id) : []; });
  expect(trackIds.length).toBeGreaterThan(1); expect(new Set(trackIds).size).toBe(1);
  expect(saved.tracks).toHaveLength(original.tracks.length + 1);
  expect(saved.items.map(item => item.id)).toEqual(original.items.map(item => item.id));
});
it("um vídeo movido para cima sobrepõe o de baixo com áudio estável em faixa própria",async()=>{
  const source=fixture(),original=splitSelection(source,[source.items[0].id],150);
  const moving=original.items.find(item=>item.kind==="video"&&item.startFrame===150)!;
  const {change,error,previewed}=await setup(original,moving.id);
  await begin(moving.id);
  for(let index=1;index<=6;index++)await move(300-index*25,230);
  await release(150,230);
  expect(change).toHaveBeenCalledOnce();expect(error).not.toHaveBeenCalled();
  const result=change.mock.calls[0][0] as Composition;
  expect(result.items.find(item=>item.id===moving.id)).toMatchObject({startFrame:0,trackId:"above",sourceStartUs:5_000_000});
  expect(result.items.map(item=>item.id)).toEqual(original.items.map(item=>item.id));
  const trackIds=previewed.mock.calls.flatMap(call=>{const value=call[0] as Composition|null;return value?value.tracks.filter(track=>!original.tracks.some(old=>old.id===track.id)).map(track=>track.id):[];});
  expect(trackIds.length).toBeGreaterThan(1);expect(new Set(trackIds).size).toBe(1);
});
