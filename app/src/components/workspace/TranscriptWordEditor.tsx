import { useState } from "react";

interface Props { text: string; onSave: (text: string) => void; onClose: () => void }

export function TranscriptWordEditor({ text, onSave, onClose }: Props) {
  const [value, setValue] = useState(text);
  const valid = Boolean(value.trim()) && !/\s/u.test(value.trim());
  function save() { if (valid) { onSave(value.trim()); onClose(); } }
  return <span className="transcript-word-editor" role="group" aria-label="Editar palavra"
    onKeyDown={event => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
      if (event.key === "Enter") { event.preventDefault(); save(); }
    }}>
    <input aria-label="Palavra" value={value} maxLength={120} autoFocus onChange={event => setValue(event.target.value)} />
    <button className="flow-button" type="button" disabled={!valid} onClick={save}>Salvar</button>
    <button className="flow-button" type="button" onClick={onClose}>Cancelar</button>
  </span>;
}
