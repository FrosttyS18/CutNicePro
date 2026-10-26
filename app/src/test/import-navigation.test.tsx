import { act, useState, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import App from "../App";
import type { UploadOptions } from "../lib/workspace-types";
import { ImportRollbackError } from "../services/import-project";
import { prepareProject } from "../services/prepare-project";
import { addProjectToCollection, listProjects } from "../lib/ipc";
import { reactHost } from "./react-host";

const current = vi.hoisted(() => ({ tool: "captions" }));
vi.mock("../lib/ipc", () => ({ listProjects: vi.fn(async () => []), addProjectToCollection: vi.fn(async () => {}),
  openProject: vi.fn(async (id: string) => ({ id })),
  listCollections: vi.fn(async () => [{ id: "collection", name: "Coleção", icon: "heart", project_ids: [], created_at_ms: 1, updated_at_ms: 1 }]) }));
vi.mock("../services/prepare-project", () => ({ prepareProject: vi.fn() }));
vi.mock("../hooks/useSplashPhase", () => ({ useSplashPhase: () => ({ visible: false }) }));
vi.mock("../components/WindowTitlebar", () => ({ WindowTitlebar: () => null }));
vi.mock("../components/shell/AppShell", () => ({ AppShell: ({ children, onNavigateHome, onNavigateProjects }: {
  children: ReactNode; onNavigateHome: () => void; onNavigateProjects: (view: string) => void;
}) => <main><button onClick={onNavigateHome}>Home</button><button onClick={() => onNavigateProjects("all")}>Projetos</button>
  <button onClick={() => onNavigateProjects("collections")}>Coleções</button>{children}</main> }));
vi.mock("../screens/HomeScreen", () => ({ HomeScreen: ({ onCreate }: { onCreate: () => void }) => <button onClick={onCreate}>Novo projeto</button> }));
vi.mock("../screens/ProjectWorkspace", () => ({ ProjectWorkspace: ({ initialView }: { initialView: string }) => <p>Destino {initialView}</p> }));
vi.mock("../screens/ProjectsScreen", () => ({ ProjectsScreen: ({ onCreate }: { onCreate: () => void }) => <button onClick={onCreate}>Criar em projetos</button> }));
vi.mock("../screens/CollectionsScreen", () => ({ CollectionsScreen: ({ onOpen }: { onOpen: (id: string) => void }) => <button onClick={() => onOpen("collection")}>Abrir coleção</button> }));
vi.mock("../screens/CollectionScreen", () => ({ CollectionScreen: ({ onCreate }: { onCreate: () => void }) => <button onClick={onCreate}>Criar na coleção</button> }));
vi.mock("../screens/UploadScreen", () => ({ UploadScreen: ({ onFilePath, projects }: {
  onFilePath: (path: string, name: string, options: UploadOptions, progress: () => void) => Promise<void>;
  projects: { id: string }[];
}) => {
  const [error, setError] = useState("");
  return <section><p>Recentes {projects.length}</p><button onClick={() => {
    const tool = current.tool === "clips" ? "clips" : "captions";
    void onFilePath("C:\\video.mp4", "Projeto", { tool, ratio: "9:16", model: 1 }, () => {}).catch((cause: unknown) => setError(String(cause)));
  }}>Importar no aplicativo</button><p>{error}</p></section>;
} }));

let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await mounted?.close(); mounted = undefined; vi.clearAllMocks(); current.tool = "captions"; });
const project = { id: "new", name: "Projeto", created_at_ms: 1, updated_at_ms: 1, last_opened_at_ms: null };

it("objetivo de legenda prepara e abre visão geral sem sobrescrever as opções salvas", async () => {
  vi.mocked(prepareProject).mockResolvedValue({ project, notice: null });
  mounted = await reactHost(<App />);
  await mounted.click("Novo projeto"); await mounted.click("Importar no aplicativo");
  expect(mounted.host.textContent).toContain("Destino overview");
  expect(prepareProject).toHaveBeenCalledWith("C:\\video.mp4", "Projeto", { tool: "captions", ratio: "9:16", model: 1 }, expect.any(Function), undefined, undefined);
});

it("objetivo de cortes abre projeto com processamento explícito", async () => {
  current.tool = "clips";
  vi.mocked(prepareProject).mockResolvedValue({ project, notice: null });
  mounted = await reactHost(<App />);
  await mounted.click("Novo projeto"); await mounted.click("Importar no aplicativo");
  expect(mounted.host.textContent).toContain("Destino overview");
});

it("falha de importação mantém envio e não adiciona projeto vazio aos recentes", async () => {
  vi.mocked(prepareProject).mockRejectedValue(new Error("Arquivo inválido"));
  mounted = await reactHost(<App />);
  await mounted.click("Novo projeto"); await mounted.click("Importar no aplicativo");
  expect(mounted.host.textContent).toContain("Arquivo inválido");
  expect(mounted.host.textContent).toContain("Recentes 0");
  expect(mounted.host.textContent).not.toContain("Destino");
});

it("falha de rollback expõe ID e recarrega a lista persistida sem navegar", async () => {
  vi.mocked(prepareProject).mockRejectedValue(new ImportRollbackError("new", new Error("Cópia falhou"), new Error("Pasta ocupada")));
  mounted = await reactHost(<App />);
  await mounted.click("Novo projeto"); await mounted.click("Importar no aplicativo");
  expect(mounted.host.textContent).toContain("tentativa new");
  expect(mounted.host.textContent).toContain("Pasta ocupada");
  expect(listProjects).toHaveBeenCalledTimes(2);
  expect(mounted.host.textContent).not.toContain("Destino");
});

it("criar por projetos usa o mesmo envio", async () => {
  vi.mocked(prepareProject).mockResolvedValue({ project, notice: null });
  mounted = await reactHost(<App />);
  await mounted.click("Projetos"); await mounted.click("Criar em projetos");
  await mounted.click("Importar no aplicativo");
  expect(mounted.host.textContent).toContain("Destino overview");
  expect(prepareProject).toHaveBeenCalledTimes(1);
});

it("criar por uma coleção usa o envio e associa o projeto preservado mesmo sem ASR", async () => {
  vi.mocked(prepareProject).mockResolvedValue({ project, notice: "Transcrição cancelada. Você pode editar." });
  mounted = await reactHost(<App />);
  await mounted.click("Coleções"); await mounted.click("Abrir coleção"); await mounted.click("Criar na coleção");
  await mounted.click("Importar no aplicativo");
  expect(addProjectToCollection).toHaveBeenCalledWith("collection", "new");
  expect(mounted.host.textContent).toContain("Destino overview");
  expect(mounted.host.textContent).toContain("Transcrição cancelada");
});

it("conclusão em segundo plano oferece abrir sem interromper a navegação atual", async () => {
  let finish!: (result: Awaited<ReturnType<typeof prepareProject>>) => void;
  vi.mocked(prepareProject).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  mounted = await reactHost(<App />);
  await mounted.click("Novo projeto"); await mounted.click("Importar no aplicativo");
  await mounted.click("Home");
  await act(async () => { finish({ project, notice: null }); });
  expect(mounted.host.textContent).not.toContain("Destino overview");
  expect(mounted.host.textContent).toContain("Abrir projeto");
  vi.mocked(listProjects).mockResolvedValueOnce([project]);
  await mounted.click("Abrir projeto");
  expect(mounted.host.textContent).toContain("Destino overview");
});
