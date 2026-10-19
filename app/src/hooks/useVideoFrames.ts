import { useEffect, useState } from "react";

export function useVideoFrames(url: string | null, duration: number | null) {
  const [result, setResult] = useState<{ url: string; frames: string[] } | null>(null);
  useEffect(() => {
    if (!url || !duration) return;
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const drawing = canvas.getContext("2d");
    if (!drawing) return;
    let cancelled = false;
    const frames: string[] = [];
    video.muted = true;
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    const stop = () => {
      video.onloadedmetadata = null; video.onseeked = null; video.onerror = null;
      video.removeAttribute("src"); video.load();
    };
    const timer = window.setTimeout(stop, 15000);
    const seek = () => {
      if (cancelled) return;
      if (frames.length === 12) { window.clearTimeout(timer); stop(); return; }
      video.currentTime = Math.max(0, Math.min(duration - .001, (frames.length + .5) * duration / 12));
    };
    video.onloadedmetadata = () => {
      canvas.width = 160;
      canvas.height = Math.max(1, Math.round(160 * video.videoHeight / video.videoWidth));
      canvas.height = Math.min(canvas.height, 284);
      seek();
    };
    video.onseeked = () => {
      if (cancelled) return;
      try {
        drawing.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push(canvas.toDataURL("image/jpeg", .65));
        setResult({ url, frames: [...frames] });
        seek();
      } catch { window.clearTimeout(timer); stop(); }
    };
    video.onerror = () => { window.clearTimeout(timer); stop(); };
    video.src = url;
    return () => { cancelled = true; window.clearTimeout(timer); stop(); };
  }, [url, duration]);
  return result?.url === url ? result.frames : [];
}
