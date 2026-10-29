import { useEffect, useId, useRef, useState } from "react";
import { FolderOpenIcon } from "@phosphor-icons/react/dist/csr/FolderOpen";
import { FilmStripIcon } from "@phosphor-icons/react/dist/csr/FilmStrip";
import { chooseEditorExportDirectory, getEditorExportDestination, getEditorExportPreview } from "../../lib/ipc";
import { compositionDuration } from "../../lib/composition";
import { frameToSeconds } from "../../lib/composition-time";
import { defaultExportOptions, validateExportOptions, type ExportRequest } from "../../lib/composition-export";
import type { Composition } from "../../lib/composition-types";
import { useExportCapabilities } from "../../hooks/useExportCapabilities";
import { FlowDialog } from "../workspace/FlowDialog";
import { EditorAction } from "./EditorAction";
import { CompositionExportOptions } from "./CompositionExportOptions";
import "./composition-export.css";

interface Props {
  open: boolean;
  title: string;
  document: Composition;
  projectId: string;
  clipId: string | null;
  busy: boolean;
  initialRequest?: ExportRequest;
  onClose: () => void;
  onExport: (request: ExportRequest) => void;
}

function ExportPreview({ projectId, clipId, document }: Pick<Props, "projectId" | "clipId" | "document">) {
  const [source, setSource] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  useEffect(() => {
    let active = true;
    let url: string | null = null;
    void getEditorExportPreview(projectId, clipId, document).then(value => {
      if (!active) return;
      if (!Array.isArray(value) || value.length > 2 * 1024 * 1024 || value[0] !== 255 || value[1] !== 216 || !value.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) throw new Error("Miniatura inválida");
      url = URL.createObjectURL(new Blob([new Uint8Array(value)], { type: "image/jpeg" }));
      setSource(url); setState("ready");
    }).catch(() => { if (active) setState("failed"); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [projectId, clipId, document]);
  return <figure className="composition-export__preview">
    <div className="composition-export__frame" aria-busy={state === "loading"}>
      {source && state === "ready" ? <img src={source} alt="Prévia da versão salva" onError={() => setState("failed")}/> : <div className="composition-export__placeholder" role="status"><FilmStripIcon size={32} aria-hidden="true"/><p>{state === "loading" ? "Carregando prévia…" : "Não foi possível carregar a prévia."}</p>{state === "failed" && <span>Você pode exportar o vídeo.</span>}</div>}
    </div>
    <figcaption>Prévia do vídeo</figcaption>
  </figure>;
}

function durationLabel(seconds: number): string {
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  return `${hours ? `${String(hours).padStart(2, "0")}:` : ""}${String(minutes).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function forbiddenFileCharacter(character: string): boolean {
  return /[<>:"/\\|?*]/.test(character) || character.charCodeAt(0) < 32;
}

function ExportSettings(props: Omit<Props, "open">) {
  const id = useId();
  const [fileName, setFileName] = useState(() => props.initialRequest?.fileName ?? Array.from(props.title, character => forbiddenFileCharacter(character) ? "_" : character).join("").slice(0, 120));
  const [directory, setDirectory] = useState<string | null>(props.initialRequest?.directory ?? null);
  const [options, setOptions] = useState(() => defaultExportOptions(props.document.fps, props.initialRequest?.options));
  const [bitrate, setBitrate] = useState(String(props.initialRequest?.options.bitrateKbps ?? 8000));
  const capabilities = useExportCapabilities();
  const [error, setError] = useState<string | null>(null);
  const [invalidName, setInvalidName] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [replacement, setReplacement] = useState<{ request: ExportRequest; fileName: string } | null>(null);
  const pending = useRef(false);
  const exportStarted = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const disabled = props.busy || submitting || checking || replacement !== null;
  const closeDisabled = props.busy || submitting || replacement !== null;
  const duration = durationLabel(frameToSeconds(compositionDuration(props.document), props.document.fps));
  async function chooseDirectory() {
    if (disabled || pending.current) return;
    pending.current = true; setChoosing(true); setError(null);
    try {
      const result = await chooseEditorExportDirectory();
      if (active.current && result) setDirectory(result);
    } catch {
      if (active.current) setError("Não foi possível escolher a pasta. Tente novamente ou escolha ao exportar.");
    } finally {
      pending.current = false; if (active.current) setChoosing(false);
    }
  }
  function sendExport(request: ExportRequest) {
    if (exportStarted.current || !active.current) return;
    exportStarted.current = true;
    setSubmitting(true);
    props.onExport(request);
  }
  function closeSettings() {
    if (closeDisabled || exportStarted.current) return;
    active.current = false;
    props.onClose();
  }
  function cancelReplacement() {
    if (props.busy || submitting || exportStarted.current) return;
    pending.current = false;
    setReplacement(null);
  }
  async function submit() {
    if (disabled || pending.current) return;
    const trimmed = fileName.trim();
    if (!trimmed || trimmed.length > 120 || Array.from(trimmed).some(forbiddenFileCharacter) || /[. ]$/.test(trimmed)) {
      setInvalidName(true); setError("Informe um nome de até 120 caracteres, sem caracteres especiais de arquivo."); return;
    }
    if (capabilities.state.status !== "ready") return;
    const requestedOptions = { ...options };
    if (options.quality === "custom" && options.codec !== "rle") requestedOptions.bitrateKbps = bitrate.trim() ? Number(bitrate) : undefined;
    else delete requestedOptions.bitrateKbps;
    const invalidOptions = validateExportOptions(requestedOptions, capabilities.state.capabilities);
    if (invalidOptions) { setError(invalidOptions); return; }
    setError(null); pending.current = true;
    const request = { fileName: trimmed, directory, options: requestedOptions };
    if (!directory) { sendExport(request); return; }
    setChecking(true);
    try {
      const destination = await getEditorExportDestination(directory, trimmed, requestedOptions);
      if (!active.current) return;
      setChecking(false);
      if (destination.exists) setReplacement({ request, fileName: destination.fileName });
      else sendExport(request);
    } catch {
      if (!active.current) return;
      pending.current = false; setChecking(false);
      setError("Não foi possível verificar o destino. Escolha outra pasta ou tente novamente.");
    }
  }
  const codecAvailable = capabilities.state.status === "ready" && capabilities.state.capabilities.codecs.some(item => item.codec === options.codec && item.supported);
  return <>
    <FlowDialog open title="Exportar" className="composition-export" busy={closeDisabled} onClose={closeSettings}>
    <form className="composition-export__form" noValidate onSubmit={event => { event.preventDefault(); void submit(); }}>
    <div className="composition-export__body">
      <ExportPreview projectId={props.projectId} clipId={props.clipId} document={props.document}/>
      <div className="composition-export__settings">
        <div className="composition-export__field">
          <label htmlFor={`${id}-name`}>Nome</label>
          <input id={`${id}-name`} className="flow-input" name="exportName" autoComplete="off" maxLength={120} value={fileName} disabled={disabled} aria-invalid={invalidName || undefined} aria-describedby={invalidName ? `${id}-error` : undefined} onChange={event => { setFileName(event.target.value); setError(null); setInvalidName(false); }}/>
        </div>
        <div className="composition-export__field">
          <label htmlFor={`${id}-directory`}>Salvar em</label>
          <div className="composition-export__destination">
            <input id={`${id}-directory`} className="flow-input" name="exportDirectory" value={directory ?? "Escolher ao exportar"} readOnly aria-describedby={`${id}-destination-hint`}/>
            <EditorAction label="Escolher pasta" tooltip="Escolher a pasta de destino" icon={<FolderOpenIcon size={18} aria-hidden="true"/>} compact disabled={disabled || choosing} onClick={() => void chooseDirectory()}/>
          </div>
          <p id={`${id}-destination-hint`} className="composition-export__hint">{directory ? "O vídeo será salvo nesta pasta." : "Escolha o destino ao exportar."}</p>
        </div>
        <CompositionExportOptions id={id} value={options} bitrate={bitrate} sourceRate={props.document.fps.numerator / props.document.fps.denominator} disabled={disabled}
          loading={capabilities.state.status === "loading"} capabilityError={capabilities.state.status === "failed"}
          capabilities={capabilities.state.status === "ready" ? capabilities.state.capabilities : null}
          onRetry={capabilities.retry} onChange={value => { setOptions(value); setError(null); }} onBitrateChange={value => { setBitrate(value); setError(null); }}/>
        {error && <p className="composition-export__error" role="alert" id={`${id}-error`}>{error}</p>}
      </div>
    </div>
    <footer className="composition-export__footer"><p>Duração <strong>{duration}</strong></p><div className="composition-export__actions"><button className="flow-button dialog-action--secondary" type="button" disabled={closeDisabled} onClick={closeSettings}>Cancelar</button><button className="flow-button dialog-action--primary" type="submit" disabled={disabled || choosing || !codecAvailable}>{checking ? "Verificando destino…" : submitting ? "Preparando…" : "Exportar"}</button></div></footer>
    </form>
    </FlowDialog>
    <FlowDialog open={replacement !== null} title="Substituir vídeo?" className="composition-export-replace"
      busy={props.busy || submitting} onClose={cancelReplacement}>
      <p className="composition-export__replacement-copy">{replacement?.fileName} já existe nesta pasta. Deseja substituí-lo?</p>
      <div className="composition-export__actions">
        <button type="button" className="flow-button dialog-action--secondary" disabled={props.busy || submitting} onClick={cancelReplacement}>Cancelar</button>
        <button type="button" className="flow-button dialog-action--primary" disabled={props.busy || submitting}
          onClick={() => { if (replacement && !submitting && !props.busy) sendExport({ ...replacement.request, overwrite: true }); }}>Substituir</button>
      </div>
    </FlowDialog>
  </>;
}

export function CompositionExportDialog({ open, ...props }: Props) {
  return open ? <ExportSettings key={`${props.projectId}:${props.clipId ?? "project"}:${props.document.revision}`} {...props}/> : null;
}
