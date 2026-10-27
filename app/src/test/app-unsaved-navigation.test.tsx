import { act, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import type { Composition } from "../lib/composition-types";
import type { ProjectMeta } from "../lib/types";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";

const native = vi.hoisted(() => ({ closeHandler: null as ((event: { preventDefault: () => void }) => void | Promise<void>) | null,
  unlisten: vi.fn(), destroy: vi.fn(async () => undefined), native: true }));
const projects: ProjectMeta[] = [{ id: "one", name: "Um", created_at_ms: 1, updated_at_ms: 1, last_opened_at_ms: null },
  { id: "two", name: "Dois", created_at_ms: 1, updated_at_ms: 1, last_opened_at_ms: null }];

vi.mock("@tauri-apps/api/core", async importOriginal => ({ ...await importOriginal<typeof import("@tauri-apps/api/core")>(), isTauri: () => native.native }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ onCloseRequested: vi.fn(async (handler: typeof native.closeHandler) => {
  native.closeHandler = handler; return native.unlisten;
}), destroy: native.destroy }) }));
vi.mock("../lib/ipc", () => ({ listProjects: vi.fn(async () => projects), listCollections: vi.fn(async () => []), openProject: vi.fn(async (id: string) => projects.find(project => project.id === id)),
  loadEditorProject: vi.fn(async () => ({ version: 1, project: null, clips: {} })), getEditorRecovery: vi.fn(async () => null),
  saveEditorRecovery: vi.fn(async () => undefined), discardEditorRecovery: vi.fn(async () => undefined),
  getMedia: vi.fn(async () => ({ sha256: "source", ext: "mp4", analysis: { durationMs: 10000, width: 1920, height: 1080, fps: 30, hasAudio: true } })),
  saveEditorDocument: vi.fn(async (_project: string, _clip: string | null, document: Composition, revision: number) => ({ document: { ...document, revision: revision + 1 }, manuallyEdited: false, editedAtMs: 1 })),
  mediaUrl: vi.fn(() => "source.mp4") }));
vi.mock("../hooks/useSplashPhase", () => ({ useSplashPhase: () => ({ visible: false }) }));
vi.mock("../components/WindowTitlebar", () => ({ WindowTitlebar: () => null }));
vi.mock("../components/shell/AppShell", () => ({ AppShell: ({ children, onNavigateHome, onNavigateProjects }: {
  children: ReactNode; onNavigateHome: () => void; onNavigateProjects: (view: string) => void;
}) => <main><button onClick={onNavigateHome}>Início global</button><button onClick={() => onNavigateProjects("all")}>Projetos globais</button>{children}</main> }));
vi.mock("../screens/HomeScreen", () => ({ HomeScreen: () => <p>Home aberta</p> }));
vi.mock("../screens/ProjectsScreen", () => ({ ProjectsScreen: ({ onOpen }: { onOpen: (id: string) => void }) => <section aria-label="Lista de projetos">
  {projects.map(project => <button key={project.id} onClick={() => onOpen(project.id)}>Abrir {project.name}</button>)}
</section> }));
vi.mock("../screens/ProjectWorkspace", async () => {
  const { VideoEditor } = await import("../components/editor/VideoEditor");
  return { ProjectWorkspace: ({ project }: { project: ProjectMeta }) => {
    const data = emptyWorkspace();
    data.media = { kind: "local", mediaId: "source", name: "Fonte.mp4", duration: 10, width: 1920, height: 1080, videoId: null, url: null };
    return <VideoEditor projectId={project.id} title={project.name} data={data} localUrl="source.mp4" dirty={false} onChange={vi.fn()} onSave={vi.fn()} onBack={vi.fn()} />;
  } };
});
vi.mock("../components/editor/CompositionStage", () => ({ CompositionStage: () => <div>Prévia simulada</div> }));
vi.mock("../components/editor/CompositionSource", () => ({ CompositionSource: () => null }));
vi.mock("../hooks/useTimelinePreview", () => ({ useTimelinePreview: () => ({ frames: [], peaks: [], error: null }) }));
const ipc = await import("../lib/ipc");
let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;

beforeEach(() => { native.closeHandler = null; native.native = true; });
afterEach(async () => { await mounted?.close(); mounted = undefined; vi.clearAllMocks(); });

async function openDirtyEditor() {
  mounted = await reactHost(<App />);
  await mounted.click("Projetos globais");
  await mounted.click("Abrir Um");
  await trim();
  expect(mounted.host.querySelector('[data-testid="editor-save-status"]')!.textContent).toContain("não salvas");
}
async function trim() {
  const edge = mounted!.host.querySelector<HTMLElement>('[aria-label="Ajustar fim de Fonte.mp4"]')!;
  await act(async () => { edge.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true })); });
}

