import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";
import { PencilSimpleIcon } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { FolderOpenIcon } from "@phosphor-icons/react/dist/csr/FolderOpen";
import { compositionAssetUsage, removeCompositionAsset, renameCompositionAsset } from "../../lib/composition-assets";
import { revealEditorMedia } from "../../lib/ipc";
import type { Composition } from "../../lib/composition-types";
import { FlowDialog } from "../workspace/FlowDialog";
import { EditorMenu } from "./EditorMenu";
import { EditorNameField } from "./EditorNameField";

export interface CompositionMediaMenu { assetId: string; x: number; y: number }
interface Props {
  projectId: string; document: Composition; menu: CompositionMediaMenu | null; disabled?: boolean;
  media: Record<string, { url: string | null; error: string | null }>;
  onClose: () => void; onChange: (next: Composition) => void; onRemoved: (assetId: string, next: Composition) => void;
  onPause: () => void; onError: (message: string) => void;
}
interface Edit { assetId: string; mode: "remove" | "rename"; name: string; error: string }

export function CompositionMediaActions(props: Props) {
  const { menu, onClose } = props;
  const id = useId();
  const [edit, setEdit] = useState<Edit | null>(null);
  const [revealing, setRevealing] = useState(false);
  const pending = useRef(false), active = useRef(true), latest = useRef(props);
  useLayoutEffect(() => { latest.current = props; });
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const asset = props.document.assets.find(value => value.id === props.menu?.assetId);
  const editing = props.document.assets.find(value => value.id === edit?.assetId);
  const close = useCallback(() => setEdit(null), []);
  useEffect(() => { if (menu && !asset) onClose(); }, [menu, onClose, asset]);
  let usage = 0, invalid = "";
  if (edit) {
    try { usage = compositionAssetUsage(props.document, edit.assetId); }
    catch { invalid = "Esta mídia não está mais disponível na montagem. Feche a janela e selecione outra mídia."; }
  }
  const locked = Boolean(edit?.mode === "remove" && props.document.items.some(item => item.assetId === edit.assetId && props.document.tracks.some(track => track.id === item.trackId && track.locked)));
  const blocked = Boolean(props.disabled || revealing || invalid || locked);
  const open = (mode: Edit["mode"]) => {
    const value = latest.current.document.assets.find(value => value.id === asset?.id);
    if (!value || latest.current.disabled || pending.current) return;
    props.onPause(); setEdit({ assetId: value.id, mode, name: value.name, error: "" });
  };
  const reveal = async () => {
    const initial = latest.current, value = initial.document.assets.find(value => value.id === asset?.id);
    if (!value || initial.disabled || pending.current || !initial.media[value.id]?.url) return;
    pending.current = true; setRevealing(true);
    try { await revealEditorMedia(initial.projectId, value.mediaId); }
    catch {
      if (active.current && latest.current.projectId === initial.projectId && latest.current.document.assets.some(candidate => candidate.id === value.id && candidate.mediaId === value.mediaId)) {
        latest.current.onError("Não foi possível abrir o local do arquivo. Verifique se o original ainda está disponível no computador.");
      }
    } finally { pending.current = false; if (active.current) setRevealing(false); }
  };
  const confirm = () => {
    if (!edit || blocked || latest.current.disabled || pending.current) return;
    try {
      const current = latest.current.document;
      const next = edit.mode === "rename" ? renameCompositionAsset(current, edit.assetId, edit.name) : removeCompositionAsset(current, edit.assetId);
      props.onPause(); if (next !== current) latest.current.onChange(next);
      if (edit.mode === "remove") latest.current.onRemoved(edit.assetId, next);
      setEdit(null);
    } catch (error) { setEdit(value => value ? { ...value, error: error instanceof Error ? error.message : "Não foi possível alterar esta mídia." } : null); }
  };
  return <>
    {props.menu && asset && <EditorMenu label={`Opções da mídia ${asset.name}`} x={props.menu.x} y={props.menu.y} onClose={props.onClose} items={[
      { label: "Excluir", icon: <TrashIcon size={17} aria-hidden="true"/>, danger: true, disabled: Boolean(props.disabled || revealing), onSelect: () => open("remove") },
      { label: "Renomear", icon: <PencilSimpleIcon size={17} aria-hidden="true"/>, disabled: Boolean(props.disabled || revealing), onSelect: () => open("rename") },
      { label: "Abrir local do arquivo", icon: <FolderOpenIcon size={17} aria-hidden="true"/>, disabled: Boolean(props.disabled || revealing || !props.media[asset.id]?.url), onSelect: () => { void reveal(); } },
    ]}/>}
    {revealing && <p className="flow-muted" role="status">Abrindo local do arquivo…</p>}
    <FlowDialog open={Boolean(edit)} title={edit?.mode === "rename" ? "Renomear mídia" : "Excluir mídia?"} onClose={close}>
      <form onSubmit={event => { event.preventDefault(); confirm(); }}>
        {edit?.mode === "rename" ? <div className="composition-editor__clip-fields"><EditorNameField id={`${id}-name`} label="Nome da mídia" value={edit.name}
          onChange={name => setEdit(value => value ? { ...value, name, error: "" } : null)} invalid={Boolean(edit.error)} describedBy={edit.error ? `${id}-error` : undefined}/></div>
          : <><p>{editing?.name}</p><p>{usage ? `${usage} ${usage === 1 ? "trecho será removido" : "trechos serão removidos"} da linha do tempo, com áudio e legendas vinculados. Os demais trechos ficam no mesmo lugar.` : "A mídia será removida da biblioteca deste projeto."}</p></>}
        <p className="flow-muted">{edit?.mode === "rename" ? "O nome muda apenas neste projeto. O arquivo original não será renomeado." : "O arquivo original será mantido no computador."}</p>
        {(edit?.error || invalid || locked) && <p id={`${id}-error`} role="alert">{edit?.error || invalid || "Há trechos desta mídia em faixas bloqueadas. Desbloqueie as faixas para excluí-la."}</p>}
        <div className="composition-editor__dialog-actions"><button type="button" className="flow-button dialog-action--secondary" onClick={close}>Cancelar</button>
          <button type="submit" className={`flow-button ${edit?.mode === "rename" ? "dialog-action--primary" : "dialog-action--danger"}`} disabled={blocked}>{edit?.mode === "rename" ? "Salvar nome" : "Excluir mídia"}</button></div>
      </form>
    </FlowDialog>
  </>;
}
