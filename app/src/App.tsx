import { useCallback, useEffect, useState } from "react";
import * as ipc from "./lib/ipc";
import type { CollectionMeta, ProjectMeta } from "./lib/types";
import { sortProjects } from "./lib/projects";
import { projectsOf } from "./lib/collections";
import { loadSidebarExpanded, saveSidebarExpanded } from "./lib/prefs";
import { ErrorBanner } from "./components/ErrorBanner";
import { NewCollectionDialog } from "./components/NewCollectionDialog";
import { ProjectWorkspace } from "./screens/ProjectWorkspace";
import { attachSessionMedia, releaseSessionMedia, saveWorkspace } from "./services/workspace-store";
import { createWorkspace, sourceName } from "./lib/workspace";
import type { UploadSource, UploadOptions } from "./lib/workspace-types";
import { AppShell, type ProjectsSub } from "./components/shell/AppShell";
import type { Crumb } from "./components/shell/Breadcrumb";
import { SplashScreen } from "./screens/SplashScreen";
import { WindowTitlebar } from "./components/WindowTitlebar";
import { useSplashPhase } from "./hooks/useSplashPhase";
import { HomeScreen } from "./screens/HomeScreen";
import { UploadScreen } from "./screens/UploadScreen";
import { ProjectsScreen } from "./screens/ProjectsScreen";
import { CollectionsScreen } from "./screens/CollectionsScreen";
import { CollectionScreen } from "./screens/CollectionScreen";

type Route =
  | { kind: "home" }
  | { kind: "upload" }
  | { kind: "projects" }
  | { kind: "collections" }
  | { kind: "collection"; id: string }
  | { kind: "project"; id: string; view?: "overview" | "editor" };

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
  const [bootReady, setBootReady] = useState(false);
  const splash = useSplashPhase(bootReady);

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
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(() => loadSidebarExpanded());
  useEffect(() => () => releaseSessionMedia(), []);

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

  useEffect(() => {
    let cancelled = false;
    void Promise.all([refreshProjects(), refreshCollections()]).finally(() => {
      if (cancelled) return;
      setBootReady(true);
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

  async function handleOpenProject(id: string) {
    const opened = await ipc.openProject(id);
    setActionError(null);
    await refreshProjects();
    setRoute({ kind: "project", id: opened.id });
  }

  async function handleCreateFromMedia(source: UploadSource, options: UploadOptions) {
    const project = await ipc.createProject(sourceName(source));
    attachSessionMedia(project.id, source);
    const saved = saveWorkspace(project.id, createWorkspace(source, options));
    setLoad((current) => ({ ...current, status: "ready", error: null, projects: [...current.projects, project] }));
    setActionError(saved ? null : "Projeto criado. As configurações da prévia não puderam ser salvas neste dispositivo.");
    setRoute({ kind: "project", id: project.id, view: "overview" });
  }

  async function handleRenameProject(id: string, name: string) {
    const renamed = await ipc.renameProject(id, name);
    setLoad((current) => ({ ...current, projects: current.projects.map((project) => project.id === id ? renamed : project) }));
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
    route.kind === "upload" ? "upload"
    : route.kind === "collections" || route.kind === "collection"
      ? "collections"
      : "all";

  const goHome = () => setRoute({ kind: "home" });
  const goUpload = () => setRoute({ kind: "upload" });
  const goProjects = (sub: ProjectsSub) =>
    setRoute(sub === "upload" ? { kind: "upload" } : sub === "collections" ? { kind: "collections" } : { kind: "projects" });

  const crumbs: Crumb[] =
    route.kind === "home"
      ? [{ label: "Home", navigate: goHome }, { label: "Início" }]
      : route.kind === "upload"
        ? [{ label: "Meus Projetos", navigate: () => goProjects("all") }, { label: "Enviar novo projeto" }]
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
      {splash.visible && (
        <SplashScreen leaving={splash.leaving} onAnimationComplete={splash.onAnimationComplete} />
      )}

      <WindowTitlebar />
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

        {route.kind === "home" && <HomeScreen onCreate={goUpload} />}

        {route.kind === "upload" && (
          <UploadScreen projects={sortProjects(load.projects)} loading={load.status === "loading"}
            error={load.error} onRetry={() => void refreshProjects()}
            onCreate={handleCreateFromMedia}
            onOpen={(id) => void guard(() => handleOpenProject(id))} onViewAll={() => goProjects("all")} />
        )}

        {route.kind === "projects" && (
          <ProjectsScreen
            projects={sortProjects(load.projects)}
            loading={load.status === "loading"}
            error={load.status === "error" ? load.error : null}
            onRetry={() => void refreshProjects()}
            onCreate={goUpload}
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
            <ProjectWorkspace key={currentProject.id}
              project={currentProject}
              initialView={route.view}
              onRename={(name) => handleRenameProject(currentProject.id, name)}
              onImport={goUpload}
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

      {collectionDialogOpen && (
        <NewCollectionDialog
          onClose={() => setCollectionDialogOpen(false)}
          onCreate={(name, icon) => guard(() => handleCreateCollection(name, icon))}
        />
      )}
    </>
  );
}
