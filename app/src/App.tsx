import { useCallback, useEffect, useState } from "react";
import * as ipc from "./lib/ipc";
import type { CollectionMeta, ProjectMeta } from "./lib/types";
import { sortProjects } from "./lib/projects";
import { projectsOf } from "./lib/collections";
import { loadSidebarExpanded, saveSidebarExpanded } from "./lib/prefs";
import { ErrorBanner } from "./components/ErrorBanner";
import { NewCollectionDialog } from "./components/NewCollectionDialog";
import { ProjectWorkspace } from "./screens/ProjectWorkspace";
import { prepareClipEditing } from "./services/clip-media";
import {
  attachPersistedMedia,
  attachSessionMedia,
  releaseSessionMedia,
  saveWorkspace,
  readWorkspace,
  removeWorkspace,
} from "./services/workspace-store";
import { createWorkspace, sourceName } from "./lib/workspace";
import { mediaProjectName, importedProjectDisplayName } from "./lib/media-name";
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
      const projects = (await ipc.listProjects()).map((project) => ({ ...project,
        name: importedProjectDisplayName(project.name, readWorkspace(project.id).media?.name) }));
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

  /**
   * M2A: importação persistente transacional. O projeto é criado antes para
   * dar contexto ao job; em falha o projeto PERMANECE (mídia UNAVAILABLE na
   * prática) e a causa/ação sobe para a tela de upload — retry reusa o
   * caminho. Progresso REAL por evento (bytes) — sem percentuais inventados.
   */
  async function handleImportFromPath(
    path: string,
    name: string,
    options: UploadOptions,
    onProgress: (copied: number, total: number) => void,
  ): Promise<void> {
    const project = await ipc.createProject(mediaProjectName(name || path));
    let mediaUrl: string | null = null;
    try {
      const imported = await ipc.importMedia(project.id, path, onProgress);
      const entry = imported.entry;
      mediaUrl = ipc.mediaUrl(entry);
      attachPersistedMedia(project.id, entry.mediaId, mediaUrl);
      const saved = saveWorkspace(project.id, {
        version: 2,
        media: {
          kind: "local",
          name: entry.originalName,
          videoId: null,
          url: null,
          width: entry.analysis?.width ?? null,
          height: entry.analysis?.height ?? null,
          duration: entry.analysis ? entry.analysis.durationMs / 1000 : null,
          mediaId: entry.mediaId,
        },
        transcript: [],
        transcriptMode: "empty",
        settings: {
          ratio: options.ratio,
          fit: "contain",
          captionModel: options.model,
          text: "",
          volume: 1,
          muted: false,
          background: "#000000",
          trimStart: 0,
          trimEnd: null,
        },
        tool: options.tool,
      });
      if (!saved) setActionError("Projeto criado. As configurações da prévia não puderam ser salvas neste dispositivo.");
      if (imported.analysisError) setActionError(`Projeto importado, mas a análise falhou: ${imported.analysisError}`);
      setLoad((current) => ({ ...current, status: "ready", error: null, projects: [...current.projects, project] }));
      setRoute({ kind: "project", id: project.id, view: "overview" });
    } catch (error) {
      // Projeto preservado sem mídia; sem página de projeto falso-sucesso.
      setLoad((current) => current.status === "ready"
        ? { ...current, projects: [...current.projects, project] }
        : { status: "ready", projects: [project], error: null });
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  async function handleRenameProject(id: string, name: string) {
    const renamed = await ipc.renameProject(id, name);
    setLoad((current) => ({ ...current, projects: current.projects.map((project) => project.id === id ? renamed : project) }));
  }

  async function handleDeleteProject(id: string) {
    await ipc.deleteProject(id);
    removeWorkspace(id);
    setLoad(current => ({ ...current, projects: current.projects.filter(project => project.id !== id) }));
    setCollectionsLoad(current => ({ ...current, collections: current.collections.map(collection => ({
      ...collection, project_ids: collection.project_ids.filter(projectId => projectId !== id),
    })) }));
    setRoute(current => current.kind === "project" && current.id === id ? { kind: "projects" } : current);
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
            onDelete={handleDeleteProject} onCollectionsChanged={refreshCollections}
            error={load.error} onRetry={() => void refreshProjects()}
            onCreate={handleCreateFromMedia}
            onFilePath={handleImportFromPath}
            onOpen={(id) => void guard(() => handleOpenProject(id))} onViewAll={() => goProjects("all")} />
        )}

        {route.kind === "projects" && (
          <ProjectsScreen
            onEditClip={(projectId,clip,mediaId) => void guard(async () => { await prepareClipEditing(projectId,mediaId,clip); await handleOpenProject(projectId); setRoute({kind: "project",id: projectId,view: "editor"}); })}
            onCollectionsChanged={refreshCollections}
            onDelete={handleDeleteProject}
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
              onDelete={handleDeleteProject} onCollectionsChanged={refreshCollections}
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
              onDelete={() => handleDeleteProject(currentProject.id)}
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
