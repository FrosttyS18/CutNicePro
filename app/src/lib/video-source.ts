export interface LocalVideo {
  file: File;
  url: string;
  width: number;
  height: number;
  duration: number | null;
}

export function validateVideoFile(file: Pick<File, "name" | "size" | "type">): string | null {
  if (!file.size) return "Este arquivo está vazio. Escolha outro vídeo.";
  if (!/\.(mp4|m4v|mov|webm|mkv|avi)$/i.test(file.name)) {
    return "Escolha um arquivo de vídeo MP4, MOV, WebM, MKV, M4V ou AVI.";
  }
  if (file.type && !file.type.startsWith("video/") && file.type !== "application/octet-stream") {
    return "O arquivo selecionado não foi reconhecido como vídeo.";
  }
  return null;
}

export function youtubeVideoId(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    let id: string | null = null;
    if (host === "youtu.be") id = url.pathname.slice(1);
    if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) {
      if (url.pathname === "/watch") id = url.searchParams.get("v");
      else if (/^\/(shorts|live|embed)\//.test(url.pathname)) id = url.pathname.split("/")[2];
    }
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function inspectLocalVideo(file: File, signal: AbortSignal): Promise<LocalVideo> {
  const error = validateVideoFile(file);
  if (error) return Promise.reject(new Error(error));
  if (signal.aborted) return Promise.reject(new DOMException("Cancelado", "AbortError"));
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let finished = false;
    const finish = (failure?: Error) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      video.onloadedmetadata = null;
      video.onerror = null;
      if (failure) {
        URL.revokeObjectURL(url);
        reject(failure);
      } else {
        resolve({ file, url, width: video.videoWidth, height: video.videoHeight,
          duration: Number.isFinite(video.duration) ? video.duration : null });
      }
      video.removeAttribute("src");
      video.load();
    };
    const abort = () => finish(new DOMException("Cancelado", "AbortError"));
    const timer = window.setTimeout(() => finish(new Error("A leitura demorou demais. Tente outro arquivo.")), 15000);
    signal.addEventListener("abort", abort, { once: true });
    video.onloadedmetadata = () => {
      if (!video.videoWidth || !video.videoHeight || (Number.isFinite(video.duration) && video.duration <= 0)) {
        finish(new Error("Não foi possível ler este vídeo. Tente um arquivo MP4 com codec H.264."));
      } else finish();
    };
    video.onerror = () => finish(new Error("Este vídeo está danificado ou usa um codec incompatível. Tente MP4 com H.264."));
    video.preload = "metadata";
    video.src = url;
  });
}
