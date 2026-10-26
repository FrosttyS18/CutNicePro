import type { PointerEventHandler } from "react";

interface Props {
  frame: number;
  duration: number;
  left: number;
  width: number;
  height: number;
  onSeek: (frame: number) => void;
  onPointerDown: PointerEventHandler<HTMLButtonElement>;
}

export function CompositionTimelineCursor({ frame, duration, left, width, height, onSeek, onPointerDown }: Props) {
  return <div className="composition-timeline__cursor-layer" style={{ width, height: height || "100%" }}>
    <div className="composition-playhead" aria-label="Cursor da montagem" style={{ left }}>
      <button type="button" aria-label="Arrastar cursor da montagem" onPointerDown={onPointerDown} onKeyDown={event => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        let next: number;
        if (event.key === "ArrowLeft") next = frame - (event.shiftKey ? 10 : 1);
        else if (event.key === "ArrowRight") next = frame + (event.shiftKey ? 10 : 1);
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = duration;
        else return;
        event.preventDefault();
        event.stopPropagation();
        onSeek(Math.max(0, Math.min(duration, next)));
      }}/>
    </div>
  </div>;
}
