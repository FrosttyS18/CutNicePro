import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CompositionDelivery } from "../components/editor/CompositionDelivery";
import { TranscriptionDialog } from "../components/workspace/TranscriptionDialog";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import type { ClipJob } from "../lib/clips";
import { reactHost } from "./react-host";

const exporter = vi.hoisted(() => ({ busy: false, error: null as string | null, job: null as ClipJob | null, exportDocument: vi.fn(), cancel: vi.fn() }));
vi.mock("../hooks/useCompositionExport", () => ({ useCompositionExport: () => exporter }));
vi.mock("../lib/composition-persistence", () => ({ createManualClip: vi.fn() }));
vi.mock("../lib/ipc", () => ({
  getEditorExportPreview: vi.fn().mockRejectedValue(new Error("Prévia indisponível no teste")),
  getEditorExportCapabilities: vi.fn().mockResolvedValue({ codecs: ["h264", "hevc", "hevcAlpha", "hevc422", "av1", "rle"].map(codec => ({ codec, supported: true })) }),
  chooseEditorExportDirectory: vi.fn().mockResolvedValue(null),
  revealEditorExport: vi.fn().mockResolvedValue(undefined),
}));
let view: Awaited<ReturnType<typeof reactHost>> | undefined;
function props(dirty = false) {
  const data = emptyWorkspace();
  data.media = { kind: "local", mediaId: "source", name: "Fonte.mp4", duration: 10, width: 640, height: 360, videoId: null, url: null };
  const document = compositionFromLegacy(data);
  return { projectId: "p", clipId: null, title: "Projeto", document, dirty, saving: false, busy: false, range: null,
    readSavedDocument: vi.fn(() => document), saveForExport: vi.fn(async () => document), onPause: vi.fn(), onError: vi.fn(), onNotice: vi.fn() };
}
function running(progress = 0): ClipJob { return { jobId: "export-a", projectId: "p", stage: "rendering", operation: "export", state: "running", progress, error: null }; }
async function confirmSettings() {
  const submit = view!.host.querySelector<HTMLButtonElement>(".composition-export button[type=submit]");
  expect(submit).not.toBeNull(); expect(submit!.disabled).toBe(false); await act(async () => submit!.click());
}
function progress() { return view!.host.querySelector<HTMLProgressElement>('[aria-label="Progresso da exportação"]')!; }
async function action(label: string) {
  const button = view!.host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
  expect(button, label).not.toBeNull(); await act(async () => button.click());
}
beforeEach(() => {
  exporter.busy = false; exporter.error = null; exporter.job = null;
  exporter.exportDocument.mockResolvedValue({ status: "completed" }); exporter.cancel.mockResolvedValue(true);
});
afterEach(async () => { await view?.close(); view = undefined; vi.useRealTimers(); vi.clearAllMocks(); });

it("exportação usa a mesma animação e controle de movimento da transcrição", async () => {
  exporter.busy = true; exporter.job = running();
  view = await reactHost(<CompositionDelivery {...props()}/>);
  expect(view.host.querySelector("dialog.transcription-dialog[open] .thinking-orb")?.children).toHaveLength(3);
  expect(progress().value).toBe(0);
  await action("Pausar animação");
  expect(view.host.querySelector("dialog.animation-paused")).not.toBeNull();
  await action("Retomar animação");
  expect(view.host.querySelector("dialog.animation-paused")).toBeNull();
  await view.render(<TranscriptionDialog open job={{ jobId: "asr-a", projectId: "p", stage: "transcribing", state: "running", progress: 0, error: null }} onClose={vi.fn()} onCancel={vi.fn()} onRetry={vi.fn()}/>);
  expect(view.host.querySelector("dialog.transcription-dialog[open] .thinking-orb")?.children).toHaveLength(3);
  expect(view.host.querySelector('[aria-label="Pausar animação"]')).not.toBeNull();
});

