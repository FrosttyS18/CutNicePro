import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Preview { version: number; frames: number[][]; peaks: number[]; hasAudio: boolean }
const pending = new Map<string,Promise<Preview>>();
function load(mediaId: string) {
  let job = pending.get(mediaId);
  if (!job) {
    job = invoke<Preview>("timeline_preview",{mediaId}).finally(() => pending.delete(mediaId));
    pending.set(mediaId,job);
  }
  return job;
}

export function useTimelinePreview(mediaId: string | undefined) {
  const [data,setData] = useState<{id:string;frames:string[];peaks:number[];hasAudio:boolean}|null>(null);
  const [error,setError] = useState<string|null>(null);
  useEffect(() => {
    if (!mediaId) return;
    let disposed = false;
    const urls: string[] = [];
    setError(null);
    void load(mediaId).then(result => {
      if (disposed) return;
      if (result.version !== 2 || !Array.isArray(result.frames) || !result.frames.every(f => Array.isArray(f) && f.every(b => Number.isInteger(b) && b>=0 && b<=255))
        || !Array.isArray(result.peaks) || !result.peaks.every(p => Number.isFinite(p) && p>=0 && p<=1)) throw new Error("prévia inválida");
      urls.push(...result.frames.map(frame => URL.createObjectURL(new Blob([new Uint8Array(frame)],{type:"image/jpeg"}))));
      setData({id:mediaId,frames:urls,peaks:result.peaks,hasAudio:result.hasAudio});
    }).catch(() => { if (!disposed) setError("Não foi possível carregar a linha do tempo. Reabra o projeto para tentar novamente."); });
    return () => { disposed=true; urls.forEach(url=>URL.revokeObjectURL(url)); };
  },[mediaId]);
  const current = data?.id === mediaId ? data : null;
  return {frames:current?.frames ?? [],peaks:current?.peaks ?? [],hasAudio:current?.hasAudio ?? false,loading:Boolean(mediaId && !current && !error),error};
}
