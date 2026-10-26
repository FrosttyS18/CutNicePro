import { useState, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import App from "../App";
import type { UploadOptions } from "../lib/workspace-types";
import { importProject, ImportRollbackError } from "../services/import-project";
import { listProjects } from "../lib/ipc";
import { reactHost } from "./react-host";

const current = vi.hoisted(() => ({ tool: "captions" }));
vi.mock("../lib/ipc", () => ({ listProjects: vi.fn(async () => []), listCollections: vi.fn(async () => []) }));
vi.mock("../services/import-project", async (original) => ({ ...await original<typeof import("../services/import-project")>(), importProject: vi.fn() }));
vi.mock("../hooks/useSplashPhase", () => ({ useSplashPhase: () => ({ visible: false }) }));
vi.mock("../components/WindowTitlebar", () => ({ WindowTitlebar: () => null }));
vi.mock("../components/shell/AppShell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("../screens/HomeScreen", () => ({ HomeScreen: ({ onCreate }: { onCreate: () => void }) => <button onClick={onCreate}>Novo projeto</button> }));
vi.mock("../screens/ProjectWorkspace", () => ({ ProjectWorkspace: ({ initialView }: { initialView: string }) => <p>Destino {initialView}</p> }));
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

it("objetivo de legenda abre o editor sem sobrescrever as opções salvas", async () => {
  vi.mocked(importProject).mockResolvedValue(project);
  mounted = await reactHost(<App />);
  await mounted.click("Novo projeto"); await mounted.click("Importar no aplicativo");
  expect(mounted.host.textContent).toContain("Destino editor");
  expect(importProject).toHaveBeenCalledWith("C:\\video.mp4", "Projeto", { tool: "captions", ratio: "9:16", model: 1 }, expect.any(Function), undefined);
});

it("objetivo de cortes abre projeto com processamento explícito", async () => {
  current.tool = "clips";
  vi.mocked(importProject).mockResolvedValue(project);
  mounted = await reactHost(<App />);
  await mounted.click("Novo projeto"); await mounted.click("Importar no aplicativo");
  expect(mounted.host.textContent).toContain("Destino overview");
});

it("falha de importação mantém envio e não adiciona projeto vazio aos recentes", async () => {
  vi.mocked(importProject).mockRejectedValue(new Error("Arquivo inválido"));
  mounted = await reactHost(<App />);
  await mounted.click("Novo projeto"); await mounted.click("Importar no aplicativo");
  expect(mounted.host.textContent).toContain("Arquivo inválido");
  expect(mounted.host.textContent).toContain("Recentes 0");
  expect(mounted.host.textContent).not.toContain("Destino");
});

it("falha de rollback expõe ID e recarrega a lista persistida sem navegar", async () => {
  vi.mocked(importProject).mockRejectedValue(new ImportRollbackError("new", new Error("Cópia falhou"), new Error("Pasta ocupada")));
  mounted = await reactHost(<App />);
  await mounted.click("Novo projeto"); await mounted.click("Importar no aplicativo");
  expect(mounted.host.textContent).toContain("tentativa new");
  expect(mounted.host.textContent).toContain("Pasta ocupada");
  expect(listProjects).toHaveBeenCalledTimes(2);
  expect(mounted.host.textContent).not.toContain("Destino");
});
