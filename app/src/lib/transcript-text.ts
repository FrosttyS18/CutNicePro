import type { TranscriptSegment, TranscriptWord } from "./workspace-types";

export function cleanTranscriptText(text: string): string {
  return text.replace(/(^|\s)[-–—]+(?=\p{L})/gu, "$1").replace(/(^|\s)[-–—]+(?=\s|$)/gu, "$1").replace(/\s+/g, " ").trim();
}
export function activeWord(words: TranscriptWord[] | undefined, time: number): number {
  return words?.findIndex(w => time >= w.start && time < w.end) ?? -1;
}
export function alignedWords(segment: TranscriptSegment): TranscriptWord[] | undefined {
  if (!segment.words?.length) return;
  const lexical = (text:string) => text.normalize("NFC").replace(/[^\p{L}\p{N}]/gu,"");
  const originals=cleanTranscriptText(segment.text).split(" ");
  const words=segment.words.filter(w=>lexical(w.text));
  if (originals.length!==words.length || words.some((word,index)=>lexical(word.text)!==lexical(originals[index]))) return;
  return words.map((word,index)=>({...word,text:originals[index]}));
}
export function editTranscriptSegment(segment: TranscriptSegment, text: string): TranscriptSegment {
  return { ...segment, text, words: undefined };
}

export interface DisplayWord { text: string; start: number | null; end: number | null; from: number; to: number }
const lexical = (text: string) => text.normalize("NFC").toLocaleLowerCase("pt-BR").replace(/[^\p{L}\p{N}]/gu, "");

export function displayWords(segment: TranscriptSegment): DisplayWord[] {
  const source = segment.words ?? [];
  let cursor = 0;
  return Array.from(segment.text.matchAll(/\S+/gu), match => {
    const text = cleanTranscriptText(match[0]);
    let found = -1;
    for (let i = cursor; i < Math.min(source.length, cursor + 8); i++) {
      if (lexical(source[i].text) === lexical(text) && lexical(text)) { found = i; break; }
    }
    const timing = found >= 0 ? source[found] : null;
    if (found >= 0) cursor = found + 1;
    return { text, start: timing?.start ?? null, end: timing?.end ?? null, from: match.index, to: match.index + match[0].length };
  }).filter(word => word.text);
}

export function replaceTranscriptWord(segment: TranscriptSegment, index: number, replacement: string): TranscriptSegment {
  const words = displayWords(segment);
  const selected = words[index];
  const text = replacement.trim();
  if (!selected || !text || /\s/u.test(text)) return segment;
  const nextText = segment.text.slice(0, selected.from) + text + segment.text.slice(selected.to);
  const timings = words.flatMap((word, i) => word.start === null || word.end === null ? [] :
    [{ text: i === index ? text : word.text, start: word.start, end: word.end }]);
  return { ...segment, text: nextText, words: timings.length ? timings : undefined };
}
export function validWords(value: unknown): value is TranscriptWord[] {
  return Array.isArray(value) && value.every(w => w && typeof w.text === "string" && Number.isFinite(w.start)
    && Number.isFinite(w.end) && w.start >= 0 && w.end > w.start);
}
export function validSegmentWords(segment: TranscriptSegment): boolean {
  return segment.words === undefined || (validWords(segment.words) && segment.words.every((word,index,words) =>
    word.start >= segment.start && word.end <= segment.end && (index === 0 || word.start >= words[index-1].start)));
}
