import { act, useEffect, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { CompositionEditor } from "../components/editor/CompositionEditor";
import { emptyWorkspace } from "../lib/workspace";
import type { Composition } from "../lib/composition-types";
import { reactHost } from "./react-host";

vi.mock("../lib/ipc", () => ({
  loadEditorProject: vi.fn(async () => ({ version: 1, project: null, clips: {} })),
  getEditorRecovery: vi.fn(async () => null), saveEditorRecovery: vi.fn(async () => undefined), discardEditorRecovery: vi.fn(async () => undefined),
  getMedia: vi.fn(async () => ({ mediaId: "source", sha256: "a".repeat(64), ext: "mp4", originalName: "Fonte.mp4", sizeBytes: 100, createdAtMs: 1,
    projectIds: ["project"], unavailable: false, analysis: { durationMs: 10000, width: 1920, height: 1080, fps: 30, hasAudio: false, videoCodec: "h264" } })),
  createEditorClip: vi.fn(async (_project: string, title: string, document: Composition) => ({ id: "b".repeat(64), snapshot: {
    document: { ...document, revision: 1 }, manuallyEdited: false, editedAtMs: 10, origin: "manual", title, createdAtMs: 10,
  } })),
  saveEditorDocument: vi.fn(async (_project: string, _clip: string | null, document: Composition, revision: number) => ({ document: { ...document, revision: revision + 1 }, manuallyEdited: true, editedAtMs: 10 })),
}));
vi.mock("../components/editor/CompositionEditorBody", () => ({ CompositionEditorBody: ({ onReady, transport }: { onReady: (ready: boolean) => void; transport: ReactNode }) => {
  useEffect(() => onReady(true), [onReady]); return <div>{transport}</div>;
} }));
const ipc = await import("../lib/ipc");
let view: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await view?.close(); view = undefined; vi.clearAllMocks(); });

async function mount(dirty = false) {
  const data = emptyWorkspace();
  data.media = { kind: "local", mediaId: "source", name: "Fonte.mp4", duration: 10, width: 1920, height: 1080, videoId: null, url: null };
  const clips = vi.fn(), back = vi.fn();
  view = await reactHost(<CompositionEditor projectId="project" title="Projeto" data={data} localUrl="source.mp4" onBack={back} onShowClips={clips}/>);
  if (dirty) {
    const handle = view.host.querySelector<HTMLButtonElement>('[aria-label="Ajustar fim de Fonte.mp4"]')!;
    await act(async () => handle.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true })));
    expect(view.host.querySelector('[data-testid="editor-save-status"]')?.textContent).toBe("Alterações não salvas");
  }
  return { clips, back };
}
async function createClip() {
  await view!.click("Criar clipe");
  const submit = view!.host.querySelector<HTMLButtonElement>('dialog[open] button[type="submit"]')!;
  await act(async () => submit.click());
}

it("oferece Ir para clipes só após confirmar criação e não salva nem navega automaticamente", async () => {
  const { clips, back } = await mount();
  expect(view!.host.textContent).not.toContain("Ir para clipes");
  await createClip();
  expect(view!.host.querySelector('[role="status"].composition-created')?.textContent).toContain("Projeto - clipe");
  expect(clips).not.toHaveBeenCalled(); expect(back).not.toHaveBeenCalled();
  expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
  await view!.click("Ir para clipes");
  expect(clips).toHaveBeenCalledTimes(1); expect(back).not.toHaveBeenCalled();
});

it.each(["Continuar editando", "Descartar e sair", "Salvar e sair"])("Ir para clipes respeita rascunho e decisão %s", async decision => {
  const { clips, back } = await mount(true); await createClip();
  expect(view!.host.querySelector('[data-testid="editor-save-status"]')?.textContent).toBe("Alterações não salvas");
  expect(view!.host.textContent).toContain("Ir para clipes");
  expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
  await view!.click("Ir para clipes"); expect(clips).not.toHaveBeenCalled();
  expect(view!.host.querySelector('dialog[open]')?.textContent).toContain("Salvar alterações antes de sair?");
  await view!.click(decision);
  expect(clips).toHaveBeenCalledTimes(decision === "Continuar editando" ? 0 : 1);
  expect(ipc.saveEditorDocument).toHaveBeenCalledTimes(decision === "Salvar e sair" ? 1 : 0);
  expect(back).not.toHaveBeenCalled();
});

it("falha ao salvar impede a saída e preserva o clipe já criado e o rascunho", async () => {
  const { clips } = await mount(true); await createClip();
  vi.mocked(ipc.saveEditorDocument).mockRejectedValueOnce(new Error("Gravação indisponível"));
  await view!.click("Ir para clipes"); await view!.click("Salvar e sair");
  expect(clips).not.toHaveBeenCalled();
  expect(view!.host.querySelector('dialog[open]')).not.toBeNull();
  expect(view!.host.textContent).toContain("Gravação indisponível");
  expect(ipc.createEditorClip).toHaveBeenCalledTimes(1);
});
