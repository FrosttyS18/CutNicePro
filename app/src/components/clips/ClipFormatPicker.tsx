import { aspectRatios,type AspectRatio } from "../upload/tools";

const names: Record<(typeof aspectRatios)[number], string> = { "9:16":"Vertical", "16:9":"Horizontal", "1:1":"Quadrado", "4:5":"Retrato" };
export function ClipFormatPicker({value,onChange}: { value: AspectRatio; onChange: (value: AspectRatio) => void }) {
  return <fieldset className="clip-format"><legend>Formato dos clipes</legend><div>
    {aspectRatios.map(ratio => <label key={ratio} data-selected={value === ratio}>
      <input type="radio" name="clip-format" value={ratio} checked={value === ratio} onChange={() => onChange(ratio)}/>
      <span className="clip-format__shape" aria-hidden="true"><i style={{aspectRatio:ratio.replace(":","/"),width:ratio === "9:16" ? 16 : ratio === "4:5" ? 23 : 30}}/></span>
      <strong>{ratio}</strong><small>{names[ratio]}</small>
    </label>)}
  </div></fieldset>;
}
