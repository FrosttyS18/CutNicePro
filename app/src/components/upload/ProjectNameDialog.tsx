import { useId } from "react";
import { FlowDialog } from "../workspace/FlowDialog";

interface Props {
  open: boolean;
  name: string;
  onName: (name: string) => void;
  onClose: () => void;
  onCreate: () => void;
}

export function ProjectNameDialog({ open, name, onName, onClose, onCreate }: Props) {
  const id = useId();
  const valid = Boolean(name.trim());
  return <FlowDialog open={open} title="Nome do projeto" onClose={onClose} className="upload-name-dialog">
    <form onSubmit={event => { event.preventDefault(); if (valid) onCreate(); }}>
      <label className="upload-name-dialog__field" htmlFor={id}>Nome do projeto
        <input id={id} name="projectName" aria-label="Nome do projeto" value={name} maxLength={80} autoComplete="off"
          aria-describedby={`${id}-hint`} onInput={event => onName(event.currentTarget.value)} />
      </label>
      <p id={`${id}-hint`} className="flow-muted">{valid ? "O vídeo será importado e transcrito no seu computador." : "Informe um nome para criar o projeto."}</p>
      <div className="upload-name-dialog__actions">
        <button type="button" className="flow-button" onClick={onClose}>Cancelar</button>
        <button type="submit" className="flow-button" disabled={!valid}>Criar projeto</button>
      </div>
    </form>
  </FlowDialog>;
}
