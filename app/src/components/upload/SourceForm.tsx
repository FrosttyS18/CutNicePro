import { useId, useRef, useState } from "react";
import { youtubeVideoId } from "../../lib/video-source";

interface Props {
  loading: boolean;
  onFile: (file: File) => void;
  compact?: boolean;
  onYouTube?: (url: string) => void;
}

export function SourceForm({ loading, onFile, compact = false, onYouTube }: Props) {
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const id = useId();

  return (
    <form className={compact ? "source-form source-form--compact" : "source-form"}
      onSubmit={(event) => {
        event.preventDefault();
        if (loading) return;
        if (!link.trim()) { fileInput.current?.click(); return; }
        if (youtubeVideoId(link) && onYouTube) { setError(null); onYouTube(link.trim()); return; }
        setError(youtubeVideoId(link)
          ? "Link reconhecido. A importação do YouTube ainda não está disponível. Envie um vídeo do computador."
          : "Informe um link de vídeo válido do YouTube ou apague o campo para escolher um arquivo.");
      }}>
      <div className="source-form__row">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="m10 13 4-4m-5 8-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m0 8a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-1 1" />
        </svg>
        <label className="upload-sr-only" htmlFor={id}>Link do YouTube ou arquivo do computador</label>
        <input id={id} type="text" inputMode="url" autoComplete="off" value={link} disabled={loading}
          aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}
          placeholder="Cole um link do YouTube — ou envie do seu computador"
          onChange={(event) => { setLink(event.target.value); setError(null); }} />
        <button type="submit" className="upload-primary" disabled={loading}>{loading ? "Lendo…" : "Enviar"}</button>
      </div>
      <input ref={fileInput} type="file" hidden accept="video/*,.mp4,.m4v,.mov,.webm,.mkv,.avi"
        aria-label="Selecionar vídeo do computador" onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) { setError(null); onFile(file); }
        }} />
      {error && <p id={`${id}-error`} className="upload-message" role="alert">{error}</p>}
    </form>
  );
}
