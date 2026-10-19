import { captionPresentation, type CaptionCue, type CaptionStyle } from "../../lib/captions";

interface Props { style:CaptionStyle; cue:CaptionCue; ratio?:number; sample?:boolean }
export function CaptionVisual({style,cue,ratio,sample}:Props) {
  return <span className="caption-visual" style={captionPresentation(style,ratio,sample)} data-effect={style.effect}>
    {cue.words.map((word,index)=><span key={index} data-active={word.active} style={{
      color:style.effect==="highlight" && word.active || style.effect==="karaoke" && word.spoken?style.highlightColor:undefined,
    }}>{word.text}{index<cue.words.length-1?" ":""}</span>)}
  </span>;
}
