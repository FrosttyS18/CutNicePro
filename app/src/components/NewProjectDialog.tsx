import { useEffect, useRef, useState } from "react";
import { validateProjectName } from "../lib/projects";

interface Props {
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}

export function NewProjectDialog({ onClose, onCreate }: Props) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit() {
    const v = validateProjectName(name);
    if (!v.ok) {
      setError(v.error);
      return;
    }
    setError(null);
    setSubmitting(true);
    onCreate(name.trim()).catch((e) => {
      setSubmitting(false);
      setError(e instanceof Error ? e.message : String(e));
    });
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Criar projeto"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !submitting) onClose();
      }}
    >
      <div className="modal">
        <h2 className="modal__title">Criar projeto</h2>
        <label className="modal__label">
          Nome do projeto
          <input
            ref={inputRef}
            value={name}
            maxLength={120}
            placeholder="Ex.: Podcast — Ep. 12"
            data-testid="project-name-input"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            disabled={submitting}
          />
        </label>
        {error && (
          <p className="modal__error" role="alert">
            {error}
          </p>
        )}
        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button
            className="btn btn--primary"
            onClick={submit}
            disabled={submitting}
            data-testid="confirm-create-project"
          >
            {submitting ? "Criando…" : "Criar"}
          </button>
        </div>
      </div>
    </div>
  );
}
