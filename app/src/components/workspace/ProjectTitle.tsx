import { useState } from "react";
import { validateProjectName } from "../../lib/projects";

interface Props { title: string; onRename: (name: string) => Promise<void>; }

export function ProjectTitle({ title, onRename }: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!editing) return <div className="project-title"><h1>{title}</h1>
    <button type="button" className="flow-button" aria-label="Editar título do projeto"
      title="Editar título" onClick={() => { setName(title); setEditing(true); setError(null); }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z" /></svg>
    </button></div>;
  return (
    <form className="project-title-form" onSubmit={async (event) => {
      event.preventDefault();
      const validation = validateProjectName(name);
      if (!validation.ok) { setError(validation.error); return; }
      setBusy(true);
      try { await onRename(name.trim()); setEditing(false); }
      catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
      finally { setBusy(false); }
    }}>
      <label>Título do projeto<input autoFocus value={name} maxLength={80} disabled={busy}
        onChange={(event) => setName(event.target.value)} /></label>
      <button className="upload-primary" type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar título"}</button>
      <button className="flow-button" type="button" disabled={busy} onClick={() => setEditing(false)}>Cancelar</button>
      {error && <p className="upload-message upload-message--error" role="alert">{error}</p>}
    </form>
  );
}
