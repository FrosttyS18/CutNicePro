import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type SetStateAction } from "react";
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
  attachSessionMedia,
  releaseSessionMedia,
  saveWorkspace,
  readWorkspace,
  removeWorkspace,
} from "./services/workspace-store";
import { createWorkspace, sourceName } from "./lib/workspace";
import { importedProjectDisplayName } from "./lib/media-name";
import { ImportRollbackError } from "./services/import-project";
import { prepareProject } from "./services/prepare-project";
import { readPreparation, reconcilePreparations } from "./services/project-preparation-state";
import type { PreparationProgress } from "./lib/project-preparation";
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
import { NavigationGuardProvider } from "./components/NavigationGuardProvider";
import { useNavigationGuard } from "./hooks/useNavigationGuard";
import { useWindowNavigationGuard } from "./hooks/useWindowNavigationGuard";
import type { ProjectEditorOrigin } from "./lib/project-navigation";
import { openEmptyEditor } from "./services/direct-editor";
import { EditorLoading } from "./components/editor/EditorOpening";

type Route =
  | { kind: "home" }
  | { kind: "editor" }
  | { kind: "upload"; collectionId?: string }
  | { kind: "projects" }
  | { kind: "collections" }
  | { kind: "collection"; id: string }
  | { kind: "project"; id: string; view?: "overview" | "editor"; editorOrigin?: ProjectEditorOrigin };

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
  return <NavigationGuardProvider><AppContent /></NavigationGuardProvider>;
}

