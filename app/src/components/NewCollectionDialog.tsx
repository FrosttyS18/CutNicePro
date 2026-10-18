import { useEffect, useRef, useState } from "react";
import type { CollectionIcon } from "../lib/types";
import { COLLECTION_ICONS, validateCollectionName } from "../lib/collections";
import { IconArchiveBox, IconHeart } from "./icons";

interface Props {
  onClose: () => void;
  onCreate: (name: string, icon: CollectionIcon) => Promise<void>;
}

export function NewCollectionDialog({ onClose, onCreate }: Props) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<CollectionIcon>("archive-box");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit() {
    const v = validateCollectionName(name);
    if (!v.ok) {
      setError(v.error);
      return;
    }
    setError(null);
    setSubmitting(true);
    onCreate(name.trim(), icon).catch((e) => {
      setSubmitting(false);
      setError(e instanceof Error ? e.message : String(e));
    });
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Criar coleção"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !submitting) onClose();
      }}
    >
      <div className="modal">
        <h2 className="modal__title">Criar coleção</h2>
        <label className="modal__label">
          Nome da coleção
          <input
            ref={inputRef}
            value={name}
            maxLength={120}
            placeholder="Ex.: Melhores cortes"
            data-testid="collection-name-input"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            disabled={submitting}
          />
        </label>
        <fieldset className="modal__icons">
          <legend className="modal__icons-legend">Ícone</legend>
          {COLLECTION_ICONS.map((ic) => (
            <label
              key={ic}
              className={icon === ic ? "modal__icon-choice modal__icon-choice--active" : "modal__icon-choice"}
            >
              <input
                type="radio"
                name="collection-icon"
                value={ic}
                checked={icon === ic}
                onChange={() => setIcon(ic)}
                disabled={submitting}
              />
              {ic === "heart" ? <IconHeart size={16} /> : <IconArchiveBox size={22} />}
              <span>{ic === "heart" ? "Coração" : "Caixa"}</span>
            </label>
          ))}
        </fieldset>
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
            data-testid="confirm-create-collection"
          >
            {submitting ? "Criando…" : "Criar"}
          </button>
        </div>
      </div>
    </div>
  );
}
