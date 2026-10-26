import { act, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import App from "../App";
import type { ProjectMeta } from "../lib/types";
import { reactHost } from "./react-host";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => false }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock("../hooks/useSplashPhase", () => ({ useSplashPhase: () => ({ visible: false }) }));
vi.mock("../components/WindowTitlebar", () => ({ WindowTitlebar: () => null }));
vi.mock("../screens/HomeScreen", () => ({ HomeScreen: () => null }));
vi.mock("../screens/ProjectWorkspace", () => ({ ProjectWorkspace: () => null }));
vi.mock("../screens/UploadScreen", () => ({ UploadScreen: () => null }));
vi.mock("../services/project-preparation-state", () => ({
  reconcilePreparations: vi.fn(async () => ({ failed: [] })), readPreparation: vi.fn(() => null),
}));
vi.mock("../components/shell/AppShell", () => ({
  AppShell: ({ children, onToggleExpanded, onNavigateProjects }: {
    children: ReactNode; onToggleExpanded: () => void; onNavigateProjects: (view: "all") => void;
  }) => <main><button onClick={() => onNavigateProjects("all")}>Projetos</button>
    <button onClick={onToggleExpanded}>Alternar menu</button>{children}</main>,
}));
vi.mock("../screens/ProjectsScreen", async () => {
  const { useClipLibrary } = await import("../hooks/useClipLibrary");
  return { ProjectsScreen: ({ projects, onRetry }: { projects: ProjectMeta[]; onRetry: () => void }) => {
    const library = useClipLibrary(projects);
    return <section><output aria-label="Ordem dos projetos">{projects.map(project => project.id).join(",")}</output>
      <output aria-label="Clipes da biblioteca">{library.entries.map(entry => entry.clip.title).join(",")}</output>
      <button onClick={library.reload}>Recarregar clipes</button><button onClick={onRetry}>Atualizar projetos</button></section>;
  } };
});

let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
let projects: ProjectMeta[];
let title: string;

beforeEach(() => {
  projects = [{ id: "one", name: "Um", created_at_ms: 1, updated_at_ms: 1, last_opened_at_ms: null }];
  title = "Clipe inicial";
  vi.mocked(invoke).mockImplementation(async command => {
    if (command === "list_projects") return projects;
    if (command === "list_collections") return [];
    if (command === "load_editor_project") return { version: 1, project: null, clips: {} };
    if (command === "get_project_clips") return { version: 1, mediaId: "source", transcriptHash: "hash", clips: [
      { id: "a".repeat(64), start: 0, end: 10, title, score: 80, reasons: [], review: "pending" },
    ] };
    throw new Error(`IPC inesperado: ${command}`);
  });
});
afterEach(async () => { await mounted?.close(); mounted = undefined; vi.clearAllMocks(); });

function calls(command: string) {
  return vi.mocked(invoke).mock.calls.filter(([name]) => name === command).length;
}
async function openLibrary() {
  mounted = await reactHost(<App />);
  await mounted.click("Projetos");
}

it("não repete leituras da biblioteca em rerenders sem alteração dos projetos", async () => {
  await openLibrary();
  expect(calls("get_project_clips")).toBe(1);
  expect(calls("load_editor_project")).toBe(1);
  await mounted!.click("Alternar menu");
  await mounted!.render(<App />);
  expect(calls("get_project_clips")).toBe(1);
  expect(calls("load_editor_project")).toBe(1);
});

it("atualiza os clipes após salvar e após recarregamento explícito", async () => {
  await openLibrary();
  expect(mounted!.host.querySelector('[aria-label="Clipes da biblioteca"]')!.textContent).toBe(title);
  title = "Revisão salva";
  await act(async () => { window.dispatchEvent(new window.CustomEvent("cnp:editor-saved", { detail: { projectId: "one", revision: 2 } })); });
  expect(mounted!.host.querySelector('[aria-label="Clipes da biblioteca"]')!.textContent).toBe(title);
  expect(calls("get_project_clips")).toBe(2);
  title = "Revisão recarregada";
  await mounted!.click("Recarregar clipes");
  expect(mounted!.host.querySelector('[aria-label="Clipes da biblioteca"]')!.textContent).toBe(title);
  expect(calls("get_project_clips")).toBe(3);
});

it("reordena e recarrega quando a lista de projetos é atualizada", async () => {
  await openLibrary();
  projects = [...projects, { id: "two", name: "Dois", created_at_ms: 2, updated_at_ms: 2, last_opened_at_ms: null }];
  await mounted!.click("Atualizar projetos");
  expect(mounted!.host.querySelector('[aria-label="Ordem dos projetos"]')!.textContent).toBe("two,one");
  expect(calls("list_projects")).toBe(2);
  expect(calls("get_project_clips")).toBe(3);
  expect(calls("load_editor_project")).toBe(3);
});
