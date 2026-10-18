import { useCallback, useEffect, useState } from "react";
import * as ipc from "./lib/ipc";
import type { CollectionMeta, ProjectMeta } from "./lib/types";
import { sortProjects } from "./lib/projects";
import { projectsOf } from "./lib/collections";
import { loadSidebarExpanded, saveSidebarExpanded } from "./lib/prefs";
import { ErrorBanner } from "./components/ErrorBanner";
import { NewProjectDialog } from "./components/NewProjectDialog";
import { NewCollectionDialog } from "./components/NewCollectionDialog";
import { ProjectView } from "./components/ProjectView";
import { AppShell, type ProjectsSub } from "./components/shell/AppShell";
import type { Crumb } from "./components/shell/Breadcrumb";
import { SplashScreen } from "./screens/SplashScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { ProjectsScreen } from "./screens/ProjectsScreen";
import { CollectionsScreen } from "./screens/CollectionsScreen";
import { CollectionScreen } from "./screens/CollectionScreen";

type Route =
  | { kind: "home" }
  | { kind: "projects" }
  | { kind: "collections" }
  | { kind: "collection"; id: string }
  | { kind: "project"; id: string };

interface LoadState {
  status: "loading" | "ready" | "error";
  projects: ProjectMeta[];
  error: string | null;
}

interface CollectionsState {
  status: "loading" | "ready" | "error";
  collections: CollectionMeta[];
  error: string | null;
}

