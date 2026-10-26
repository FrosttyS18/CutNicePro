import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompositionDelivery } from "../components/editor/CompositionDelivery";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";
import type { Composition } from "../lib/composition-types";

const mocks = vi.hoisted(() => ({ exportDocument: vi.fn(), cancel: vi.fn(), createManualClip: vi.fn() }));
vi.mock("../hooks/useCompositionExport", () => ({ useCompositionExport: () => ({ ...mocks, busy: false, error: null, job: null }) }));
vi.mock("../lib/composition-persistence", () => ({ createManualClip: mocks.createManualClip }));

let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
function fixture() {
  const workspace = emptyWorkspace();
  workspace.media = { kind: "local", mediaId: "source", name: "source.mp4", duration: 10, width: 1920, height: 1080, videoId: null, url: null };
  return compositionFromLegacy(workspace);
}
function props(document: Composition = fixture()) {
  return { projectId: "project", clipId: null, title: "Projeto", document, dirty: false, saving: false, busy: false, range: null,
    readSavedDocument: vi.fn(() => document), saveForExport: vi.fn(async () => ({ ...document, revision: 1 })), onPause: vi.fn(), onError: vi.fn(), onNotice: vi.fn() };
}
beforeEach(() => { vi.clearAllMocks(); mocks.exportDocument.mockResolvedValue({ status: "completed" }); mocks.createManualClip.mockResolvedValue({ id: "a".repeat(64) }); });
afterEach(async () => { await mounted?.close(); mounted = undefined; });

describe("entrega explícita da montagem", () => {
  it("exporta a versão salva sem salvar nem criar outro clipe", async () => {
    const input = props();
    mounted = await reactHost(<CompositionDelivery {...input}/>);
    await mounted.click("Exportar");
    expect(mocks.exportDocument).toHaveBeenCalledWith(input.document, null);
    expect(input.saveForExport).not.toHaveBeenCalled();
    expect(mocks.createManualClip).not.toHaveBeenCalled();
    expect(input.onNotice).toHaveBeenCalledWith("Vídeo exportado.");
  });
  it("com rascunho espera confirmação e usa a revisão confirmada", async () => {
    const input = { ...props(), dirty: true };
    mounted = await reactHost(<CompositionDelivery {...input}/>);
    await mounted.click("Exportar");
    expect(mocks.exportDocument).not.toHaveBeenCalled();
    await mounted.click("Salvar e exportar");
    expect(input.saveForExport).toHaveBeenCalledOnce();
    expect(mocks.exportDocument).toHaveBeenCalledWith(expect.objectContaining({ revision: 1 }), null);
    expect(input.readSavedDocument).not.toHaveBeenCalled();
  });
  it("falha ao salvar mantém confirmação e não exporta nem mostra sucesso", async () => {
    const input = { ...props(), dirty: true, saveForExport: vi.fn(async () => null) };
    mounted = await reactHost(<CompositionDelivery {...input}/>);
    await mounted.click("Exportar"); await mounted.click("Salvar e exportar");
    expect(mocks.exportDocument).not.toHaveBeenCalled();
    expect(input.onNotice).not.toHaveBeenCalled();
    expect(mounted.host.textContent).toContain("Salvar antes de exportar?");
  });
  it("cancelamento do destino não é sucesso", async () => {
    mocks.exportDocument.mockResolvedValue({ status: "dialog-cancelled" });
    const input = props(); mounted = await reactHost(<CompositionDelivery {...input}/>);
    await mounted.click("Exportar"); expect(input.onNotice).not.toHaveBeenCalled(); expect(input.onError).not.toHaveBeenCalled();
  });
  it("Criar clipe recorta o intervalo de saída sem salvar a montagem", async () => {
    const input = { ...props(), dirty: true, range: { start: 30, end: 90 } };
    mounted = await reactHost(<CompositionDelivery {...input}/>);
    await mounted.click("Criar clipe");
    expect(mocks.createManualClip).not.toHaveBeenCalled();
    const buttons = Array.from(mounted.host.querySelectorAll<HTMLButtonElement>("dialog button"));
    const confirm = buttons.find(button => button.textContent === "Criar clipe")!;
    const { act } = await import("react"); await act(async () => confirm.click());
    expect(mocks.createManualClip).toHaveBeenCalledWith("project", "Projeto - clipe", expect.objectContaining({ revision: 0, items: expect.arrayContaining([expect.objectContaining({ startFrame: 0, durationFrames: 60, sourceStartUs: 1_000_000, sourceEndUs: 3_000_000 })]) }));
    expect(input.saveForExport).not.toHaveBeenCalled();
    expect(mocks.exportDocument).not.toHaveBeenCalled();
  });
  it("montagem vazia não pode exportar nem criar clipe", async () => {
    mounted = await reactHost(<CompositionDelivery {...props({ ...fixture(), items: [] })}/>);
    expect(Array.from(mounted.host.querySelectorAll<HTMLButtonElement>("button")).every(button => button.getAttribute("aria-disabled") === "true")).toBe(true);
    await mounted.click("Exportar"); await mounted.click("Criar clipe");
    expect(mocks.exportDocument).not.toHaveBeenCalled(); expect(mocks.createManualClip).not.toHaveBeenCalled();
  });
});
