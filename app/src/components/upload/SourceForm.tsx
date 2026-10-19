import { useEffect, useId, useRef, useState } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { youtubeVideoId } from "../../lib/video-source";
import { mediaFileName } from "../../lib/media-name";

interface Props {
  loading: boolean;
  /** @deprecated M2A: seleção agora entrega CAMINHO via onFilePath. */
  onFile?: (file: File) => void;
  /** M2A: caminho REAL do arquivo (dialog nativo / drop do Tauri). */
  onFilePath?: (path: string, name: string) => void;
  compact?: boolean;
  onYouTube?: (url: string) => void;
}

const VIDEO_EXTENSIONS = ["mp4", "m4v", "mov", "webm", "mkv", "avi"];

export function SourceForm({ loading, onFilePath, compact = false }: Props) {
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const id = useId();
  const form = useRef<HTMLFormElement>(null);

  async function selectNative() {
    if (!onFilePath) { setError("Volte à tela de envio para importar este arquivo."); return; }
    const picked = await openFileDialog({
      multiple: false,
      directory: false,
      filters: [{ name: "Vídeos", extensions: VIDEO_EXTENSIONS }],
    });
    if (typeof picked === "string" && onFilePath) {
      setError(null);
      onFilePath(picked, mediaFileName(picked));
    }
  }

  function handlePaths(paths: string[] | null) {
    if (loading) return;
    if (document.querySelector("dialog[open]") && !form.current?.closest("dialog[open]")) return;
    if (!paths || paths.length === 0) return;
    setDragging(false);
    if (paths.length > 1) { setError("Envie um vídeo por vez."); return; }
    const path = paths[0];
    const name = mediaFileName(path);
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    if (!VIDEO_EXTENSIONS.includes(ext)) {
      setError("Formato não suportado. Use mp4, m4v, mov, webm, mkv ou avi.");
      return;
    }
    if (!onFilePath) { setError("Volte à tela de envio para importar este arquivo."); return; }
    setError(null);
    onFilePath(path, name);
  }

  // Drop REAL com paths: eventos nativos do Tauri (dragDropEnabled), com
  // cleanup simétrico no unmount (sem listeners duplicados).
  const pathsRef = useRef(handlePaths);
  pathsRef.current = handlePaths;
  useEffect(() => {
    let disposed = false;
    const offs: Array<() => void> = [];
    void (async () => {
      const retain = (off: () => void) => { if (disposed) off(); else offs.push(off); };
      retain(await listen<{ paths: string[] }>("tauri://drag-drop", (event) => {
        if (!disposed) pathsRef.current(event.payload.paths);
      }));
      retain(await listen<void>("tauri://drag-over", () => { if (!disposed) setDragging(true); }));
      retain(await listen<void>("tauri://drag-leave", () => { if (!disposed) setDragging(false); }));
    })().catch(() => { if (!disposed) setError("Não foi possível ativar o envio por arrastar. Use o botão Enviar."); });
    return () => { disposed = true; offs.forEach((off) => off()); };
  }, []);

  return (
    <form ref={form}
      className={dragging ? "source-form source-form--drop" : compact ? "source-form source-form--compact" : "source-form"}
      onSubmit={(event) => {
        event.preventDefault();
        if (loading) return;
        if (!link.trim()) {
          void selectNative().catch(() => setError("Não foi possível abrir a seleção de vídeo. Tente novamente."));
          return;
        }
        setError(youtubeVideoId(link)
          ? "Para usar este vídeo, envie o arquivo do computador."
          : "Informe um link de vídeo válido do YouTube ou apague o campo para escolher um arquivo.");
      }}>
      <div className="source-form__row">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="m10 13 4-4m-5 8-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m0 8a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-1 1" />
        </svg>
        <label className="upload-sr-only" htmlFor={id}>Link do YouTube ou arquivo do computador</label>
        <input id={id} type="text" inputMode="url" autoComplete="off" value={link} disabled={loading}
          aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}
          placeholder="Envie um vídeo do computador · YouTube em breve"
          onChange={(event) => { setLink(event.target.value); setError(null); }} />
        <button type="submit" className="upload-primary" disabled={loading}>{loading ? "Lendo…" : "Enviar"}</button>
      </div>
      {error && <p id={`${id}-error`} className="upload-message" role="alert">{error}</p>}
    </form>
  );
}
