import type { CSSProperties } from "react";
import type { TranscriptSegment } from "./workspace-types";
import { captionGroups } from "./caption-cues";

export const captionFonts = ["Poppins", "Arial", "Georgia", "Impact", "Verdana", "Courier New"] as const;
export interface CaptionStyle {
  font: typeof captionFonts[number]; size: number; weight: 400 | 600 | 700;
  color: string; italic: boolean; underline: boolean; uppercase: boolean;
  outline: number; outlineColor: string; shadow: boolean; background: string;
  highlightColor: string; effect: "none" | "highlight" | "karaoke";
  position: "bottom" | "middle" | "top";
  /** Posição vertical contínua (0,1–0,9); ausente em rascunhos antigos. */
  y?: number;
  /** Palavras por legenda (1–8); ausente em rascunhos antigos (padrão 5). */
  wordsPerCaption?: number;
}
/** Rascunhos salvos antes do y contínuo: deriva o valor da posição antiga. */
const yFromPosition = { bottom: 0.86, middle: 0.5, top: 0.14 } as const;
const base: CaptionStyle = { font:"Poppins", size:64, weight:600, color:"#ffffff", italic:false, underline:false,
  uppercase:false, outline:2, outlineColor:"#000000", shadow:true, background:"transparent", highlightColor:"#02c2be", effect:"none", position:"bottom", y:0.86, wordsPerCaption:5 };
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
export const effectiveCaptionStyle = (model:number, style?:CaptionStyle):CaptionStyle => {
  const resolved = style ?? captionPresets[model]?.style ?? base;
  const y = typeof resolved.y === "number" && resolved.y >= 0.1 && resolved.y <= 0.9
    ? resolved.y : yFromPosition[resolved.position];
  const wordsPerCaption = typeof resolved.wordsPerCaption === "number" && resolved.wordsPerCaption >= 1 && resolved.wordsPerCaption <= 8
    ? Math.round(resolved.wordsPerCaption) : 5;
  return { ...resolved, y, wordsPerCaption };
};
const color = (value:unknown) => typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
export function isCaptionStyle(value:unknown): value is CaptionStyle {
  if (!value || typeof value !== "object") return false;
  const s=value as Partial<CaptionStyle>;
  return captionFonts.some(font=>font===s.font) && typeof s.size==="number" && Number.isFinite(s.size) && s.size>=16 && s.size<=160
    && [400,600,700].includes(s.weight??0) && color(s.color) && color(s.outlineColor) && color(s.highlightColor)
    && typeof s.italic==="boolean" && typeof s.underline==="boolean" && typeof s.uppercase==="boolean" && typeof s.shadow==="boolean"
    && typeof s.outline==="number" && Number.isFinite(s.outline) && s.outline>=0 && s.outline<=12
    && (s.background==="transparent" || color(s.background)) && ["none","highlight","karaoke"].includes(s.effect??"")
    && ["bottom","middle","top"].includes(s.position??"")
    && (s.y===undefined || (typeof s.y==="number" && Number.isFinite(s.y) && s.y>=0.1 && s.y<=0.9))
    && (s.wordsPerCaption===undefined || (typeof s.wordsPerCaption==="number" && Number.isInteger(s.wordsPerCaption) && s.wordsPerCaption>=1 && s.wordsPerCaption<=8));
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
export function captionCue(segments:TranscriptSegment[],time:number,wordsPerCaption=5,bounds?:{start:number;end:number}):CaptionCue | null {
  const segment=segments.find(s=>time>=s.start && time<s.end);
  if (!segment) return null;
  const active=captionGroups(segment,wordsPerCaption,bounds).find(group=>time>=group.start && time<group.end);
  if (!active) return null;
  return {words:active.words.map(word=>({text:word.text,active:word.start!==null && word.end!==null && time>=word.start && time<word.end,
    spoken:word.start!==null && time>=word.start}))};
}
