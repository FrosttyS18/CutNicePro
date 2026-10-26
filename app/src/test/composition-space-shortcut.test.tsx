import { act, useRef, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useCompositionCommands } from "../hooks/useCompositionCommands";
import { useCompositionPlayback } from "../hooks/useCompositionPlayback";
import { usePlaybackShortcut } from "../hooks/usePlaybackShortcut";
import { CompositionTimeline } from "../components/editor/CompositionTimeline";
import { EditorMenu } from "../components/editor/EditorMenu";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";

let view: Awaited<ReturnType<typeof reactHost>> | undefined;
let playback: ReturnType<typeof useCompositionPlayback>;
let now = 0, sequence = 0;
const requests = new Map<number, FrameRequestCallback>();
const toggle = vi.fn(), nativeClick = vi.fn(), select = vi.fn(), save = vi.fn(), legacy = vi.fn();
afterEach(async () => { await view?.close(); view = undefined; now = 0; requests.clear(); vi.clearAllMocks(); });

async function mount(withLegacy = false) {
  const data = emptyWorkspace();
  data.media = { kind: "local", mediaId: "source", name: "Fonte.mp4", duration: 10, width: 640, height: 360, videoId: null, url: null };
  const initial = compositionFromLegacy(data);
  function Probe() {
    const scope = useRef<HTMLElement | null>(null);
    const [document, setDocument] = useState(initial);
    const [selected, setSelected] = useState<string[]>([]);
    const [menu, setMenu] = useState(false);
    const state = useCompositionPlayback(document.fps, 300, true);
    playback = state;
    usePlaybackShortcut(withLegacy, legacy);
    const onSelect = (ids: string[]) => { select(ids); setSelected(ids); };
    useCompositionCommands({ document, selected, frame: state.frame, range: null, scope, onChange: setDocument, onSelect,
      onRange: vi.fn(), onSeek: state.seek, onError: vi.fn(), onSave: save, onUndo: vi.fn(), onRedo: vi.fn(), onTogglePlay: () => { toggle(); state.toggle(); } });
    return <><section ref={scope}>
      <button type="button" aria-label="Salvar fora da timeline" onClick={save}>Salvar</button>
      <div data-editor-viewer="source" tabIndex={0} aria-label="Fonte">Fonte</div>
      <CompositionTimeline document={document} frame={state.frame} selected={selected} mode="select" range={null} onChange={setDocument} onSelect={onSelect}
        onRange={vi.fn()} onSeek={state.seek} onPreview={vi.fn()} onError={vi.fn()} onTrackContext={() => setMenu(true)}
        toolbar={<div><button type="button" aria-label="Ação da timeline" onClick={nativeClick}>Ação</button><input aria-label="Texto"/><textarea aria-label="Área de texto"/><select aria-label="Lista"><option>Uma</option></select>
          <div contentEditable suppressContentEditableWarning tabIndex={0} aria-label="Editável">Texto</div><div role="menu" tabIndex={0} aria-label="Menu local">Menu</div><div role="dialog" tabIndex={0} aria-label="Diálogo local">Diálogo</div></div>}/>
      {menu && <EditorMenu label="Menu da faixa" x={0} y={0} items={[{ label: "Ação do menu", icon: null, onSelect: nativeClick }]} onClose={() => setMenu(false)}/>}
    </section><button type="button" aria-label="Fora do editor">Fora</button></>;
  }
  vi.stubGlobal("performance", { now: () => now });
  view = await reactHost(<Probe/>, environment => {
    Object.defineProperty(environment, "requestAnimationFrame", { configurable: true, value: (callback: FrameRequestCallback) => { const id = ++sequence; requests.set(id, callback); return id; } });
    Object.defineProperty(environment, "cancelAnimationFrame", { configurable: true, value: (id: number) => requests.delete(id) });
  });
}
function element(selector: string) { const target = view!.host.querySelector<HTMLElement>(selector); expect(target, selector).not.toBeNull(); return target!; }
async function press(target: HTMLElement, key: string, init: KeyboardEventInit = {}) {
  const event = new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  await act(async () => { target.focus(); target.dispatchEvent(event); });
  return event;
}
async function advance() {
  now += 100;
  const callbacks = [...requests.values()]; requests.clear();
  await act(async () => callbacks.forEach(callback => callback(now)));
}

it.each(["selection", "trim", "cursor", "menu", "toolbar"])("Espaço reproduz uma vez após %s sem selecionar ou clicar o controle", async operation => {
  await mount(true);
  const item = element('[data-kind="video"][data-composition-item]');
  let target = item;
  if (operation === "selection") {
    await act(async () => { item.dispatchEvent(new window.MouseEvent("pointerdown", { button: 0, clientX: 240, bubbles: true })); window.dispatchEvent(new window.MouseEvent("pointerup", { clientX: 240 })); });
  } else if (operation === "trim") {
    target = element('.composition-item__handle--start');
    await press(target, "ArrowRight");
  } else if (operation === "cursor") {
    target = element('[aria-label="Arrastar cursor da montagem"]');
    await press(target, "ArrowRight");
  } else if (operation === "menu") {
    target = element('[aria-label="Opções da faixa Principal"]');
    await act(async () => { target.focus(); target.click(); });
    const option = globalThis.document.querySelector<HTMLElement>('[role="menuitem"]')!;
    await press(option, " ");
    expect(toggle).not.toHaveBeenCalled();
    await press(option, "Escape");
    expect(globalThis.document.activeElement).toBe(target);
  } else target = element('[aria-label="Ação da timeline"]');
  const selectedBefore = select.mock.calls.length;
  const frameBefore = playback.frame;
  const event = await press(target, " ");
  expect(event.defaultPrevented).toBe(true);
  expect(toggle).toHaveBeenCalledOnce();
  expect(legacy).not.toHaveBeenCalled();
  expect(nativeClick).not.toHaveBeenCalled();
  expect(select).toHaveBeenCalledTimes(selectedBefore);
  expect(playback.playing).toBe(true);
  await advance();
  expect(playback.frame).toBeGreaterThan(frameBefore);
});

it.each(["Texto", "Área de texto", "Lista", "Editável", "Menu local", "Diálogo local", "Fonte", "Fora do editor", "Salvar fora da timeline"])("Espaço preserva foco de %s", async label => {
  await mount();
  const event = await press(element(`[aria-label="${label}"]`), " ");
  expect(toggle).not.toHaveBeenCalled();
  expect(event.defaultPrevented).toBe(false);
});

it("repeat não alterna novamente nem rola a página; modificadores e composição não iniciam Play", async () => {
  await mount();
  const target = element('[aria-label="Arrastar cursor da montagem"]');
  for (const init of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { isComposing: true }]) await press(target, " ", init);
  expect(toggle).not.toHaveBeenCalled();
  await press(target, " ");
  for (let index = 0; index < 3; index++) expect((await press(target, " ", { repeat: true })).defaultPrevented).toBe(true);
  expect(toggle).toHaveBeenCalledOnce();
});

it("modal aberto bloqueia Space mesmo com foco antigo na timeline e Ctrl+S continua único", async () => {
  await mount();
  const target = element('[aria-label="Arrastar cursor da montagem"]');
  const modal = globalThis.document.createElement("dialog"); modal.open = true; globalThis.document.body.append(modal);
  await press(target, " ");
  expect(toggle).not.toHaveBeenCalled();
  modal.remove();
  const event = await press(target, "s", { ctrlKey: true });
  expect(event.defaultPrevented).toBe(true);
  expect(save).toHaveBeenCalledOnce();
  expect(toggle).not.toHaveBeenCalled();
});
