import { useEffect, useRef, useState } from "react";
import type { ProjectMeta } from "../lib/types";
import { LocalFilePicker, type SelectedUploadFile } from "../components/upload/LocalFilePicker";
import { UploadOptionsFields } from "../components/upload/UploadOptionsFields";
import { PreparationDialog } from "../components/upload/PreparationDialog";
import { RecentProjects } from "../components/upload/RecentProjects";
import { mediaProjectName } from "../lib/media-name";
import type { UploadSource, UploadOptions } from "../lib/workspace-types";
import "./upload.css";
import { ArrowUpIcon } from "@phosphor-icons/react/dist/csr/ArrowUp";

interface Props {
  projects: ProjectMeta[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpen: (id: string) => void;
  onViewAll: () => void;
  onDelete: (id: string) => Promise<void>;
  onCollectionsChanged?: () => Promise<void>;
  onCreate: (source: UploadSource, options: UploadOptions) => Promise<void>;
  onFilePath?: (path: string, name: string, options: UploadOptions, onProgress: (copied: number, total: number) => void, signal?: AbortSignal) => Promise<void>;
}

export function UploadScreen(props: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const operation = useRef<AbortController | null>(null);
  const [selected, setSelected] = useState<SelectedUploadFile | null>(null);
  const [name, setName] = useState("");
  const [options, setOptions] = useState<UploadOptions>({ tool: "editor", model: 0, ratio: "16:9", fit: "contain" });
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ copied: number; total: number } | null>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    return () => operation.current?.abort();
  }, []);

  function select(file: SelectedUploadFile) {
    if (operation.current) return;
    setSelected(file);
    setName(mediaProjectName(file.name));
    setError(null);
    setCancelled(false);
  }

  async function startImport() {
    if (!selected || operation.current || !name.trim()) return;
    if (!props.onFilePath) { setError("Importação persistente indisponível nesta sessão."); return; }
    const controller = new AbortController();
    operation.current = controller;
    setCreating(true);
    setError(null);
    setCancelled(false);
    setCancelling(false);
    setProgress(null);
    try {
      await props.onFilePath(selected.path, name.trim(), options, (copied, total) => {
        if (operation.current === controller && !controller.signal.aborted) setProgress({ copied, total });
      }, controller.signal);
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") setCancelled(true);
      else setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        setCreating(false);
        setCancelling(false);
        setProgress(null);
      }
    }
  }

  return <section className="upload-screen" data-testid="upload-screen" aria-labelledby="upload-heading">
    <div className="upload-entry"><div className="upload-composer">
      <header className="upload-sr-only">
        <h1 ref={heading} id="upload-heading" tabIndex={-1}>Novo projeto</h1>
      </header>
      <form onSubmit={(event) => { event.preventDefault(); void startImport(); }} aria-busy={creating}>
        <LocalFilePicker selected={selected} disabled={creating} onSelect={select} name={name} onName={setName}>
          <UploadOptionsFields options={options} disabled={creating} onChange={setOptions} />
          <button type="submit" className="upload-send" disabled={!selected || !name.trim() || creating} aria-label={error ? "Tentar novamente" : "Importar vídeo"} title={error ? "Tentar novamente" : "Importar vídeo"}>
            <ArrowUpIcon size={20} aria-hidden="true"/><span className="upload-sr-only">{creating ? "Importando…" : error ? "Tentar novamente" : "Importar vídeo"}</span>
          </button>
        </LocalFilePicker>
        {error && <p className="upload-message upload-message--error" role="alert">{error}</p>}
        {cancelled && <p className="upload-message" role="status">Importação cancelada. Seu arquivo continua selecionado.</p>}
      </form>
      <p className="upload-composer__note">MP4, MOV, WEBM, MKV, M4V ou AVI. O arquivo original é preservado. Processamento local.</p>
    </div></div>
    <RecentProjects {...props} />
    <PreparationDialog open={creating} busy={creating} error={null} progress={progress} name={selected?.name ?? "Vídeo"}
      cancelling={cancelling} onClose={() => {}} onRetry={() => void startImport()}
      onCancel={() => { if (!cancelling) { setCancelling(true); operation.current?.abort(); } }} />
  </section>;
}
