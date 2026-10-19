import { ColorControl } from "../ColorControl";
import { AppSelect } from "../AppSelect";
import { captionFonts, type CaptionStyle } from "../../lib/captions";

interface Props { style:CaptionStyle; onChange:(change:Partial<CaptionStyle>)=>void }
export function CaptionFontControls({style:s,onChange}:Props) {
  return <fieldset className="caption-settings"><legend>Configurações de fonte</legend>
    <label>Fonte<AppSelect value={s.font} onChange={e=>onChange({font:e.target.value as CaptionStyle["font"]})}>
      {captionFonts.map(font=><option key={font} style={{fontFamily:font}}>{font}</option>)}
    </AppSelect></label>
    <div className="caption-settings__row"><label>Tamanho<input type="number" min={16} max={160} value={s.size}
      onChange={e=>onChange({size:Math.max(16,Math.min(160,Number(e.target.value)))})}/></label>
      <label>Peso<AppSelect value={s.weight} onChange={e=>onChange({weight:Number(e.target.value) as CaptionStyle["weight"]})}>
        <option value={400}>Regular</option><option value={600}>Seminegrito</option><option value={700}>Negrito</option></AppSelect></label></div>
    <div className="caption-field"><span>Cor do texto</span><ColorControl label="Cor do texto" value={s.color} onChange={color=>onChange({color})}/></div>
    <div className="caption-settings__toggles">
      <label><input type="checkbox" checked={s.italic} onChange={e=>onChange({italic:e.target.checked})}/>Itálico</label>
      <label><input type="checkbox" checked={s.underline} onChange={e=>onChange({underline:e.target.checked})}/>Sublinhado</label>
      <label><input type="checkbox" checked={s.uppercase} onChange={e=>onChange({uppercase:e.target.checked})}/>Maiúsculas</label>
    </div>
    <label>Posição<AppSelect value={s.position} onChange={e=>onChange({position:e.target.value as CaptionStyle["position"]})}>
      <option value="bottom">Inferior</option><option value="middle">Centro</option><option value="top">Superior</option></AppSelect></label>
  </fieldset>;
}
