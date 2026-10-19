import { ColorControl } from "../ColorControl";
import { AppSelect } from "../AppSelect";
import type { CaptionStyle } from "../../lib/captions";

interface Props { style:CaptionStyle; onChange:(change:Partial<CaptionStyle>)=>void }
export function CaptionEffectControls({style:s,onChange}:Props) {
  return <fieldset className="caption-settings"><legend>Efeitos da legenda</legend>
    <label>Destaque das palavras<AppSelect value={s.effect} onChange={e=>onChange({effect:e.target.value as CaptionStyle["effect"]})}>
      <option value="none">Sem destaque</option><option value="highlight">Palavra atual</option><option value="karaoke">Karaokê</option></AppSelect></label>
    {s.effect!=="none" && <div className="caption-field"><span>Cor de destaque</span><ColorControl label="Cor de destaque" value={s.highlightColor} onChange={color=>onChange({highlightColor:color})}/></div>}
    <div className="caption-settings__row"><label>Contorno<input type="number" min={0} max={12} value={s.outline}
      onChange={e=>onChange({outline:Math.max(0,Math.min(12,Number(e.target.value)))})}/></label>
      <div className="caption-field"><span>Cor do contorno</span><ColorControl label="Cor do contorno" value={s.outlineColor} onChange={color=>onChange({outlineColor:color})}/></div></div>
    <label className="caption-settings__check"><input type="checkbox" checked={s.shadow} onChange={e=>onChange({shadow:e.target.checked})}/>Sombra</label>
    <label className="caption-settings__check"><input type="checkbox" checked={s.background!=="transparent"}
      onChange={e=>onChange({background:e.target.checked?"#181818":"transparent"})}/>Fundo da legenda</label>
    {s.background!=="transparent" && <div className="caption-field"><span>Cor do fundo</span><ColorControl label="Cor do fundo" value={s.background} onChange={color=>onChange({background:color})}/></div>}
  </fieldset>;
}