describe("saída global com alterações da montagem", () => {
  it("sidebar oferece continuar e preserva o rascunho sem salvar", async () => {
    await openDirtyEditor();
    await mounted!.click("Início global");
    expect(mounted!.host.querySelector('[data-testid="video-editor"]')).not.toBeNull();
    expect(mounted!.host.textContent).toContain("Salvar alterações antes de sair?");
    await mounted!.click("Continuar editando");
    expect(mounted!.host.querySelector('[data-testid="editor-save-status"]')!.textContent).toContain("não salvas");
    expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
  });

  it("descarta explicitamente antes de navegar para a lista e abrir outro projeto", async () => {
    await openDirtyEditor();
    await mounted!.click("Projetos globais");
    await mounted!.click("Descartar e sair");
    expect(ipc.discardEditorRecovery).toHaveBeenCalledWith("one", null);
    expect(mounted!.host.querySelector('[data-testid="video-editor"]')).toBeNull();
    await mounted!.click("Abrir Dois");
    expect(mounted!.host.querySelector("h1")!.textContent).toBe("Dois");
    expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
  });

  it("espera a confirmação da revisão salva antes de navegar", async () => {
    let finish!: () => void;
    vi.mocked(ipc.saveEditorDocument).mockImplementationOnce(async (_project, _clip, document, revision) => {
      await new Promise<void>(resolve => { finish = resolve; });
      return { document: { ...document, revision: revision + 1 }, manuallyEdited: false, editedAtMs: 1 };
    });
    await openDirtyEditor();
    await mounted!.click("Início global");
    await mounted!.click("Salvar e sair");
    expect(mounted!.host.querySelector('[data-testid="video-editor"]')).not.toBeNull();
    await act(async () => { finish(); });
    expect(mounted!.host.textContent).toContain("Home aberta");
    expect(ipc.saveEditorDocument).toHaveBeenCalledOnce();
  });

  it("falha ao salvar mantém editor e diálogo abertos", async () => {
    vi.mocked(ipc.saveEditorDocument).mockRejectedValueOnce("Disco cheio");
    await openDirtyEditor();
    await mounted!.click("Início global");
    await mounted!.click("Salvar e sair");
    expect(mounted!.host.querySelector('[data-testid="video-editor"]')).not.toBeNull();
    expect(mounted!.host.querySelector("dialog[open] [role=alert]")).not.toBeNull();
    await mounted!.click("Continuar editando");
    expect(mounted!.host.querySelector('[data-testid="editor-save-status"]')!.textContent).toContain("não salvas");
  });

  it("falha ao descartar mantém o rascunho em memória e permite continuar", async () => {
    vi.mocked(ipc.discardEditorRecovery).mockRejectedValueOnce("Recuperação ocupada");
    await openDirtyEditor();
    await mounted!.click("Início global");
    await mounted!.click("Descartar e sair");
    expect(mounted!.host.querySelector("dialog[open] [role=alert]")).not.toBeNull();
    await mounted!.click("Continuar editando");
    expect(mounted!.host.querySelector('[data-testid="editor-save-status"]')!.textContent).toContain("não salvas");
    expect(ipc.saveEditorDocument).not.toHaveBeenCalled();
  });

  it("uma edição que chega durante a gravação impede sair com revisão antiga", async () => {
    let finish!: () => void;
    vi.mocked(ipc.saveEditorDocument).mockImplementationOnce(async (_project, _clip, document, revision) => {
      await new Promise<void>(resolve => { finish = resolve; });
      return { document: { ...document, revision: revision + 1 }, manuallyEdited: false, editedAtMs: 1 };
    });
    await openDirtyEditor();
    await mounted!.click("Início global");
    await mounted!.click("Salvar e sair");
    await trim();
    await act(async () => { finish(); });
    expect(mounted!.host.querySelector('[data-testid="video-editor"]')).not.toBeNull();
    expect(mounted!.host.querySelector("dialog[open] [role=alert]")!.textContent).toContain("alterações novas");
    await mounted!.click("Continuar editando");
    expect(mounted!.host.querySelector('[data-testid="editor-save-status"]')!.textContent).toContain("não salvas");
  });

  it("intercepta fechamento nativo e oferece continuar sem fechar", async () => {
    await openDirtyEditor();
    expect(native.closeHandler).not.toBeNull();
    const event = { preventDefault: vi.fn() };
    let closed: void | Promise<void>;
    await act(async () => { closed = native.closeHandler!(event); });
    await mounted!.click("Continuar editando");
    await closed!;
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(native.destroy).not.toHaveBeenCalled();
    expect(mounted!.host.querySelector('[data-testid="video-editor"]')).not.toBeNull();
  });

  it("autoriza o fechamento nativo somente depois de confirmar o salvamento", async () => {
    await openDirtyEditor();
    const event = { preventDefault: vi.fn() };
    let closed: void | Promise<void>;
    await act(async () => { closed = native.closeHandler!(event); });
    await mounted!.click("Salvar e sair");
    await closed!;
    expect(ipc.saveEditorDocument).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(native.destroy).toHaveBeenCalledOnce();
  });

  it("avisa antes de recarregar uma janela com trabalho não salvo", async () => {
    await openDirtyEditor();
    const event = new window.Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
