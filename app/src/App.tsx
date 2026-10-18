import { useCallback, useEffect, useState } from "react";
import * as ipc from "./lib/ipc";
import type { ProjectMeta } from "./lib/types";
import { sortProjects } from "./lib/projects";
import { ErrorBanner } from "./components/ErrorBanner";
import { NewProjectDialog } from "./components/NewProjectDialog";
import { ProjectList } from "./components/ProjectList";
import { EmptyState } from "./components/EmptyState";
import { ProjectView } from "./components/ProjectView";

type View =
  | { kind: "home" }
  | { kind: "project"; project: ProjectMeta };

interface LoadState {
  status: "loading" | "ready" | "error";
  projects: ProjectMeta[];
  error: string | null;
}

export default function App() {
  const [view, setView] = useState<View>({ kind: "home" });
  const [load, setLoad] = useState<LoadState>({
    status: "loading",
    projects: [],
    error: null,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoad((s) => ({ ...s, status: "loading", error: null }));
    try {
      const projects = await ipc.listProjects();
      setLoad({ status: "ready", projects, error: null });
    } catch (e) {
      setLoad({
        status: "error",
        projects: [],
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreate(name: string) {
    // Cria e segue direto ao workspace vazio (AC-011). Erros sobem ao banner.
    const created = await ipc.createProject(name);
    setDialogOpen(false);
    setActionError(null);
    await refresh();
    setView({ kind: "project", project: created });
  }

  async function handleOpen(id: string) {
    const opened = await ipc.openProject(id);
    setActionError(null);
    await refresh();
    setView({ kind: "project", project: opened });
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__brand">
          <h1 className="app-header__logo">
            Cut<em>Nice</em>Pro
          </h1>
        </div>
        <div className="app-header__spacer" />
        <span className="chip chip--prototype">M1 · protótipo funcional</span>
        <span className="chip">v0.1.0</span>
      </header>

      <main className="app-main">
        {view.kind === "project" ? (
          <ProjectView
            project={view.project}
            onBack={() => setView({ kind: "home" })}
          />
        ) : (
          <>
            {load.status === "error" && (
              <ErrorBanner
                message={`Não foi possível carregar os projetos: ${load.error ?? "erro desconhecido"}`}
                onRetry={() => void refresh()}
              />
            )}
            {actionError && (
              <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />
            )}
            {load.status === "loading" && (
              <div className="state-banner" role="status">
                <span className="state-banner__text">Carregando projetos…</span>
              </div>
            )}
            {load.status === "ready" && load.projects.length === 0 && (
              <EmptyState onCreate={() => setDialogOpen(true)} />
            )}
            {load.status === "ready" && load.projects.length > 0 && (
              <section aria-label="Projetos">
                <div className="section-head">
                  <h2 className="section-head__title">Projetos</h2>
                  <span className="section-head__count">
                    {load.projects.length}{" "}
                    {load.projects.length === 1 ? "projeto" : "projetos"}
                  </span>
                  <div className="section-head__spacer" />
                  <button
                    className="btn btn--primary"
                    onClick={() => setDialogOpen(true)}
                  >
                    + Criar projeto
                  </button>
                </div>
                <ProjectList
                  projects={sortProjects(load.projects)}
                  onOpen={(id) =>
                    handleOpen(id).catch((e) =>
                      setActionError(
                        `Não foi possível abrir o projeto: ${e instanceof Error ? e.message : String(e)}`,
                      ),
                    )
                  }
                />
              </section>
            )}
          </>
        )}
      </main>

      {dialogOpen && (
        <NewProjectDialog
          onClose={() => setDialogOpen(false)}
          onCreate={(name) =>
            handleCreate(name).catch((e) => {
              setDialogOpen(false);
              setActionError(
                `Não foi possível criar o projeto: ${e instanceof Error ? e.message : String(e)}`,
              );
            })
          }
        />
      )}
    </div>
  );
}
