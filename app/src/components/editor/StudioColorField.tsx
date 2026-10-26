interface Props { label: string; inputLabel: string; value: string; onChange: (value: string) => void }

export function StudioColorField({ label, inputLabel, value, onChange }: Props) {
  return <div className="studio-field">
    <span className="studio-field__label">{label}</span>
    <div className="studio-color">
      <input aria-label={inputLabel} type="color" value={value} onChange={event => onChange(event.target.value)}/>
      <span className="studio-color__value">{value.toUpperCase()}</span>
    </div>
  </div>;
}