it("progresso visual nunca ultrapassa o valor medido do job de exportação", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  exporter.busy = true; exporter.job = running(12);
  const input = props(); view = await reactHost(<CompositionDelivery {...input}/>, environment => {
    vi.spyOn(environment, "setInterval").mockImplementation((callback, delay, ...args) => globalThis.setInterval(() => callback(...args), delay));
    vi.spyOn(environment, "clearInterval").mockImplementation(timer => globalThis.clearInterval(timer));
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
  expect(progress().value).toBe(12);
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(progress().value).toBe(12);
  exporter.job = running(42); await view.render(<CompositionDelivery {...input}/>);
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(progress().value).toBe(42);
  expect(input.onNotice).not.toHaveBeenCalled();
});

it("cancelar exige confirmação, continuar mantém o job e falha de cancelamento permite repetir", async () => {
  exporter.busy = true; exporter.job = running(20); exporter.cancel.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  view = await reactHost(<CompositionDelivery {...props()}/>);
  await action("Fechar janela"); expect(exporter.cancel).not.toHaveBeenCalled();
  await view.click("Continuar"); expect(view.host.querySelector(".thinking-orb")).not.toBeNull();
  await view.click("Cancelar"); await view.click("Cancelar exportação");
  expect(exporter.cancel).toHaveBeenCalledTimes(1);
  expect(view.host.querySelector('[role="alert"]')?.textContent).toContain("Não foi possível cancelar");
  await view.click("Cancelar exportação"); expect(exporter.cancel).toHaveBeenCalledTimes(2);
});

it("falha permanece explicada no modal e permite fechar ou tentar novamente sem salvar silenciosamente", async () => {
  exporter.job = { ...running(30), state: "failed", error: "Não foi possível gravar o vídeo." };
  const input = props(); view = await reactHost(<CompositionDelivery {...input}/>);
  expect(view.host.querySelector('dialog[open] [role="alert"]')?.textContent).toBe("Não foi possível gravar o vídeo.");
  await view.click("Tentar novamente");
  await confirmSettings();
  expect(exporter.exportDocument).toHaveBeenCalledWith(input.document, null, expect.any(Object));
  expect(input.saveForExport).not.toHaveBeenCalled();
  expect(view.host.querySelector("dialog[open]")).toBeNull();
  exporter.job = { ...running(), jobId: "export-b", state: "failed", error: "Falhou novamente." };
  await view.render(<CompositionDelivery {...input}/>);
  await act(async () => view!.host.querySelector<HTMLButtonElement>('dialog[open] [aria-label="Fechar janela"]')!.click());
  expect(view.host.querySelector("dialog[open]")).toBeNull();
  expect(exporter.cancel).not.toHaveBeenCalled();
});

it("retry de exportação com rascunho novo exige Salvar e exportar", async () => {
  exporter.job = { ...running(), state: "failed", error: "Falha de exportação." };
  const input = props(true); view = await reactHost(<CompositionDelivery {...input}/>);
  await view.click("Tentar novamente");
  expect(exporter.exportDocument).not.toHaveBeenCalled();
  expect(view.host.textContent).toContain("Salvar antes de exportar?");
  await view.click("Salvar e exportar"); await confirmSettings(); expect(input.saveForExport).toHaveBeenCalledTimes(1);
  expect(exporter.exportDocument).toHaveBeenCalledWith(input.document, null, expect.any(Object));
});

it.each(["completed", "cancelled"] as const)("job terminal %s fecha o modal sem inventar sucesso", async state => {
  exporter.busy = true; exporter.job = running(70); const input = props();
  view = await reactHost(<CompositionDelivery {...input}/>);
  exporter.busy = false; exporter.job = { ...running(70), state, progress: state === "completed" ? 100 : 70 };
  await view.render(<CompositionDelivery {...input}/>);
  expect(view.host.querySelector("dialog[open]")).toBeNull();
  expect(input.onNotice).not.toHaveBeenCalled(); expect(input.onError).not.toHaveBeenCalled();
});
