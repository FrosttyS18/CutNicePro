import type { TranscriptSegment, TranscriptWord } from "./workspace-types";
import { cleanTranscriptText } from "./transcript-text";

export interface CaptionToken { text: string; start: number | null; end: number | null }
export interface CaptionGroup { start: number; end: number; words: CaptionToken[] }
export interface CaptionBounds { start: number; end: number }

function lexical(text: string): string {
  return Array.from(text).filter(character => /[\p{L}\p{N}]/u.test(character)).map(character => character.toLowerCase()).join("");
}

function sourceWords(words: TranscriptWord[] | undefined): TranscriptWord[] {
  return (words ?? []).flatMap(word => word.text.split(/\s+/u).filter(Boolean).map(text => ({ ...word, text })));
}

export function captionTokens(segment: TranscriptSegment, bounds?: CaptionBounds): CaptionToken[] {
  const start = Math.max(segment.start, bounds?.start ?? segment.start);
  const end = Math.min(segment.end, bounds?.end ?? segment.end);
  if (end <= start) return [];
  const source = sourceWords(segment.words);
  let cursor = 0;
  const tokens = segment.text.split(/\s+/u).map(cleanTranscriptText).filter(Boolean).map(text => {
    const key = lexical(text);
    let timing: TranscriptWord | undefined;
    for (let index = cursor; key && index < Math.min(source.length, cursor + 8); index++) {
      if (lexical(source[index].text) !== key) continue;
      timing = source[index]; cursor = index + 1; break;
    }
    const known = timing && Number.isFinite(timing.start) && Number.isFinite(timing.end) && timing.end > timing.start ? timing : undefined;
    return { text, start: known?.start ?? null, end: known?.end ?? null };
  });
  if (tokens.every(word => word.start === null)) return tokens;
  let next = segment.end;
  const following = tokens.map(() => segment.end);
  for (let index = tokens.length - 1; index >= 0; index--) {
    following[index] = next;
    if (tokens[index].start !== null) next = tokens[index].start!;
  }
  let previous = segment.start;
  return tokens.flatMap((word, index) => {
    if (word.start !== null && word.end !== null) {
      previous = word.end;
      return word.end > start && word.start < end ? [{ ...word, start: Math.max(start, word.start), end: Math.min(end, word.end) }] : [];
    }
    return previous >= start && following[index] <= end ? [word] : [];
  });
}

export function trimCaptionSegment(segment: TranscriptSegment, bounds: CaptionBounds): TranscriptSegment | null {
  const words = captionTokens(segment, bounds);
  if (!words.length) return null;
  return { ...segment, start: Math.max(segment.start, bounds.start), end: Math.min(segment.end, bounds.end),
    text: words.map(word => word.text).join(" "),
    words: words.flatMap(word => word.start === null || word.end === null ? [] : [{ text: word.text, start: word.start, end: word.end }]),
  };
}

export function captionGroups(segment: TranscriptSegment, perCaption: number, bounds?: CaptionBounds): CaptionGroup[] {
  const start = Math.max(segment.start, bounds?.start ?? segment.start);
  const end = Math.min(segment.end, bounds?.end ?? segment.end);
  const words = captionTokens(segment, bounds);
  if (!words.length) return [];
  const groups: CaptionToken[][] = [];
  let current: CaptionToken[] = [];
  let first: number | null = null;
  let last: number | null = null;
  for (const word of words) {
    const canAdvance = word.start !== null && first !== null && word.start > first;
    if (canAdvance && (current.length >= perCaption || (last !== null && word.start! - last > 0.6))) {
      groups.push(current); current = []; first = null; last = null;
    }
    current.push(word);
    if (word.start !== null && first === null) first = word.start;
    if (word.end !== null) last = word.end;
  }
  if (current.length) groups.push(current);
  const starts = groups.map((group, index) => index === 0 ? start : group.find(word => word.start !== null)!.start!);
  return groups.map((group, index) => ({ start: starts[index], end: starts[index + 1] ?? end, words: group }));
}
