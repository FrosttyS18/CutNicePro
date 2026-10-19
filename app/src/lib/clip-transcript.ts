import { displayWords,type DisplayWord } from "./transcript-text";
import type { TranscriptSegment } from "./workspace-types";

export function clipParagraphs(segments: TranscriptSegment[],start: number,end: number): DisplayWord[][] {
  const paragraphs: DisplayWord[][] = [];
  let current: DisplayWord[] = [];
  let previousEnd = start;
  for (const segment of segments) {
    if (segment.end <= start || segment.start >= end) continue;
    if (current.length && (segment.start-previousEnd > 1.5 || current.length >= 65)) {
      paragraphs.push(current); current = [];
    }
    for (const word of displayWords(segment)) {
      if (word.start !== null && word.end !== null && (word.end <= start || word.start >= end)) continue;
      current.push(word);
      if (current.length >= 95 && /[.!?…]$/u.test(word.text)) { paragraphs.push(current); current = []; }
    }
    previousEnd = segment.end;
  }
  if (current.length) paragraphs.push(current);
  return paragraphs;
}
