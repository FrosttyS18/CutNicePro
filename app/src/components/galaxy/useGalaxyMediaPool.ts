import { useEffect, useState } from "react";
import * as THREE from "three";
import { GALAXY_MEDIA } from "./galaxy-media";

export interface GalaxyMediaPool {
  clipVA: Float32Array;
  posterReady: Uint8Array;
  posterTextures: THREE.Texture[];
  videos: HTMLVideoElement[];
  videoTextures: THREE.VideoTexture[];
}

function createMediaPool() {
  let active = true;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const listeners: { video: HTMLVideoElement; type: string; callback: () => void }[] = [];
  const pool: GalaxyMediaPool = {
    clipVA: new Float32Array(GALAXY_MEDIA.map(clip => clip.aspect || 16 / 9)),
    posterReady: new Uint8Array(GALAXY_MEDIA.length),
    posterTextures: [], videos: [], videoTextures: [],
  };
  const schedule = (callback: () => void, delay: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (active) callback();
    }, delay);
    timers.add(timer);
  };
  const listen = (video: HTMLVideoElement, type: string, callback: () => void) => {
    listeners.push({ video, type, callback });
    video.addEventListener(type, callback, { once: true });
  };
  const dispose = () => {
    if (!active) return;
    active = false;
    timers.forEach(clearTimeout); timers.clear();
    listeners.forEach(({ video, type, callback }) => video.removeEventListener(type, callback));
    listeners.length = 0;
    pool.posterTextures.forEach(texture => texture.dispose());
    pool.videoTextures.forEach(texture => texture.dispose());
    pool.videos.forEach(video => {
      video.pause(); video.removeAttribute("src"); video.load();
    });
  };
  try {
    GALAXY_MEDIA.forEach((clip, index) => {
      const poster = new THREE.TextureLoader().load(clip.poster, () => {
        if (active) pool.posterReady[index] = 1;
      });
      pool.posterTextures.push(poster);
      poster.colorSpace = THREE.SRGBColorSpace;
      const video = document.createElement("video");
      pool.videos.push(video);
      video.muted = true; video.loop = true; video.playsInline = true;
      video.crossOrigin = "anonymous"; video.disableRemotePlayback = true;
      video.preload = "metadata";
      const texture = new THREE.VideoTexture(video);
      pool.videoTextures.push(texture);
      const record = () => {
        if (active) pool.clipVA[index] = video.videoWidth / Math.max(1, video.videoHeight) || clip.aspect;
      };
      if (video.readyState >= 1) record();
      else listen(video, "loadedmetadata", record);
      let tries = 0;
      const retry = () => {
        if (!active || tries >= 3 || video.readyState >= 2) return;
        tries += 1;
        schedule(() => {
          listen(video, "error", retry);
          video.load();
        }, 15_000 * tries);
      };
      listen(video, "error", retry);
      const seek = () => {
        if (!active || !video.paused || video.currentTime !== 0) return;
        const usable = Math.max(0.2, (video.duration || 8) - 0.5);
        video.currentTime = 0.1 + ((index * 2.618) % usable);
      };
      schedule(() => {
        if (video.readyState >= 1) seek();
        else listen(video, "loadedmetadata", seek);
      }, 400 + index * 250);
      video.src = clip.videoUrl;
    });
  } catch (error) {
    dispose();
    throw error;
  }
  return { pool, dispose };
}

export function useGalaxyMediaPool(): GalaxyMediaPool | null {
  const [pool, setPool] = useState<GalaxyMediaPool | null>(null);
  useEffect(() => {
    const owner = createMediaPool();
    let active = true;
    queueMicrotask(() => { if (active) setPool(owner.pool); });
    return () => { active = false; owner.dispose(); };
  }, []);
  return pool;
}
