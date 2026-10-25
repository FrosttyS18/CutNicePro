import { act, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { ProjectWorkspace } from "../screens/ProjectWorkspace";
import { emptyWorkspace } from "../lib/workspace";
import type { ClipCollection, ClipJob } from "../lib/clips";
import { reactHost } from "./react-host";

const bus = vi.hoisted(() => ({ handlers: new Set<(event: { payload: unknown }) => void>() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async (_name: string, receive: (event: { payload: unknown }) => void) => {
  bus.handlers.add(receive);
  return () => { bus.handlers.delete(receive); };
}) }));
vi.mock("../hooks/useWorkspaceData", () => ({ useWorkspaceData: () => ({
  data: { ...emptyWorkspace(), media: { kind: "local", mediaId: "m", name: "video.mp4", videoId: null, url: null, width: 1920, height: 1080, duration: 600 },
    transcriptMode: "real", transcript: [{ id: "s", start: 0, end: 5, text: "Uma fala real." }] },
  dirty: false, notice: null, localUrl: "blob:video", save: async () => true,
}) }));
vi.mock("../hooks/useTranscription", () => ({ useTranscription: () => ({ busy: false }) }));
vi.mock("../components/workspace/TranscriptionControls", () => ({ TranscriptionControls: () => null }));
vi.mock("../components/workspace/ProjectOverview", () => ({
  ProjectOverview: ({ transcriptionControls }: { transcriptionControls: ReactNode }) => <section>{transcriptionControls}</section>,
}));
vi.mock("../components/editor/VideoEditor", () => ({ VideoEditor: () => null }));
vi.mock("../components/clips/ClipGallery", () => ({
  ClipGallery: ({ entries }: { entries: unknown[] }) => <section aria-label="Clipes salvos">{entries.length} clipes preservados</section>,
}));

const saved: ClipCollection = { version: 1, mediaId: "m", transcriptHash: "h", clips: [{
  id: "a".repeat(64), start: 0, end: 30, title: "Corte anterior", score: 80, reasons: [], review: "pending",
}] };
let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
let latest: ClipJob | null;
let resolve!: (value: unknown) => void;
let reject!: (error: Error) => void;

beforeEach(() => {
  latest = null;
  const pending = new Promise<unknown>((yes, no) => { resolve = yes; reject = no; });
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === "get_clips") return saved;
    if (command === "clips_job") return latest;
    if (command === "generate_clips") {
      latest = { jobId: (args as { jobId: string }).jobId, projectId: "p", operation: "generate",
        state: "running", stage: "analyzing", progress: 25, error: null };
      return pending;
    }
    return null;
  });
});
afterEach(async () => {
  await mounted?.close(); mounted = undefined; bus.handlers.clear(); vi.clearAllMocks();
});
async function start() {
  mounted = await reactHost(<ProjectWorkspace project={{ id: "p", name: "Projeto", created_at_ms: 1, updated_at_ms: 1, last_opened_at_ms: null }}
    onRename={async () => undefined} onImport={() => undefined} onDelete={async () => undefined} />);
  await mounted.click("Gerar cortes");
  const button = mounted.host.querySelector<HTMLButtonElement>("dialog .upload-primary")!;
  await act(async () => { button.click(); });
  await act(async () => { bus.handlers.forEach(handler => handler({ payload: latest })); });
  expect(latest?.progress).toBe(25);
  expect(mounted.host.querySelector('progress')).not.toBeNull();
}
function terminal(state: ClipJob["state"], error: string | null = null) {
  latest = { ...latest!, state, error };
}
function feedback() {
  return mounted!.host.querySelector('[aria-label="Resultado do processamento"]');
}

describe("resultado da geração depois dos 25%", () => {
  it("mostra aviso persistente quando a rodada preserva a biblioteca sem aprovar cortes novos", async () => {
    await start();
    await act(async () => { terminal("completed"); resolve(saved); });
    expect(mounted!.host.querySelector('progress')).toBeNull();
    expect(feedback()?.textContent).toContain("Nenhum corte novo foi aprovado");
    expect(feedback()?.textContent).toContain("contexto e conclusão");
    expect(feedback()?.textContent).not.toContain("se repetiram");
    expect(mounted!.host.querySelector('[aria-label="Clipes salvos"]')?.textContent).toContain("1 clipes preservados");
    await act(async () => { mounted!.host.querySelector<HTMLButtonElement>('[aria-label="Fechar aviso"]')!.click(); });
    expect(feedback()).toBeNull();
    await mounted!.click("Gerar cortes");
    await act(async () => { mounted!.host.querySelector<HTMLButtonElement>('dialog .upload-primary')!.click(); });
    expect(feedback()?.textContent).toContain("Nenhum corte novo foi aprovado");
  });

  it("não transforma resposta inválida em sucesso só porque o backend terminou", async () => {
    await start();
    await act(async () => { terminal("completed"); resolve({ ...saved, clips: [{ ...saved.clips[0], end: -1 }] }); });
    expect(mounted!.host.querySelector('dialog[open] [role="alert"]')?.textContent).toContain("formato inválido");
    expect(feedback()?.getAttribute("role")).toBe("alert");
    expect(mounted!.host.textContent).not.toContain("novo corte adicionado");
    await act(async () => { bus.handlers.forEach(handler => handler({ payload: latest })); });
    expect(mounted!.host.querySelector('dialog[open] [role="alert"]')?.textContent).toContain("formato inválido");
    expect(feedback()?.getAttribute("role")).toBe("alert");
  });

  it("mantém o erro visível mesmo depois de fechar a janela de processamento", async () => {
    await start();
    const error = "Não encontramos cortes com abertura e fechamento completos nesta rodada.";
    await act(async () => { terminal("failed", error); reject(new Error(error)); });
    expect(mounted!.host.querySelector('dialog[open] [role="alert"]')?.textContent).toContain("abertura");
    await act(async () => { mounted!.host.querySelector<HTMLButtonElement>('[aria-label="Fechar janela"]')!.click(); });
    expect(feedback()?.textContent).toContain("abertura");
    expect(feedback()?.textContent).not.toContain("espaço disponível");
    expect(mounted!.host.querySelector('dialog[open]')).toBeNull();
  });

  it("cancelamento não é apresentado como erro nem sucesso", async () => {
    await start();
    await act(async () => { terminal("cancelled"); reject(new Error("cancelado")); });
    expect(feedback()).toBeNull();
    expect(mounted!.host.querySelector('dialog[open]')).toBeNull();
  });

  it("informa a quantidade realmente adicionada quando há um corte novo", async () => {
    await start();
    await act(async () => { terminal("completed"); resolve({ ...saved, clips: [...saved.clips, { ...saved.clips[0], id: "b".repeat(64), start: 40, end: 70 }] }); });
    expect(feedback()?.getAttribute("role")).toBe("status");
    expect(feedback()?.textContent).toContain("1 novo corte adicionado");
    expect(mounted!.host.querySelector('[aria-label="Clipes salvos"]')?.textContent).toContain("2 clipes preservados");
  });
});

