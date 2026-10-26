import { act } from "react";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { CompositionDelivery } from "../components/editor/CompositionDelivery";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";

const bootstrap = await vi.hoisted(async () => {
  const { Window } = await import("happy-dom");
  const environment = new Window({ url: "http://localhost" });
  vi.stubGlobal("window", environment); vi.stubGlobal("document", environment.document);
  return environment;
});
const mocks = vi.hoisted(() => ({ exportDocument: vi.fn(), cancel: vi.fn(), createManualClip: vi.fn() }));
vi.mock("../hooks/useCompositionExport", () => ({ useCompositionExport: () => ({ ...mocks, busy: false, error: null, job: null }) }));
vi.mock("../lib/composition-persistence", () => ({ createManualClip: mocks.createManualClip }));

let view: Awaited<ReturnType<typeof reactHost>> | undefined;
function props(rate = 30) {
  const workspace = emptyWorkspace();
  workspace.media = { kind: "local", mediaId: "source", name: "source.mp4", duration: 10, width: 1920, height: 1080, videoId: null, url: null };
  const document = compositionFromLegacy(workspace, { fps: rate });
  return { projectId: "project", clipId: null, title: "Entrevista", document, dirty: true, saving: false, busy: false, range: { start: 1, end: 137 },
    readSavedDocument: vi.fn(() => document), saveForExport: vi.fn(async () => document), onPause: vi.fn(), onError: vi.fn(), onNotice: vi.fn() };
}
function input(label: string) {
  return Array.from(view!.host.querySelectorAll("label")).find(node => node.textContent?.startsWith(label))!.querySelector("input")!;
}
async function edit(label: string, value: string) {
  const target = input(label);
  await act(async () => {
    target.focus(); Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), "value")!.set!.call(target, value);
    target.dispatchEvent(new window.Event("input", { bubbles: true }));
    target.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
}
async function submit() {
  const form = view!.host.querySelector("dialog form");
  expect(form).not.toBeNull();
  await act(async () => { form!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); });
}
beforeEach(() => { vi.clearAllMocks(); mocks.createManualClip.mockResolvedValue({ id: "a".repeat(64) }); });
afterEach(async () => { await view?.close(); view = undefined; });
afterAll(async () => { await bootstrap.happyDOM.cancelAsync(); vi.unstubAllGlobals(); });

it.each([24000 / 1001, 60])("Criar clipe mostra tempos legíveis e mantém a seleção exata em %s fps", async rate => {
  const original = props(rate);
  view = await reactHost(<CompositionDelivery {...original}/>);
  await view.click("Criar clipe");
  expect(view.host.querySelector("dialog h2")?.textContent).toBe("Criar clipe");
  expect(input("Início").value).toMatch(/^\d{2}:\d{2}\.\d{3}$/);
  expect(input("Fim").value).toMatch(/^\d{2}:\d{2}\.\d{3}$/);
  await submit();
  expect(mocks.createManualClip).toHaveBeenCalledTimes(1);
  expect(mocks.createManualClip).toHaveBeenCalledWith("project", "Entrevista - clipe", expect.objectContaining({ items: expect.arrayContaining([expect.objectContaining({ startFrame: 0, durationFrames: 136 })]) }));
  expect(original.saveForExport).not.toHaveBeenCalled();
  expect(original.document.items[0].startFrame).toBe(0);
});

it.each([["", "00:02.000"], ["1.25", "00:02.000"], ["00:60.000", "00:02.000"], ["00:02.000", "00:01.000"], ["00:00.000", "00:10.001"]])("não cria com intervalo inválido %s – %s", async (start, end) => {
  view = await reactHost(<CompositionDelivery {...props()}/>); await view.click("Criar clipe");
  await edit("Início", start); await edit("Fim", end); await submit();
  expect(mocks.createManualClip).not.toHaveBeenCalled();
  expect(view.host.querySelector('[role="alert"]')?.textContent).toBeTruthy();
  expect(view.host.querySelector("dialog[open]")).not.toBeNull();
});

it("falha preserva tempos e nome para tentar novamente; Cancelar não cria", async () => {
  mocks.createManualClip.mockRejectedValueOnce(new Error("Não foi possível criar. Tente novamente."));
  const original = props(); view = await reactHost(<CompositionDelivery {...original}/>); await view.click("Criar clipe");
  await edit("Nome", "Trecho escolhido"); await edit("Início", "00:01.500"); await edit("Fim", "00:03.250"); await submit();
  expect(view.host.querySelector('[role="alert"]')?.textContent).toContain("Tente novamente");
  expect(input("Início").value).toBe("00:01.500"); expect(input("Nome").value).toBe("Trecho escolhido");
  expect(original.onNotice).not.toHaveBeenCalled();
  await submit();
  expect(mocks.createManualClip).toHaveBeenCalledTimes(2);
  expect(mocks.createManualClip).toHaveBeenLastCalledWith("project", "Trecho escolhido", expect.objectContaining({ items: expect.arrayContaining([expect.objectContaining({ durationFrames: 53, sourceStartUs: 1_500_000 })]) }));
  await view.click("Criar clipe"); await view.click("Cancelar");
  expect(mocks.createManualClip).toHaveBeenCalledTimes(2); expect(view.host.querySelector("dialog[open]")).toBeNull();
});

it("bloqueia fechamento e submissões repetidas enquanto cria", async () => {
  let finish!: () => void; mocks.createManualClip.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  view = await reactHost(<CompositionDelivery {...props()}/>); await view.click("Criar clipe"); await submit(); await submit();
  expect(mocks.createManualClip).toHaveBeenCalledTimes(1);
  const dialog = view.host.querySelector("dialog")!;
  await act(async () => { dialog.dispatchEvent(new window.Event("cancel", { cancelable: true })); });
  expect(dialog.open).toBe(true);
  expect(Array.from(dialog.querySelectorAll("button")).every(button => button.disabled)).toBe(true);
  await act(async () => finish()); expect(view.host.querySelector("dialog[open]")).toBeNull();
});
