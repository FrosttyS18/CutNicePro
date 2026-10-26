import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { FileVideoIcon } from "@phosphor-icons/react/dist/csr/FileVideo";
import { PaperclipIcon } from "@phosphor-icons/react/dist/csr/Paperclip";
import { mediaFileName } from "../../lib/media-name";

export interface SelectedUploadFile { path: string; name: string }

interface Props {
  selected: SelectedUploadFile | null;
  disabled: boolean;
  onSelect: (file: SelectedUploadFile) => void;
  name: string;
  onName: (name: string) => void;
  children: ReactNode;
}

const extensions = ["mp4", "m4v", "mov", "webm", "mkv", "avi"];

export function LocalFilePicker({ selected, disabled, onSelect, name, onName, children }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [choosing, setChoosing] = useState(false);

  function selectPaths(paths: string[]) {
    if (disabled || document.querySelector("dialog[open]")) return;
    setDragging(false);
    if (paths.length !== 1) { setError("Escolha um vídeo por vez."); return; }
    const path = paths[0];
    const name = mediaFileName(path);
    if (!extensions.includes(name.split(".").pop()?.toLowerCase() ?? "")) {
      setError("Formato não suportado. Use MP4, M4V, MOV, WEBM, MKV ou AVI.");
      return;
    }
    setError(null);
    onSelect({ path, name });
  }

  const selectRef = useRef(selectPaths);
  useLayoutEffect(() => { selectRef.current = selectPaths; });
  useEffect(() => {
    let disposed = false;
    const offs: Array<() => void> = [];
    const retain = (off: () => void) => { if (disposed) off(); else offs.push(off); };
    void (async () => {
      retain(await listen<{ paths: string[] }>("tauri://drag-drop", (event) => {
        if (!disposed) selectRef.current(event.payload.paths);
      }));
      retain(await listen("tauri://drag-over", () => { if (!disposed) setDragging(true); }));
      retain(await listen("tauri://drag-leave", () => { if (!disposed) setDragging(false); }));
    })().catch(() => { if (!disposed) setError("Arrastar indisponível. Use Escolher vídeo."); });
    return () => { disposed = true; offs.forEach((off) => off()); };
  }, []);

  async function choose() {
    if (disabled || choosing) return;
    setChoosing(true);
    try {
      const path = await open({ multiple: false, directory: false, filters: [{ name: "Vídeos", extensions }] });
      if (typeof path === "string") selectRef.current([path]);
    } catch {
      setError("Não foi possível escolher o arquivo. Tente novamente.");
    } finally {
      setChoosing(false);
    }
  }

  return <div className={`upload-picker${dragging && !disabled ? " upload-picker--dragging" : ""}`}>
    <div className="upload-picker__source">
      <button type="button" className="upload-picker__icon" aria-label={selected ? "Trocar vídeo" : "Escolher vídeo"} onClick={() => void choose()} disabled={disabled || choosing}>
        <FileVideoIcon size={20} aria-hidden="true" />
      </button>
      {selected ? <div className="upload-picker__selection">
        <input aria-label="Nome do projeto" value={name} maxLength={80} disabled={disabled} onChange={event => onName(event.target.value)} />
        <span title={selected.name}>{selected.name}</span>
      </div> : <button type="button" className="upload-picker__placeholder" onClick={() => void choose()} disabled={disabled || choosing}>
        Solte um arquivo de vídeo ou escolha no computador
      </button>}
    </div>
    <div className="upload-composer__toolbar">
      <button type="button" className="upload-chip" onClick={() => void choose()} disabled={disabled || choosing}>
        <PaperclipIcon size={15} aria-hidden="true" />{choosing ? "Escolhendo…" : "Enviar"}
      </button>
      {children}
    </div>
    {error && <p className="upload-message upload-message--error" role="alert">{error}</p>}
  </div>;
}
