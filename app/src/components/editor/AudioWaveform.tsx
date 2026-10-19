import { useEffect, useRef } from "react";
import { waveformEnvelope } from "../../lib/waveform";

export function AudioWaveform({ peaks }: { peaks: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    function draw() {
      if (!canvas) return;
      const width = Math.min(18000, Math.round(canvas.getBoundingClientRect().width));
      const height = Math.round(canvas.getBoundingClientRect().height);
      if (!width || !height) return;
      const scale = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(scale, scale);
      ctx.strokeStyle = getComputedStyle(canvas).color;
      ctx.lineWidth = 0.7;
      const envelope = waveformEnvelope(peaks, width);
      ctx.beginPath();
      envelope.forEach((peak, i) => {
        const x = (i + 0.5) * width / envelope.length;
        const amplitude = peak * (height / 2 - 2);
        ctx.moveTo(x, height / 2 - amplitude);
        ctx.lineTo(x, height / 2 + amplitude);
      });
      ctx.stroke();
    }
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    draw();
    return () => observer.disconnect();
  }, [peaks]);
  return <canvas ref={ref} className="timeline-waveform" aria-hidden="true" />;
}
