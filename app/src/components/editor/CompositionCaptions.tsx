import type { CSSProperties } from "react";
import { captionCue, effectiveCaptionStyle } from "../../lib/captions";
import { frameToSeconds } from "../../lib/composition-time";
import type { MontageTranscriptEntry } from "../../lib/composition-playback";
import type { Composition, CompositionItem } from "../../lib/composition-types";
import { CaptionVisual } from "./CaptionVisual";

interface Props { items: CompositionItem[]; entries: MontageTranscriptEntry[]; document: Composition; frame: number; ratio: number }

export function CompositionCaptions({ items, entries, document, frame, ratio }: Props) {
  return items.map(item => {
    const style = effectiveCaptionStyle(item.settings.captionModel, item.settings.captionStyle);
    const cue = captionCue(entries.filter(entry => entry.itemId === item.id).map(entry => entry.segment), frameToSeconds(frame, document.fps), style.wordsPerCaption);
    return cue ? <div key={item.id} className="caption-overlay" style={{ "--caption-y": `${Math.round((style.y ?? .86) * 100)}%` } as CSSProperties}>
      <CaptionVisual style={style} ratio={ratio} cue={cue}/>
    </div> : null;
  });
}
