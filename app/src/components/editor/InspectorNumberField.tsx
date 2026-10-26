import { useId, useRef, useState } from "react";
import { MinusIcon } from "@phosphor-icons/react/dist/csr/Minus";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { EditorAction } from "./EditorAction";
import "./reframe-controls.css";

interface Props {
  label: string;
  caption: string;
  name?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  clickStep?: number;
  unit?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}

export function InspectorNumberField({ label, caption, name, value, min, max, step = 1, clickStep = step, unit, disabled = false, onChange }: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<{ external: number; text: string } | null>(null);
  if (draft && draft.external !== value) setDraft(null);
  const commit = (input: HTMLInputElement, next?: number) => {
    if (disabled) return;
    const parsed = next ?? (input.value.trim() ? Number(input.value) : value);
    const bounded = Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : value;
    setDraft(null);
    if (bounded !== value) onChange(bounded);
  };
  const effective = draft?.text.trim() && Number.isFinite(Number(draft.text)) ? Number(draft.text) : value;
  const adjust = (direction: number) => {
    if (!input.current || disabled) return;
    const text = input.current.value;
    const parsed = text.trim() ? Number(text) : value;
    const start = Number.isFinite(parsed) ? parsed : value;
    commit(input.current, Number((start + direction * clickStep).toFixed(12)));
  };
  return <div className="inspector-number">
    <label className="inspector-number__label" htmlFor={id}>{caption}</label>
    <span className="inspector-number__control">
      <input ref={input} id={id} name={name??label} type="number" inputMode="decimal" autoComplete="off" aria-label={label}
        min={min} max={max} step={step} value={draft?.text??String(value)} disabled={disabled}
        onFocus={() => setDraft({ external: value, text: String(value) })}
        onChange={event => setDraft({ external: value, text: event.currentTarget.value })} onBlur={event => commit(event.currentTarget)}
        onKeyDown={event => {
          if (disabled) return;
          if (event.key === "Enter") { event.preventDefault(); commit(event.currentTarget); }
          if (event.key === "Escape") { event.preventDefault(); setDraft(null); }
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            const text = event.currentTarget.value;
            const parsed = text.trim() ? Number(text) : value;
            const start = Number.isFinite(parsed) ? parsed : value;
            commit(event.currentTarget, Number((start + (event.key === "ArrowUp" ? step : -step)).toFixed(12)));
          }
        }}/>
      {unit&&<span className="inspector-number__unit" aria-hidden="true">{unit}</span>}
    </span>
    <span className="inspector-number__steps" role="group" aria-label={`Ajustar ${label}`} onPointerDown={event => { if(event.button===0)event.preventDefault(); }}>
      <EditorAction compact label={`Diminuir ${label}`} tooltip={`Diminuir ${label.toLocaleLowerCase("pt-BR")}`} icon={<MinusIcon size={14} aria-hidden="true"/>} disabled={disabled||effective<=min} onClick={() => adjust(-1)}/>
      <EditorAction compact label={`Aumentar ${label}`} tooltip={`Aumentar ${label.toLocaleLowerCase("pt-BR")}`} icon={<PlusIcon size={14} aria-hidden="true"/>} disabled={disabled||effective>=max} onClick={() => adjust(1)}/>
    </span>
  </div>;
}
