import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import App from "../App";
import * as ipc from "../lib/ipc";
import { readWorkspace, saveWorkspace } from "../services/workspace-store";
import { emptyWorkspace } from "../lib/workspace";
import { reactHost } from "./react-host";

const project = { id: "f0834a57-0831-45bc-ac41-c5904fd39239", name: "Nova edição", created_at_ms: 1, updated_at_ms: 1, last_opened_at_ms: null };
let knownProjects: typeof project[] = [];
vi.mock("../lib/ipc", () => ({
  listProjects: vi.fn(async () => knownProjects), listCollections: vi.fn(async () => []),
  createProject: vi.fn(), openProject: vi.fn(async () => project), deleteProject: vi.fn(async () => undefined),
  loadEditorProject: vi.fn(async () => ({ version: 1, project: null, clips: {} })),
  getEditorRecovery: vi.fn(async () => null),
}));
vi.mock("../hooks/useSplashPhase", () => ({ useSplashPhase: () => ({ visible: false }) }));
vi.mock("../components/WindowTitlebar", () => ({ WindowTitlebar: () => null }));
vi.mock("../screens/HomeScreen", () => ({ HomeScreen: () => <p>Home</p> }));
vi.mock("../screens/ProjectWorkspace", () => ({ ProjectWorkspace: ({ initialView, project }: { initialView: string; project: { name: string } }) => <p>Workspace {project.name} {initialView}</p> }));
vi.mock("../screens/ProjectsScreen", () => ({ ProjectsScreen: ({ projects, onOpen }: { projects: typeof project[]; onOpen: (id: string) => void }) => <div>{projects.map(entry => <button key={entry.id} onClick={() => onOpen(entry.id)}>Abrir {entry.name}</button>)}</div> }));
let view: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await view?.close(); view = undefined; vi.clearAllMocks(); knownProjects = []; });
async function mount() { vi.mocked(ipc.createProject).mockImplementation(async () => { knownProjects = [project]; return project; }); view = await reactHost(<App/>); }
async function click(label: string) {
  const button = [...view!.host.querySelectorAll<HTMLButtonElement>("button")].find(value => value.getAttribute("aria-label") === label || value.textContent?.trim() === label);
  expect(button, label).toBeDefined();
  await act(async () => button!.click());
}

it("Editor abre uma edição sem mídia, volta por projetos e reutiliza apenas a edição vazia", async () => {
  await mount(); await click("Editor");
  expect(view!.host.textContent).toContain("Workspace Nova edição editor");
  expect(readWorkspace(project.id).media).toBeNull();
  expect(readWorkspace(project.id).transcript).toEqual([]);
  expect(view!.host.querySelector('[aria-label="Editor"]')?.getAttribute("aria-current")).toBe("page");
  await click("Editor");
  expect(ipc.createProject).toHaveBeenCalledTimes(1);
  await click("Meus Projetos"); await click("Abrir Nova edição");
  expect(view!.host.textContent).toContain("Workspace Nova edição editor");
  await click("Início"); await click("Editor");
  expect(ipc.createProject).toHaveBeenCalledTimes(1);
});

it("dois cliques enquanto cria não duplicam projeto e navegar para Home não é desfeito pela resposta tardia", async () => {
  await mount();
  let finish!: (value: typeof project) => void;
  vi.mocked(ipc.createProject).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await click("Editor"); await click("Editor");
  expect(ipc.createProject).toHaveBeenCalledTimes(1);
  await click("Início");
  await act(async () => finish(project));
  expect(view!.host.textContent).not.toContain("Workspace");
  await click("Meus Projetos");
  expect(view!.host.textContent).toContain("Abrir Nova edição");
});

it("erro de criação é mostrado e permite tentar novamente sem navegar para um projeto inexistente", async () => {
  await mount(); vi.mocked(ipc.createProject).mockRejectedValueOnce(new Error("Disco indisponível"));
  await click("Editor");
  expect(view!.host.textContent).toContain("Disco indisponível");
  expect(view!.host.textContent).not.toContain("Workspace");
  await click("Editor");
  expect(view!.host.textContent).toContain("Workspace Nova edição editor");
});

it("projeto comum continua abrindo a visão geral", async () => {
  knownProjects = [project];
  await mount(); saveWorkspace(project.id, emptyWorkspace());
  await click("Meus Projetos"); await click("Abrir Nova edição");
  expect(view!.host.textContent).toContain("Workspace Nova edição overview");
});
