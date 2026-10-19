import { Fragment } from "react";
import { clipParagraphs } from "../../lib/clip-transcript";
import type { TranscriptSegment } from "../../lib/workspace-types";

interface Props { segments: TranscriptSegment[]; start: number; end: number; time: number; onSeek: (time: number) => void }
export function ClipTranscript({segments,start,end,time,onSeek}: Props) {
  return <div className="clip-transcript">{clipParagraphs(segments,start,end).map((words,index) => <p key={index}>
    {words.map((word,i) => <Fragment key={i}>{i > 0 ? " " : null}{word.start === null || word.end === null ? word.text :
      <button type="button" className="transcript-word" data-active={time >= word.start && time < word.end}
        onClick={() => onSeek(word.start!)}>{word.text}</button>}</Fragment>)}
  </p>)}</div>;
}
