import { useEffect, useRef, useState } from "react";
import type { ProjectMeta } from "../lib/types";
import { useVideoSource } from "../hooks/useVideoSource";
import { SourceForm } from "../components/upload/SourceForm";
import { ToolCards } from "../components/upload/ToolCards";
import { ToolDialog } from "../components/upload/ToolDialog";
import { PreparationDialog } from "../components/upload/PreparationDialog";
import { RecentProjects } from "../components/upload/RecentProjects";
import { videoTools, type ToolId, type AspectRatio } from "../components/upload/tools";
import { youtubeVideoId } from "../lib/video-source";
import type { UploadSource, UploadOptions } from "../lib/workspace-types";
import "./upload.css";

interface Props {
  projects: ProjectMeta[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpen: (id: string) => void;
  onViewAll: () => void;
  onDelete: (id:string) => Promise<void>;
  onCollectionsChanged?: () => Promise<void>;
  onCreate: (source: UploadSource, options: UploadOptions) => Promise<void>;
  /** M2A: importação persistente por CAMINHO REAL (dialog/drop do Tauri). */
  onFilePath?: (path: string, name: string, options: UploadOptions, onProgress: (copied: number, total: number) => void) => Promise<void>;
}

export function UploadScreen(props: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  const source = useVideoSource();
  const [tool, setTool] = useState<ToolId | null>(null);
  const [model, setModel] = useState(1);
  const [ratio, setRatio] = useState<AspectRatio>("16:9");
  const [dropError, setDropError] = useState<string | null>(null);
  const [youtube, setYoutube] = useState<string | null>(null);
  const [pending, setPending] = useState<{ source: UploadSource; options: UploadOptions } | null>(null);
  const [creating, setCreating] = useState(false);
  const [importProgress, setImportProgress] = useState<{ copied: number; total: number } | null>(null);
  const [pathName, setPathName] = useState<string | null>(null);
  const [pendingPath, setPendingPath] = useState<{ path: string; name: string; options: UploadOptions } | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const creatingRef = useRef(false);
  const selectedTool = videoTools.find((value) => value.id === tool) ?? null;

  function selectFile(file: File) {
    setDropError(null);
    void source.select(file).then((video) => {
      if (!video) return;
      setYoutube(null);
      if (!tool) void importVideo({ kind: "local", video }, { tool: "editor", model: 0, ratio: "16:9" });
    });
  }

  // M2A: dialog nativo / drop do Tauri entregam caminho REAL → cópia
  // persistente em app-data (transacional no App). Sem File de sessão.
  function selectFilePath(path: string, name: string, options: UploadOptions = { tool: tool ?? "editor", model: tool ? model : 0, ratio: tool ? ratio : "16:9" }) {
    if (creatingRef.current) return;
    setDropError(null);
    setYoutube(null);
    if (!props.onFilePath) {
      setDropError("Importação persistente indisponível nesta sessão.");
      return;
    }
    creatingRef.current = true;
    setPendingPath({ path, name, options }); setPending(null); setTool(null);
    setCreating(true); setCreateError(null); setPathName(name);
    void props.onFilePath(path, name, options, (copied, total) => setImportProgress({ copied, total }))
      .catch((error) => setCreateError(error instanceof Error ? error.message : String(error)))
      .finally(() => { creatingRef.current = false; setCreating(false); setImportProgress(null); });
  }

  function selectYouTube(url: string) {
    setYoutube(url); source.clearError();
    const videoId = youtubeVideoId(url);
    if (!tool && videoId) void importVideo({ kind: "youtube", url, videoId }, { tool: "editor", model: 0, ratio: "16:9" });
  }

  async function importVideo(selected: UploadSource, options: UploadOptions) {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setPending({ source: selected, options }); setCreating(true); setCreateError(null); setTool(null);
    try { await props.onCreate(selected, options); }
    catch (error) { setCreateError(error instanceof Error ? error.message : String(error)); }
    finally { creatingRef.current = false; setCreating(false); }
  }

  function continueFlow() {
    if (!tool) return;
    const videoId = youtube ? youtubeVideoId(youtube) : null;
    const selected: UploadSource | null = youtube && videoId ? { kind: "youtube", url: youtube, videoId }
      : source.video ? { kind: "local", video: source.video } : null;
    if (!selected) return;
    void importVideo(selected, { tool, model, ratio });
  }



  return (
    <section className="upload-screen"
      data-testid="upload-screen" aria-labelledby="upload-heading"
      aria-describedby={dropError ? "upload-drop-error" : undefined}>
      <h1 ref={heading} id="upload-heading" className="upload-sr-only" tabIndex={-1}>Enviar novo projeto</h1>
      <div className="upload-screen__source"><SourceForm loading={source.loading || creating} onFile={selectFile} onFilePath={selectFilePath} onYouTube={selectYouTube} /></div>
      {source.error && !tool && <p className="upload-message upload-message--error" role="alert">{source.error}</p>}
      {dropError && <p className="upload-message upload-message--error" role="alert">{dropError}</p>}
      <ToolCards onSelect={setTool} />
      <RecentProjects {...props} />
      <ToolDialog tool={selectedTool} video={youtube ? null : source.video} youtube={youtube} onYouTube={selectYouTube} onContinue={continueFlow}
        onFilePath={selectFilePath}
        loading={source.loading} error={source.error}
        model={model} ratio={ratio} onModel={setModel} onRatio={setRatio} onFile={selectFile}
        onClose={() => { setTool(null); source.clearError(); }} />
      <PreparationDialog open={Boolean(pending || pendingPath) || creating} busy={creating} error={createError}
        progress={importProgress}
        name={pending?.source.kind === "local" ? pending.source.video.file.name : pathName ?? "Vídeo"}
        onClose={() => { setPending(null); setPendingPath(null); setCreateError(null); }}
        onRetry={() => {
          if (pendingPath) selectFilePath(pendingPath.path, pendingPath.name, pendingPath.options);
          else if (pending) void importVideo(pending.source, pending.options);
        }} />
    </section>
  );
}
