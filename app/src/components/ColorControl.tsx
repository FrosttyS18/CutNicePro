import { useState } from "react";
import "./form-controls.css";

const colors = ["#ffffff", "#000000", "#181818", "#00c8c8", "#a6f500", "#ffd600", "#ff654d", "#ff66c4", "#7d73ff", "#148aff"];
export function ColorControl({ value, onChange, label = "Cor" }: { value: string; onChange: (color: string) => void; label?: string }) {
  const [draft,setDraft] = useState(value);
  const [focused,setFocused] = useState(false);
  return <span className="color-control" role="group" aria-label={label}>
    <span className="color-control__swatch" style={{ background: value }} aria-hidden="true"/>
    <input type="text" name={`color-${label}`} autoComplete="off" aria-label={`${label} hexadecimal`} maxLength={7} spellCheck={false} value={focused ? draft : value}
      onFocus={() => { setDraft(value); setFocused(true); }} onBlur={() => { setDraft(value); setFocused(false); }} onChange={event => {
        setDraft(event.target.value); if (/^#[0-9a-f]{6}$/i.test(event.target.value)) onChange(event.target.value);
      }}/>
    <span className="color-control__palette">{colors.map(color => <button type="button" key={color} aria-label={`${label} ${color}`} aria-pressed={value.toLowerCase() === color}
      style={{ background: color }} onClick={() => { setDraft(color); onChange(color); }}/>)}</span>
  </span>;
}
