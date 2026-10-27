import { act, useLayoutEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CompositionEditor } from "../components/editor/CompositionEditor";
import { CompositionEditorBody } from "../components/editor/CompositionEditorBody";
import { CompositionMediaLibrary } from "../components/editor/CompositionMediaLibrary";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { insertAssetAtTarget } from "../lib/composition-asset-drop";
import { emptyWorkspace } from "../lib/workspace";
import type { Composition, CompositionAsset } from "../lib/composition-types";
import { reactHost } from "./react-host";

vi.mock("../lib/ipc", () => ({ loadEditorProject: vi.fn(), getEditorRecovery: vi.fn(async () => null), saveEditorRecovery: vi.fn(async () => undefined),
  discardEditorRecovery: vi.fn(async () => undefined), saveEditorDocument: vi.fn(), revealEditorMedia: vi.fn(), getMedia: vi.fn(async () => null) }));
vi.mock("../hooks/useTimelinePreview", () => ({ useTimelinePreview: () => ({ frames: [], peaks: [], error: null }) }));
const available = vi.hoisted(() => ({ value: true }));
vi.mock("../hooks/useCompositionMedia", () => ({ useCompositionMedia: (assets: CompositionAsset[]) => Object.fromEntries(assets.map(asset => [asset.id, { url: available.value ? `source://${asset.mediaId}` : null, error: available.value ? null : "Arquivo ausente" }])) }));
vi.mock("../components/editor/CompositionMediaPoster", () => ({ CompositionMediaPoster: () => null }));
vi.mock("../components/workspace/RelinkMediaControl", () => ({ RelinkMediaControl: () => null }));
vi.mock("../components/editor/EditorInspector", () => ({ EditorInspector: () => null, panelForTool: () => "captions" }));
let current: Composition;
vi.mock("../components/editor/CompositionStage", () => ({ CompositionStage: ({ document }: { document: Composition }) => {
  useLayoutEffect(() => { current = document; }); return <div className="composition-stage"/>;
} }));
vi.mock("../components/editor/CompositionSource", () => ({ CompositionSource: ({ asset }: { asset: CompositionAsset }) => <div data-source-id={asset.id}>Fonte</div> }));
const ipc = await import("../lib/ipc");
let view: Awaited<ReturnType<typeof reactHost>> | undefined;
const image: CompositionAsset = { id: "image", mediaId: "image", kind: "image", name: "Imagem.png", width: 600, height: 400, durationUs: 0, transcript: [] };
function workspace() {
  const data = emptyWorkspace();
  data.media = { kind: "local", mediaId: "source", name: "Fonte.mp4", duration: 10, width: 640, height: 360, videoId: null, url: null };
  data.transcript = [{ id: "s", start: 0, end: 8, text: "Fala original" }]; return data;
}
function fixture() { return insertAssetAtTarget(compositionFromLegacy(workspace()), image, { frame: 450, trackId: null }); }
function screen(projectId = "p", clipId?: string) { const data = workspace(); data.activeClipId = clipId; return <CompositionEditor projectId={projectId} title="Projeto" data={data} localUrl="source.mp4" onBack={vi.fn()}/>; }
async function mount(document = fixture()) {
  vi.mocked(ipc.loadEditorProject).mockResolvedValue({ version: 1, project: { document, manuallyEdited: false, editedAtMs: 1 }, clips: {} });
  view = await reactHost(screen());
}
function card(name: string) { return [...view!.host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.getAttribute("aria-label") === `Selecionar mídia: ${name}`)!; }
async function context(name: string, key?: string) {
  const button = card(name); expect(button).toBeDefined();
  await act(async () => {
    if (key) button.dispatchEvent(new window.KeyboardEvent("keydown", { key, shiftKey: key === "F10", bubbles: true, cancelable: true }));
    else { button.dispatchEvent(new window.MouseEvent("pointerdown", { button: 2, bubbles: true })); button.dispatchEvent(new window.MouseEvent("contextmenu", { button: 2, clientX: 100, clientY: 100, bubbles: true, cancelable: true })); }
  });
}
async function menu(label: string) {
  const action = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(button => button.textContent?.trim() === label);
  expect(action, label).toBeDefined(); await act(async () => action!.click());
}
function dialog() { return view!.host.querySelector<HTMLDialogElement>("dialog[open]")!; }
async function typeName(value: string) {
  const input = dialog().querySelector<HTMLInputElement>('[aria-label="Nome da mídia"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")!.set!.call(input, value); input.dispatchEvent(new window.Event("input", { bubbles: true })); });
}
async function submit() { await act(async () => dialog().querySelector("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))); }
beforeEach(() => {
  available.value = true; vi.mocked(ipc.revealEditorMedia).mockResolvedValue(undefined);
  vi.mocked(ipc.saveEditorDocument).mockImplementation(async (_project, _clip, document, revision) => ({ document: { ...document, revision: revision + 1 }, manuallyEdited: true, editedAtMs: 2 }));
});
afterEach(async () => { await view?.close(); view = undefined; vi.clearAllMocks(); });

it("botão direito não inicia arraste, inserção ou abertura e seleciona a mídia do menu", async () => {
  const select = vi.fn(), drag = vi.fn(), open = vi.fn(), insert = vi.fn(), onContext = vi.fn();
  view = await reactHost(<CompositionMediaLibrary assets={[image]} previews={{}} media={{ image: { url: "image.png", error: null } }} onSelect={select} onOpen={open} onInsert={insert} onAssetDrag={drag} onContext={onContext}/>);
  await context(image.name);
  expect(drag).not.toHaveBeenCalled(); expect(insert).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
  expect(select).toHaveBeenCalledWith(image); expect(onContext).toHaveBeenCalledWith(image, { x: 100, y: 100 });
});

it.each(["ContextMenu", "F10"])("abre menu pelo teclado %s sem alterar a montagem", async key => {
  await mount(); const original = JSON.stringify(current);
  await context(image.name, key);
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
  expect(card(image.name).getAttribute("aria-pressed")).toBe("true");
  expect(JSON.stringify(current)).toBe(original); expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
});

it("renomear e excluir entram no histórico e só persistem ao salvar", async () => {
  await mount(); const original = structuredClone(current);
  await context("Fonte.mp4"); await menu("Renomear");
  await typeName("Entrevista final.mp4"); await submit();
  expect(current.assets.find(asset => asset.id === "source")!.name).toBe("Entrevista final.mp4");
  expect(current.items).toEqual(original.items); expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
  await context("Entrevista final.mp4"); await menu("Excluir");
  expect(dialog().textContent).toContain("1 trecho");
  await view!.click("Cancelar"); expect(current.items).toEqual(original.items);
  await context("Entrevista final.mp4"); await menu("Excluir"); await submit();
  expect(current.assets.map(asset => asset.id)).toEqual(["image"]);
  expect(current.items).toEqual(original.items.filter(item => item.assetId === "image"));
  expect(current.items[0].startFrame).toBe(450); expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
  await view!.click("Desfazer (Ctrl+Z)"); expect(current.assets.find(asset => asset.id === "source")!.name).toBe("Entrevista final.mp4");
  await view!.click("Desfazer (Ctrl+Z)"); expect(current).toEqual(original);
  await view!.click("Refazer (Ctrl+Shift+Z)"); await view!.click("Refazer (Ctrl+Shift+Z)"); await view!.click("Salvar");
  expect(ipc.saveEditorDocument).toHaveBeenCalledTimes(1);
  const saved = vi.mocked(ipc.saveEditorDocument).mock.lastCall![2];
  await view!.close(); view = undefined; await mount(saved);
  expect(current.items).toEqual(saved.items); expect(current.assets).toEqual(saved.assets);
});

it("cancelar renomeação não altera nada e nomes longos/script permanecem texto literal", async () => {
  await mount(); const original = JSON.stringify(current);
  await context(image.name); await menu("Renomear"); await typeName("Outro nome"); await view!.click("Cancelar");
  expect(JSON.stringify(current)).toBe(original);
  await context(image.name); await menu("Renomear"); await typeName("𐐀".repeat(121));
  expect(dialog().textContent).toContain("120/120 caracteres"); await submit();
  const longName = current.assets.find(asset => asset.id === "image")!.name;
  expect(Array.from(longName)).toHaveLength(120);
  await context(longName); await menu("Renomear"); const literal = '<img src=x onerror="alert(1)">'; await typeName(literal); await submit();
  expect(card(literal)).toBeDefined(); expect(view!.host.querySelector("img[onerror]")).toBeNull();
  expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
});

it("faixa bloqueada explica a recusa de excluir e preserva todos os vínculos", async () => {
  const document = fixture(); document.tracks.find(track => track.kind === "caption")!.locked = true;
  await mount(document); const original = JSON.stringify(current);
  await context("Fonte.mp4"); await menu("Excluir");
  expect(dialog().textContent).toContain("bloqueadas");
  const confirm = dialog().querySelector<HTMLButtonElement>('button[type="submit"]')!;
  expect(confirm.disabled).toBe(true); await submit();
  expect(JSON.stringify(current)).toBe(original); expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
});

it("excluir fonte aberta remove sua seleção sem roubar seleção de outra mídia", async () => {
  await mount();
  const imageItem = view!.host.querySelector<HTMLElement>('[data-kind="image"][data-composition-item]')!;
  await act(async () => imageItem.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  await act(async () => card("Fonte.mp4").dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true })));
  expect(view!.host.querySelector('[data-source-id="source"]')).not.toBeNull();
  await context("Fonte.mp4"); await menu("Excluir"); await submit();
  expect(view!.host.querySelector("[data-source-id]")).toBeNull();
  expect(view!.host.querySelector('[data-kind="image"][data-selected="true"]')).not.toBeNull();
  await context(image.name); await menu("Excluir"); await submit();
  expect(current.items).toEqual([]); expect(current.assets).toEqual([]);
  expect(view!.host.querySelector('[data-selected="true"]')).toBeNull();
  expect(view!.host.textContent).toContain("Importe um vídeo, imagem ou áudio");
});

it("abrir local mostra andamento, trata arquivo ausente e bloqueia mídia indisponível", async () => {
  let reject!: (reason: Error) => void;
  vi.mocked(ipc.revealEditorMedia).mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
  await mount(); await context(image.name); await menu("Abrir local do arquivo");
  expect(ipc.revealEditorMedia).toHaveBeenCalledWith("p", "image");
  expect(view!.host.textContent).toContain("Abrindo local do arquivo");
  await act(async () => reject(new Error("arquivo ausente em caminho privado")));
  expect(view!.host.querySelector('[role="alert"]')?.textContent).toContain("Não foi possível abrir o local");
  expect(view!.host.textContent).not.toContain("caminho privado");
  available.value = false; await view!.render(screen()); await context(image.name);
  const reveal = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(button => button.textContent?.trim() === "Abrir local do arquivo")!;
  expect(reveal.getAttribute("aria-disabled")).toBe("true");
});

it.each(["project", "clip", "unmount"])("resposta tardia de Abrir local é ignorada ao mudar %s", async scope => {
  let reject!: (reason: Error) => void;
  vi.mocked(ipc.revealEditorMedia).mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
  await mount(); await context(image.name); await menu("Abrir local do arquivo");
  if (scope === "unmount") { await view!.close(); view = undefined; }
  else await view!.render(screen(scope === "project" ? "other" : "p", scope === "clip" ? "b".repeat(64) : undefined));
  await act(async () => reject(new Error("Resposta antiga")));
  if (view) expect(view.host.querySelector('[role="alert"]')).toBeNull();
});

it("estado bloqueado permite identificar a mídia mas impede ações do menu", async () => {
  const change = vi.fn(), error = vi.fn();
  view = await reactHost(<CompositionEditorBody projectId="p" document={fixture()} legacy={workspace()} frame={0} playing={false} selected={[]} sourceUrl={null}
    onChange={change} onSeek={vi.fn()} onPause={vi.fn()} onError={error} onPreview={vi.fn()} onPreviews={vi.fn()} importDisabled/>);
  await context(image.name);
  const options = [...document.querySelectorAll('[role="menuitem"]')];
  expect(options).toHaveLength(3); expect(options.every(option => option.getAttribute("aria-disabled") === "true")).toBe(true);
  await menu("Renomear"); await menu("Excluir"); await menu("Abrir local do arquivo");
  expect(change).not.toHaveBeenCalled(); expect(ipc.revealEditorMedia).not.toHaveBeenCalled(); expect(dialog()).toBeNull();
});

it.each(["removed", "locked", "blocked"])("confirmação revalida documento e permissões atuais: %s", async mode => {
  const change = vi.fn(), error = vi.fn(), original = fixture();
  const render = (document: Composition, disabled = false) => <CompositionEditorBody projectId="p" document={document} legacy={workspace()} frame={0} playing={false} selected={[]} sourceUrl={null}
    onChange={change} onSeek={vi.fn()} onPause={vi.fn()} onError={error} onPreview={vi.fn()} onPreviews={vi.fn()} importDisabled={disabled}/>;
  view = await reactHost(render(original)); await context("Fonte.mp4"); await menu("Excluir");
  const next = structuredClone(original);
  if (mode === "removed") { next.items = next.items.filter(item => item.assetId !== "source"); next.assets = next.assets.filter(asset => asset.id !== "source"); }
  if (mode === "locked") next.tracks[0].locked = true;
  await view.render(render(next, mode === "blocked")); await submit();
  expect(change).not.toHaveBeenCalled(); expect(dialog()).not.toBeNull();
  if (mode !== "blocked") expect(dialog().querySelector('[role="alert"]')).not.toBeNull();
});

it("renomeação inválida preserva a montagem e permite corrigir o nome no mesmo diálogo", async () => {
  await mount(); const original = JSON.stringify(current);
  await context(image.name); await menu("Renomear"); await typeName("a\u0000b"); await submit();
  expect(JSON.stringify(current)).toBe(original);
  expect(dialog().querySelector('[role="alert"]')?.textContent).toContain("controle");
  await typeName("Imagem corrigida.png"); await submit();
  expect(current.assets.find(asset => asset.id === "image")!.name).toBe("Imagem corrigida.png");
});

it("erro de abrir local após a mídia ser removida não afeta a montagem atual", async () => {
  let reject!: (reason: Error) => void;
  vi.mocked(ipc.revealEditorMedia).mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
  const error = vi.fn(), original = fixture();
  const render = (document: Composition) => <CompositionEditorBody projectId="p" document={document} legacy={workspace()} frame={0} playing={false} selected={[]} sourceUrl={null}
    onChange={vi.fn()} onSeek={vi.fn()} onPause={vi.fn()} onError={error} onPreview={vi.fn()} onPreviews={vi.fn()}/>;
  view = await reactHost(render(original)); await context(image.name); await menu("Abrir local do arquivo");
  const next = { ...original, items: original.items.filter(item => item.assetId !== "image"), assets: original.assets.filter(asset => asset.id !== "image") };
  await view.render(render(next)); await act(async () => reject(new Error("erro da mídia antiga")));
  expect(error).not.toHaveBeenCalled();
});

it.each([false, true])("excluir pelo teclado mantém foco no editor e permite Ctrl+Z sem outro clique, última mídia=%s", async last => {
  await mount(last ? compositionFromLegacy(workspace()) : fixture());
  const original = structuredClone(current);
  await act(async () => card("Fonte.mp4").focus());
  await context("Fonte.mp4", "F10"); await menu("Excluir"); await submit();
  expect(current.assets.some(asset => asset.id === "source")).toBe(false);
  expect(document.activeElement?.closest('[data-testid="video-editor"]')).not.toBeNull();
  await act(async () => window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true })));
  expect(current).toEqual(original); expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
});

it("cancelar a exclusão pelo teclado devolve foco à mídia sem criar histórico", async () => {
  await mount(); const original = structuredClone(current), origin = card("Fonte.mp4");
  await act(async () => origin.focus()); await context("Fonte.mp4", "F10"); await menu("Excluir"); await view!.click("Cancelar");
  expect(document.activeElement).toBe(origin);
  expect(current).toEqual(original);
  expect(view!.host.querySelector('[aria-label="Desfazer (Ctrl+Z)"]')?.getAttribute("aria-disabled")).toBe("true");
});
