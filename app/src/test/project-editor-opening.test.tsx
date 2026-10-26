import { act, lazy } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { emptyWorkspace } from "../lib/workspace";
import { ProjectWorkspace } from "../screens/ProjectWorkspace";
import { reactHost } from "./react-host";

const state = vi.hoisted(() => ({
  mode: "pending" as "pending" | "render-error" | "import-error" | "ready",
  pending: Promise.resolve() as Promise<void>,
  resolve: () => {},
  change: vi.fn(),
  save: vi.fn(),
}));
const rejectedImport = lazy(() => Promise.reject(new TypeError("detalhe privado de teste")));

vi.mock("../hooks/useWorkspaceData", () => ({ useWorkspaceData: () => ({
  data: emptyWorkspace(), dirty: false, notice: null, change: state.change, save: state.save,
}) }));
vi.mock("../hooks/useTranscription", () => ({ useTranscription: () => ({ busy: false }) }));
vi.mock("../hooks/useClips", () => ({ useClips: () => ({ busy: false, loading: false, collection: null }) }));
vi.mock("../components/workspace/ProjectDeleteButton", () => ({ ProjectDeleteButton: () => null }));
vi.mock("../components/editor/VideoEditor", () => ({ VideoEditor: () => {
  if (state.mode === "pending") throw state.pending;
  if (state.mode === "render-error") throw new TypeError("detalhe privado de teste");
  if (state.mode === "import-error") { const RejectedImport = rejectedImport; return <RejectedImport />; }
  return <section aria-label="Editor de teste" />;
} }));

let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
beforeEach(() => {
  state.mode = "pending";
  state.pending = new Promise<void>(resolve => { state.resolve = resolve; });
  vi.clearAllMocks();
});
afterEach(async () => { await mounted?.close(); mounted = undefined; vi.restoreAllMocks(); });

function workspace(origin: "overview" | "library" = "overview", onReturnToLibrary?: () => void) {
  return <ProjectWorkspace project={{ id: "p", name: "Projeto", created_at_ms: 1, updated_at_ms: 1, last_opened_at_ms: null }}
    initialView="editor" initialEditorOrigin={origin} onReturnToLibrary={onReturnToLibrary}
    onRename={async () => {}} onImport={() => {}} onDelete={async () => {}} />;
}

it("permite voltar ao projeto durante a abertura e ignora a conclusão depois da saída", async () => {
  mounted = await reactHost(workspace());
  expect(mounted.host.querySelector('[role="status"]')?.textContent).toContain("Abrindo editor");
  await mounted.click("Voltar ao projeto");
  expect(mounted.host.textContent).toContain("Este projeto não tem um vídeo.");
  await act(async () => { state.mode = "ready"; state.resolve(); });
  expect(mounted.host.querySelector('[aria-label="Editor de teste"]')).toBeNull();
  expect(state.change).not.toHaveBeenCalled();
  expect(state.save).not.toHaveBeenCalled();
});

it("contém a falha de render e permite voltar sem alterar o projeto salvo", async () => {
  state.mode = "render-error";
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  mounted = await reactHost(workspace(), environment => environment.localStorage.setItem("projeto-preservado", "original"));
  expect(mounted.host.querySelector('[role="alert"]')?.textContent).toContain("Não foi possível abrir o editor");
  await mounted.click("Voltar ao projeto");
  expect(mounted.host.textContent).toContain("Este projeto não tem um vídeo.");
  expect(localStorage.getItem("projeto-preservado")).toBe("original");
  expect(state.change).not.toHaveBeenCalled();
  expect(state.save).not.toHaveBeenCalled();
  const diagnostic = errors.mock.calls.find(call => String(call[0]).startsWith("[editor]"));
  expect(diagnostic).toBeDefined();
  expect(JSON.stringify(diagnostic)).not.toContain("detalhe privado");
});

it("contém import rejeitado e mantém o retorno à biblioteca de origem", async () => {
  state.mode = "import-error";
  vi.spyOn(console, "error").mockImplementation(() => {});
  const onReturnToLibrary = vi.fn();
  mounted = await reactHost(workspace("library", onReturnToLibrary));
  expect(mounted.host.querySelector('[role="alert"]')?.textContent).toContain("Não foi possível abrir o editor");
  await mounted.click("Voltar à biblioteca");
  expect(onReturnToLibrary).toHaveBeenCalledOnce();
  expect(state.change).not.toHaveBeenCalled();
  expect(state.save).not.toHaveBeenCalled();
});
