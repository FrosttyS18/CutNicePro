import { useRef, useState } from "react";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { FilmStripIcon } from "@phosphor-icons/react/dist/csr/FilmStrip";
import { useCompositionExport } from "../../hooks/useCompositionExport";
import { compositionDuration } from "../../lib/composition";
import { extractComposition } from "../../lib/composition-insert";
import { frameToSeconds, secondsToFrame } from "../../lib/composition-time";
import { createManualClip } from "../../lib/composition-persistence";
import type { Composition } from "../../lib/composition-types";
import { FlowDialog } from "../workspace/FlowDialog";
import { EditorAction } from "./EditorAction";

interface Props {
  projectId: string;
  clipId: string | null;
  title: string;
  document: Composition;
  dirty: boolean;
  saving: boolean;
  busy: boolean;
  range: { start: number; end: number } | null;
  readSavedDocument: () => Composition | null;
  saveForExport: () => Promise<Composition | null>;
  onPause: () => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}

export function CompositionDelivery(props: Props) {
  const exporter = useCompositionExport(props.projectId);
  const [confirmExport, setConfirmExport] = useState(false);
  const [creating, setCreating] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [name, setName] = useState("");
  const [start, setStart] = useState("0");
  const [end, setEnd] = useState("0");
  const [localError, setLocalError] = useState<string | null>(null);
  const pending = useRef(false);
  const duration = compositionDuration(props.document);
  const disabled = props.busy || props.saving || creating || exporter.busy || !duration;

  async function exportSaved(save: boolean) {
    if (pending.current) return;
    pending.current = true;
    props.onPause();
    try {
      const document = save ? await props.saveForExport() : props.readSavedDocument();
      if (!document) return;
      setConfirmExport(false);
      const result = await exporter.exportDocument(document, props.clipId);
      if (result.status === "completed") props.onNotice("Vídeo exportado.");
      if (result.status === "failed") props.onError(result.error);
      if (result.status === "blocked") props.onError("Aguarde a exportação em andamento.");
      if (result.status === "cancelled") props.onNotice("Exportação cancelada.");
    } finally { pending.current = false; }
  }

  function openManual() {
    props.onPause();
    setName(`${props.title} - clipe`);
    setStart(String(frameToSeconds(props.range?.start ?? 0, props.document.fps)));
    setEnd(String(frameToSeconds(props.range?.end ?? duration, props.document.fps)));
    setLocalError(null);
    setDialog(true);
  }

  async function create() {
    if (pending.current) return;
    pending.current = true;
    setCreating(true);
    setLocalError(null);
    try {
      const from = secondsToFrame(Number(start), props.document.fps);
      const to = secondsToFrame(Number(end), props.document.fps);
      const fragment = extractComposition(structuredClone(props.document), from, to);
      await createManualClip(props.projectId, name.trim(), fragment);
      setDialog(false);
      props.onNotice("Clipe manual criado nos clipes deste projeto.");
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    } finally { pending.current = false; setCreating(false); }
  }

  return <>
    {!props.clipId && <EditorAction label="Criar clipe" icon={<FilmStripIcon size={18}/>} disabled={disabled} onClick={openManual}/>}
    <EditorAction label="Exportar" icon={<DownloadSimpleIcon size={18}/>} disabled={disabled} onClick={() => {
      props.onPause();
      if (props.dirty) setConfirmExport(true);
      else void exportSaved(false);
    }}/>
    <FlowDialog open={confirmExport} title="Salvar antes de exportar?" busy={props.saving} onClose={() => setConfirmExport(false)}>
      <p>Confirme as alterações para exportar a montagem que está vendo.</p>
      <div className="composition-editor__dialog-actions"><button type="button" className="flow-button" onClick={() => setConfirmExport(false)}>Cancelar</button><button type="button" className="flow-button" disabled={props.saving} onClick={() => void exportSaved(true)}>Salvar e exportar</button></div>
    </FlowDialog>
    <FlowDialog open={exporter.busy} title="Exportando vídeo" busy allowCloseWhileBusy onClose={() => void exporter.cancel()}>
      <p role="status">{exporter.job?.progress ? `Renderizando ${exporter.job.progress}%` : "Preparando exportação…"}</p>
      <progress max={100} value={exporter.job?.progress ?? 0} aria-label="Progresso da exportação"/>
      <div className="composition-editor__dialog-actions"><button type="button" className="flow-button" onClick={() => void exporter.cancel()}>Cancelar exportação</button></div>
      {exporter.error && <p role="alert">{exporter.error}</p>}
    </FlowDialog>
    <FlowDialog open={dialog} title="Criar clipe manual" busy={creating} onClose={() => setDialog(false)}>
      <div className="composition-editor__clip-fields">
        <label>Nome do clipe<input className="flow-input" value={name} maxLength={120} disabled={creating} onChange={event => setName(event.target.value)}/></label>
        <div className="composition-editor__clip-range"><label>Início na montagem (s)<input className="flow-input" inputMode="decimal" value={start} disabled={creating} onChange={event => setStart(event.target.value)}/></label><label>Fim na montagem (s)<input className="flow-input" inputMode="decimal" value={end} disabled={creating} onChange={event => setEnd(event.target.value)}/></label></div>
      </div>
      {localError && <p role="alert">{localError}</p>}
      <div className="composition-editor__dialog-actions"><button type="button" className="flow-button" disabled={creating} onClick={() => setDialog(false)}>Cancelar</button><button type="button" className="flow-button" disabled={creating || !name.trim()} onClick={() => void create()}>{creating ? "Criando…" : "Criar clipe"}</button></div>
    </FlowDialog>
  </>;
}