function AppContent() {
  const [bootReady, setBootReady] = useState(false);
  const splash = useSplashPhase(bootReady);

  const [route, updateRoute] = useState<Route>({ kind: "home" });
  const navigation = useNavigationGuard()!;
  const setRoute = useCallback((next: SetStateAction<Route>) => {
    void navigation.requestNavigation(() => updateRoute(next));
  }, [navigation]);
  const activeRoute = useRef(route);
  useLayoutEffect(() => { activeRoute.current = route; }, [route]);
  const [load, setLoad] = useState<LoadState>({
    status: "loading",
    projects: [],
    error: null,
  });
  const orderedProjects = useMemo(() => sortProjects(load.projects), [load.projects]);
  const [collectionsLoad, setCollectionsLoad] = useState<CollectionsState>({
    status: "loading",
    collections: [],
    error: null,
  });
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  useWindowNavigationGuard(navigation, setActionError);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [preparedProjectId, setPreparedProjectId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(() => loadSidebarExpanded());
  const [openingEditor, setOpeningEditor] = useState(false);
  const creatingEditor = useRef(false);
  useEffect(() => () => releaseSessionMedia(), []);

  const loadProjects = useCallback(() => ipc.listProjects().then(result => {
      const projects = result.map((project) => ({ ...project,
        name: importedProjectDisplayName(project.name, readWorkspace(project.id).media?.name) }));
      setLoad({ status: "ready", projects, error: null });
      void reconcilePreparations(projects.map(project => project.id)).then(result => {
        if (result.failed.length) setActionNotice("Não foi possível verificar algumas preparações anteriores. Seus projetos foram mantidos.");
      }).catch(() => setActionNotice("Não foi possível verificar a preparação anterior. Seus projetos foram mantidos."));
    }).catch((e: unknown) => {
      setLoad({
        status: "error",
        projects: [],
        error: e instanceof Error ? e.message : String(e),
      });
    }), []);

  const loadCollections = useCallback(() => ipc.listCollections().then(collections => {
      setCollectionsLoad({ status: "ready", collections, error: null });
    }).catch((e: unknown) => {
      setCollectionsLoad({
        status: "error",
        collections: [],
        error: e instanceof Error ? e.message : String(e),
      });
    }), []);

  const refreshProjects = useCallback(() => {
    setLoad(current => ({ ...current, status: "loading", error: null }));
    return loadProjects();
  }, [loadProjects]);
  const refreshCollections = useCallback(() => {
    setCollectionsLoad(current => ({ ...current, status: "loading", error: null }));
    return loadCollections();
  }, [loadCollections]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadProjects(), loadCollections()]).finally(() => {
      if (cancelled) return;
      setBootReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [loadProjects, loadCollections]);

  function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    saveSidebarExpanded(next);
  }

  async function handleOpenProject(id: string) {
    return navigation.requestNavigation(async () => {
      const opened = await ipc.openProject(id);
      setActionError(null);
      await refreshProjects();
      updateRoute(readWorkspace(opened.id).editorOnly
        ? { kind: "project", id: opened.id, view: "editor", editorOrigin: "editor" }
        : { kind: "project", id: opened.id, view: "overview" });
    });
  }

  async function handleOpenEditor() {
    if (creatingEditor.current || route.kind === "project" && route.editorOrigin === "editor") return;
    await navigation.requestNavigation(async () => {
      if (creatingEditor.current) return;
      creatingEditor.current = true; setOpeningEditor(true); setActionError(null);
      const requestedFrom = activeRoute.current;
      updateRoute({ kind: "editor" });
      try {
        const project = await openEmptyEditor(load.projects);
        setLoad(current => ({ ...current, status: "ready", error: null, projects: [...current.projects.filter(entry => entry.id !== project.id), project] }));
        if (activeRoute.current === requestedFrom || activeRoute.current.kind === "editor") {
          updateRoute({ kind: "project", id: project.id, view: "editor", editorOrigin: "editor" });
        } else setActionNotice("Sua edição está disponível em Meus projetos.");
      } catch (error) {
        await refreshProjects();
        if (activeRoute.current === requestedFrom || activeRoute.current.kind === "editor") updateRoute({ kind: "home" });
        throw error;
      } finally { creatingEditor.current = false; setOpeningEditor(false); }
    });
  }

  async function handleCreateFromMedia(source: UploadSource, options: UploadOptions) {
    const project = await ipc.createProject(sourceName(source));
    attachSessionMedia(project.id, source);
    const saved = saveWorkspace(project.id, createWorkspace(source, options));
    setLoad((current) => ({ ...current, status: "ready", error: null, projects: [...current.projects, project] }));
    setActionError(saved ? null : "Projeto criado. As configurações da prévia não puderam ser salvas neste dispositivo.");
    setRoute({ kind: "project", id: project.id, view: "overview" });
  }

  async function handleImportFromPath(
    path: string,
    name: string,
    options: UploadOptions,
    onProgress: (copied: number, total: number) => void,
    signal?: AbortSignal,
    onPreparation?: (progress: PreparationProgress) => void,
  ): Promise<void> {
    try {
      const prepared = await prepareProject(path, name, options, onProgress, signal, onPreparation);
      const { project } = prepared;
      let notice = prepared.notice;
      if (route.kind === "upload" && route.collectionId) {
        try {
          await ipc.addProjectToCollection(route.collectionId, project.id);
          await refreshCollections();
        } catch {
          notice = [notice, "O projeto foi criado, mas não foi possível adicioná-lo à coleção. Use Adicionar projeto para tentar novamente."].filter(Boolean).join(" ");
        }
      }
      setActionError(null);
      const stillPreparing = activeRoute.current === route;
      if (stillPreparing && notice === prepared.notice) {
        try { if (readPreparation(project.id)) notice = null; }
        catch { notice = prepared.notice; }
      }
      setPreparedProjectId(stillPreparing ? null : project.id);
      setActionNotice(notice ?? (stillPreparing ? null : "Projeto preparado e disponível em Meus projetos."));
      setLoad((current) => ({ ...current, status: "ready", error: null, projects: [...current.projects, project] }));
      if (stillPreparing) setRoute({ kind: "project", id: project.id, view: "overview" });
    } catch (error) {
      if (error instanceof ImportRollbackError) {
        setActionError(error.message);
        await refreshProjects();
      }
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  async function handleRenameProject(id: string, name: string) {
    const renamed = await ipc.renameProject(id, name);
    setLoad((current) => ({ ...current, projects: current.projects.map((project) => project.id === id ? renamed : project) }));
  }

  async function handleDeleteProject(id: string) {
    await navigation.requestNavigation(async () => {
      await ipc.deleteProject(id);
      removeWorkspace(id);
      setLoad(current => ({ ...current, projects: current.projects.filter(project => project.id !== id) }));
      setCollectionsLoad(current => ({ ...current, collections: current.collections.map(collection => ({
        ...collection, project_ids: collection.project_ids.filter(projectId => projectId !== id),
      })) }));
      updateRoute(current => current.kind === "project" && current.id === id ? { kind: "projects" } : current);
    });
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

  const section = route.kind === "home" ? "home" : route.kind === "editor" || route.kind === "project" && route.editorOrigin === "editor" ? "editor" : "projects";
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
      : route.kind === "editor" ? [{ label: "Editor" }, { label: "Nova edição" }]
      : route.kind === "project" && route.editorOrigin === "editor" ? [{ label: "Editor" }, { label: currentProject?.name ?? "Edição" }]
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

  const guard = (fn: () => Promise<unknown>) =>
    fn().then(() => undefined).catch((e) =>
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
        onNavigateEditor={() => void guard(handleOpenEditor)}
        openingEditor={openingEditor}
      >
        {actionError && (
          <div className="panel-error">
            <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />
          </div>
        )}
        {actionNotice && <div className="workspace-notice" role="status"><p>{actionNotice}</p>
          {preparedProjectId && <button type="button" className="flow-button" onClick={() => void guard(() => handleOpenProject(preparedProjectId))}>Abrir projeto</button>}
          <button type="button" className="flow-text-button" onClick={() => { setActionNotice(null); setPreparedProjectId(null); }}>Fechar aviso</button></div>}

        {route.kind === "home" && <HomeScreen onCreate={goUpload} />}
        {route.kind === "editor" && <EditorLoading onBack={goHome} backLabel="Voltar ao início"/>}

        {route.kind === "upload" && (
          <UploadScreen projects={orderedProjects} loading={load.status === "loading"}
            onDelete={handleDeleteProject} onCollectionsChanged={refreshCollections}
            error={load.error} onRetry={() => void refreshProjects()}
            onCreate={handleCreateFromMedia}
            onFilePath={handleImportFromPath}
            onOpen={(id) => void guard(() => handleOpenProject(id))} onViewAll={() => goProjects("all")} />
        )}

        {(route.kind === "projects" || route.kind === "project" && route.editorOrigin === "library") && (
          <ProjectsScreen
            active={route.kind === "projects"}
            onEditClip={(projectId,clip,mediaId) => void guard(() => navigation.requestNavigation(async () => {
              await prepareClipEditing(projectId,mediaId,clip);
              const opened=await ipc.openProject(projectId);
              setActionError(null);
              await refreshProjects();
              updateRoute({kind:"project",id:opened.id,view:"editor",editorOrigin:"library"});
            }))}
            onCollectionsChanged={refreshCollections}
            onDelete={handleDeleteProject}
            projects={orderedProjects}
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
              onCreate={() => setRoute({ kind: "upload", collectionId: currentCollection.id })}
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
              initialEditorOrigin={route.editorOrigin}
              onReturnToLibrary={() => updateRoute({kind:"projects"})}
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
