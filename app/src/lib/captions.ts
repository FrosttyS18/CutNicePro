import type { CSSProperties } from "react";
import type { TranscriptSegment } from "./workspace-types";
import { cleanTranscriptText, displayWords } from "./transcript-text";

export const captionFonts = ["Poppins", "Arial", "Georgia", "Impact", "Verdana", "Courier New"] as const;
export interface CaptionStyle {
  font: typeof captionFonts[number]; size: number; weight: 400 | 600 | 700;
  color: string; italic: boolean; underline: boolean; uppercase: boolean;
  outline: number; outlineColor: string; shadow: boolean; background: string;
  highlightColor: string; effect: "none" | "highlight" | "karaoke";
  position: "bottom" | "middle" | "top";
}
const base: CaptionStyle = { font:"Poppins", size:64, weight:600, color:"#ffffff", italic:false, underline:false,
  uppercase:false, outline:2, outlineColor:"#000000", shadow:true, background:"transparent", highlightColor:"#02c2be", effect:"none", position:"bottom" };
export const captionPresets: {name:string; style:CaptionStyle}[] = [
  {name:"Sem legenda",style:{...base}},
  {name:"Essencial",style:{...base}},
  {name:"Destaque",style:{...base,effect:"highlight",weight:700}},
  {name:"Karaokê",style:{...base,effect:"karaoke",uppercase:true,weight:700}},
  {name:"Editorial",style:{...base,font:"Georgia",italic:true,outline:0}},
  {name:"Cartão",style:{...base,background:"#181818",outline:0,shadow:false}},
  {name:"Impacto",style:{...base,font:"Impact",uppercase:true,size:80,outline:3}},
  {name:"Contorno",style:{...base,uppercase:true,outline:5,weight:700}},
  {name:"Suave",style:{...base,size:56,weight:400,outline:0,shadow:true}},
  {name:"Cinema",style:{...base,color:"#ffe6a7",font:"Georgia",outline:1}},
];
export const effectiveCaptionStyle = (model:number, style?:CaptionStyle):CaptionStyle => style ?? captionPresets[model]?.style ?? base;
const color = (value:unknown) => typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
export function isCaptionStyle(value:unknown): value is CaptionStyle {
  if (!value || typeof value !== "object") return false;
  const s=value as Partial<CaptionStyle>;
  return captionFonts.some(font=>font===s.font) && typeof s.size==="number" && Number.isFinite(s.size) && s.size>=16 && s.size<=160
    && [400,600,700].includes(s.weight??0) && color(s.color) && color(s.outlineColor) && color(s.highlightColor)
    && typeof s.italic==="boolean" && typeof s.underline==="boolean" && typeof s.uppercase==="boolean" && typeof s.shadow==="boolean"
    && typeof s.outline==="number" && Number.isFinite(s.outline) && s.outline>=0 && s.outline<=12
    && (s.background==="transparent" || color(s.background)) && ["none","highlight","karaoke"].includes(s.effect??"")
    && ["bottom","middle","top"].includes(s.position??"");
}
export function captionPresentation(s:CaptionStyle, ratio=16/9, sample=false):CSSProperties {
  const scale=sample ? 18/s.size : 1;
  const width=1080*Math.max(1,ratio);
  return { fontFamily:`"${s.font}", ${s.font==="Georgia"?"serif":"sans-serif"}`, fontWeight:s.weight,
    fontSize:sample?18:`clamp(8px, calc(100cqw * ${s.size/width}), 160px)`,
    fontStyle:s.italic?"italic":"normal", textDecoration:s.underline?"underline":"none", textTransform:s.uppercase?"uppercase":"none",
    color:s.color, WebkitTextStroke:sample?`${s.outline*scale}px ${s.outlineColor}`:`clamp(0px, calc(100cqw * ${s.outline/width}), 12px) ${s.outlineColor}`,
    paintOrder:"stroke fill", textShadow:s.shadow?"0 2px 4px #000a":"none", background:s.background };
}
export interface CaptionCue { words:{text:string;active:boolean;spoken:boolean}[] }
export function captionCue(segments:TranscriptSegment[],time:number):CaptionCue | null {
  const segment=segments.find(s=>time>=s.start && time<s.end);
  if (!segment) return null;
  const words=displayWords(segment);
  if (!words.length) return null;
  let selected=0;
  words.forEach((word,i)=>{if(word.start!==null && word.start<=time) selected=i;});
  const timed=words.some(word=>word.start!==null);
  const first=timed?Math.floor(selected/5)*5:0;
  const visible=timed?words.slice(first,first+5):words;
  return {words:visible.map(word=>({text:cleanTranscriptText(word.text),active:word.start!==null && word.end!==null && time>=word.start && time<word.end,
    spoken:word.start!==null && time>=word.start}))};
}
