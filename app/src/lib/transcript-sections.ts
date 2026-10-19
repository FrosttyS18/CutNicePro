import type { TranscriptSegment } from "./workspace-types";
import { cleanTranscriptText } from "./transcript-text";

export interface TranscriptSection {
  id: string;
  title: string;
  start: number;
  end: number;
  segments: TranscriptSegment[];
}

export function transcriptSections(segments: TranscriptSegment[]): TranscriptSection[] {
  const result: TranscriptSection[] = [];
  for (const segment of segments) {
    let section = result[result.length - 1];
    const previous = section?.segments[section.segments.length - 1];
    const elapsed = section ? segment.start - section.start : 0;
    if (!section || elapsed >= 85 || (elapsed >= 35 && previous &&
      (segment.start - previous.end >= 1.2 || (elapsed >= 55 && /[.!?…]$/.test(previous.text.trim()))))) {
      const text = cleanTranscriptText(segment.text);
      const title = text.split(/(?<=[.!?])\s/)[0].split(/\s+/).slice(0, 13).join(" ");
      section = { id: segment.id, title, start: segment.start, end: segment.end, segments: [] };
      result.push(section);
    }
    section.segments.push(segment);
    section.end = Math.max(section.end, segment.end);
  }
  return result;
}