export default function App() {
  const [phase, setPhase] = useState<"splash" | "app">("splash");
  const [splashLeaving, setSplashLeaving] = useState(false);

  const [route, setRoute] = useState<Route>({ kind: "home" });
  const [load, setLoad] = useState<LoadState>({
    status: "loading",
    projects: [],
    error: null,
  });
  const [collectionsLoad, setCollectionsLoad] = useState<CollectionsState>({
    status: "loading",
    collections: [],
    error: null,
  });
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(() => loadSidebarExpanded());

  const refreshProjects = useCallback(async () => {
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

  const refreshCollections = useCallback(async () => {
    setCollectionsLoad((s) => ({ ...s, status: "loading", error: null }));
    try {
      const collections = await ipc.listCollections();
      setCollectionsLoad({ status: "ready", collections, error: null });
    } catch (e) {
      setCollectionsLoad({
        status: "error",
        collections: [],
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  // Boot: splash cobre apenas a leitura inicial real (sem delay artificial).
  useEffect(() => {
    let cancelled = false;
    void Promise.all([refreshProjects(), refreshCollections()]).finally(() => {
      if (cancelled) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) {
        setPhase("app");
        return;
      }
      setSplashLeaving(true);
      window.setTimeout(() => setPhase("app"), 270);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshProjects, refreshCollections]);

  function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    saveSidebarExpanded(next);
  }

  async function handleCreateProject(name: string) {
    const created = await ipc.createProject(name);
    setProjectDialogOpen(false);
    setActionError(null);
    await refreshProjects();
    setRoute({ kind: "project", id: created.id });
  }

  async function handleOpenProject(id: string) {
    const opened = await ipc.openProject(id);
    setActionError(null);
    await refreshProjects();
    setRoute({ kind: "project", id: opened.id });
  }

  async function handleCreateCollection(name: string, icon: "heart" | "archive-box") {
    const created = await ipc.createCollection(name, icon);
    setCollectionDialogOpen(false);
    setActionError(null);
    await refreshCollections();
    setRoute({ kind: "collection", id: created.id });
  }

  async function handleAddToCollection(collectionId: string, projectId: string) {
    await ipc.addProjectToCollection(collectionId, projectId);
    await refreshCollections();
  }

  async function handleRemoveFromCollection(collectionId: string, projectId: string) {
    await ipc.removeProjectFromCollection(collectionId, projectId);
    await refreshCollections();
  }

  // ---- Derivações da rota atual ----
  const currentProject =
    route.kind === "project"
      ? load.projects.find((p) => p.id === route.id) ?? null
      : null;
  const currentCollection =
    route.kind === "collection"
      ? collectionsLoad.collections.find((c) => c.id === route.id) ?? null
      : null;

  const section = route.kind === "home" ? "home" : "projects";
  const projectsSub: ProjectsSub =
    route.kind === "collections" || route.kind === "collection"
      ? "collections"
      : "all";

  const goHome = () => setRoute({ kind: "home" });
  const goProjects = (sub: ProjectsSub) =>
    setRoute(sub === "collections" ? { kind: "collections" } : { kind: "projects" });

  const crumbs: Crumb[] =
    route.kind === "home"
      ? [{ label: "Home", navigate: goHome }, { label: "Início" }]
      : route.kind === "projects"
        ? [{ label: "Meus Projetos", navigate: () => goProjects("all") }, { label: "Todos" }]
        : route.kind === "collections"
          ? [
              { label: "Meus Projetos", navigate: () => goProjects("all") },
              { label: "Coleções" },
            ]
          : route.kind === "collection"
            ? [
                { label: "Meus Projetos", navigate: () => goProjects("all") },
                { label: "Coleções", navigate: () => goProjects("collections") },
                { label: currentCollection?.name ?? "Coleção" },
              ]
            : [
                { label: "Meus Projetos", navigate: () => goProjects("all") },
                { label: currentProject?.name ?? "Projeto" },
              ];

  const guard = (fn: () => Promise<void>) =>
    fn().catch((e) =>
      setActionError(e instanceof Error ? e.message : String(e)),
    );

  return (
    <>
      {phase === "splash" && <SplashScreen leaving={splashLeaving} />}

      <AppShell
        expanded={expanded}
        onToggleExpanded={toggleExpanded}
        section={section}
        projectsSub={projectsSub}
        crumbs={crumbs}
        onNavigateHome={goHome}
        onNavigateProjects={goProjects}
      >
        {actionError && (
          <div className="panel-error">
            <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />
          </div>
        )}

        {route.kind === "home" && <HomeScreen onCreate={() => setProjectDialogOpen(true)} />}

        {route.kind === "projects" && (
          <ProjectsScreen
            projects={sortProjects(load.projects)}
            loading={load.status === "loading"}
            error={load.status === "error" ? load.error : null}
            onRetry={() => void refreshProjects()}
            onCreate={() => setProjectDialogOpen(true)}
            onOpen={(id) => void guard(() => handleOpenProject(id))}
          />
        )}

        {route.kind === "collections" && (
          <>
            {collectionsLoad.status === "error" && (
              <ErrorBanner
                message={`Não foi possível carregar as coleções: ${collectionsLoad.error ?? "erro desconhecido"}`}
                onRetry={() => void refreshCollections()}
              />
            )}
            <CollectionsScreen
              collections={collectionsLoad.collections}
              onCreate={() => setCollectionDialogOpen(true)}
              onOpen={(id) => setRoute({ kind: "collection", id })}
            />
          </>
        )}

        {route.kind === "collection" &&
          (currentCollection ? (
            <CollectionScreen
              name={currentCollection.name}
              icon={currentCollection.icon}
              updatedAtMs={currentCollection.updated_at_ms}
              projects={projectsOf(currentCollection, load.projects)}
              allProjects={load.projects}
              onAdd={(projectId) =>
                void guard(() => handleAddToCollection(currentCollection.id, projectId))
              }
              onRemove={(projectId) =>
                void guard(() => handleRemoveFromCollection(currentCollection.id, projectId))
              }
              onOpen={(id) => void guard(() => handleOpenProject(id))}
            />
          ) : (
            <div className="lib">
              <div className="lib__empty">
                <p className="lib__empty-title">Coleção não encontrada</p>
                <p className="lib__empty-text">
                  Ela pode ter sido removida. Volte para Coleções para ver as existentes.
                </p>
              </div>
            </div>
          ))}

        {route.kind === "project" &&
          (currentProject ? (
            <ProjectView
              project={currentProject}
              onBack={() => setRoute({ kind: "projects" })}
            />
          ) : (
            <div className="lib">
              <div className="lib__empty">
                <p className="lib__empty-title">Projeto não encontrado</p>
                <p className="lib__empty-text">
                  Ele pode ter sido removido. Volte para Todos para ver os existentes.
                </p>
              </div>
            </div>
          ))}
      </AppShell>

      {projectDialogOpen && (
        <NewProjectDialog
          onClose={() => setProjectDialogOpen(false)}
          onCreate={(name) => guard(() => handleCreateProject(name))}
        />
      )}
      {collectionDialogOpen && (
        <NewCollectionDialog
          onClose={() => setCollectionDialogOpen(false)}
          onCreate={(name, icon) => guard(() => handleCreateCollection(name, icon))}
        />
      )}
    </>
  );
}
