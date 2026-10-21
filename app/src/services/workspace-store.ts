import { emptyWorkspace, DEFAULT_EFFECTS } from "../lib/workspace";
import type { EditorEffects, EditorSettings, UploadSource, WorkspaceData } from "../lib/workspace-types";
import { validSegmentWords } from "../lib/transcript-text";
import { isCaptionStyle } from "../lib/captions";
import { editorAspectRatios } from "../components/upload/tools";

const key = (id: string) => `cnp.workspace.v1.${id}`;
const backupKey = (id: string) => `cnp.workspace.backup.${id}`;
const sessionMedia = new Map<string, { file: File; url: string }>();

/** Limites de contrato (espelham app/src-tauri/src/render/settings.rs). */
const LIMITES = { volume: [0, 2], zoom: [1, 3], brightness: [40, 180], contrast: [40, 180], saturation: [0, 220], blur: [0, 8], hue: [-180, 180] } as const;

function numeroNo(value: unknown, [min, max]: readonly [number, number]): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function validSettings(settings: EditorSettings | undefined): boolean {
  return Boolean(settings && editorAspectRatios.includes(settings.ratio as (typeof editorAspectRatios)[number]) && ["contain", "cover"].includes(settings.fit)
    && Number.isInteger(settings.captionModel) && settings.captionModel >= 0 && settings.captionModel <= 9
    && (settings.captionStyle === undefined || isCaptionStyle(settings.captionStyle))
    && (settings.focalPoint === undefined || [settings.focalPoint.x,settings.focalPoint.y].every(v => Number.isFinite(v) && v >= 0 && v <= 100))
    && (settings.zoom === undefined || numeroNo(settings.zoom, LIMITES.zoom))
    && (settings.effects === undefined || (settings.effects
      && numeroNo(settings.effects.brightness, LIMITES.brightness) && numeroNo(settings.effects.contrast, LIMITES.contrast)
      && numeroNo(settings.effects.saturation, LIMITES.saturation) && numeroNo(settings.effects.blur, LIMITES.blur)
      && numeroNo(settings.effects.hue, LIMITES.hue)))
    && typeof settings.text === "string" && settings.text.length <= 240
    && numeroNo(settings.volume, LIMITES.volume) && typeof settings.muted === "boolean"
    && /^#[0-9a-f]{6}$/i.test(settings.background) && Number.isFinite(settings.trimStart) && settings.trimStart >= 0
    && (settings.trimEnd === null || (Number.isFinite(settings.trimEnd) && settings.trimEnd >= settings.trimStart)));
}

const clamp = (value: number, [min, max]: readonly [number, number]) => Math.min(max, Math.max(min, value));
const cor6 = (value: unknown): string => (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000");

/**
 * Recupera settings campo a campo. Valores corrompidos são corrigidos para o
 * valor mais próximo do contrato (clamp) ou para o padrão — sem descartar o
 * objeto inteiro. Dados antigos sem zoom/effects/y já são válidos (opcionais).
 */
function recuperarSettings(value: unknown): EditorSettings | null {
  if (!value || typeof value !== "object") return null;
  const bruto = value as Record<string, unknown>;
  const base = emptyWorkspace().settings;
  const ratio = editorAspectRatios.includes(bruto.ratio as (typeof editorAspectRatios)[number]) ? bruto.ratio as EditorSettings["ratio"] : base.ratio;
  const fit = bruto.fit === "cover" ? "cover" as const : bruto.fit === "contain" ? "contain" as const : base.fit;
  const captionModel = Number.isInteger(bruto.captionModel) && Number(bruto.captionModel) >= 0 && Number(bruto.captionModel) <= 9 ? Number(bruto.captionModel) : base.captionModel;
  const captionStyle = bruto.captionStyle === undefined || isCaptionStyle(bruto.captionStyle) ? bruto.captionStyle as EditorSettings["captionStyle"] : undefined;
  const focalBase = (typeof bruto.focalPoint === "object" && bruto.focalPoint !== null ? bruto.focalPoint : {}) as Record<string, unknown>;
  // Number.isFinite SEM coalescência falsy: 0 é valor LEGÍTIMO (canto do
  // slider) e não pode virar default (achado adversarial 1.3)
  const numeroOu = (v: unknown, padrao: number) => (typeof v === "number" && Number.isFinite(v) ? v : padrao);
  const focal = { x: clamp(numeroOu(focalBase.x, 50), [0, 100]), y: clamp(numeroOu(focalBase.y, 50), [0, 100]) };
  const texto = typeof bruto.text === "string" ? bruto.text.slice(0, 240) : "";
  const volume = typeof bruto.volume === "number" && Number.isFinite(bruto.volume) ? clamp(bruto.volume, LIMITES.volume) : base.volume;
  const muted = typeof bruto.muted === "boolean" ? bruto.muted : base.muted;
  const trimStart = typeof bruto.trimStart === "number" && Number.isFinite(bruto.trimStart) && bruto.trimStart >= 0 ? bruto.trimStart : 0;
  const trimEndBruto = bruto.trimEnd;
  const trimEnd = trimEndBruto === null || trimEndBruto === undefined ? null
    : typeof trimEndBruto === "number" && Number.isFinite(trimEndBruto) ? Math.max(trimStart, trimEndBruto) : null;
  const zoom = typeof bruto.zoom === "number" && Number.isFinite(bruto.zoom) ? clamp(bruto.zoom, LIMITES.zoom) : undefined;
  const effectsBruto = (typeof bruto.effects === "object" && bruto.effects !== null ? bruto.effects : null) as Record<string, unknown> | null;
  // mesmo cuidado: saturation 0 (P&B) e blur/hue 0 são legítimos (1.3)
  const effects: EditorEffects = effectsBruto
    ? {
        brightness: clamp(numeroOu(effectsBruto.brightness, DEFAULT_EFFECTS.brightness), LIMITES.brightness),
        contrast: clamp(numeroOu(effectsBruto.contrast, DEFAULT_EFFECTS.contrast), LIMITES.contrast),
        saturation: clamp(numeroOu(effectsBruto.saturation, DEFAULT_EFFECTS.saturation), LIMITES.saturation),
        blur: clamp(numeroOu(effectsBruto.blur, DEFAULT_EFFECTS.blur), LIMITES.blur),
        hue: clamp(numeroOu(effectsBruto.hue, DEFAULT_EFFECTS.hue), LIMITES.hue),
      }
    : { ...DEFAULT_EFFECTS };
  const settings: EditorSettings = {
    ratio, fit, captionModel, captionStyle, focalPoint: focal, zoom, effects, text: texto,
    volume, muted, background: cor6(bruto.background), trimStart, trimEnd,
  };
  return validSettings(settings) ? settings : null;
}

function segmentoValido(segment: unknown): boolean {
  if (!segment || typeof segment !== "object") return false;
  const s = segment as Partial<WorkspaceData["transcript"][number]>;
  return typeof s.id === "string" && typeof s.text === "string"
    && typeof s.start === "number" && Number.isFinite(s.start)
    && typeof s.end === "number" && Number.isFinite(s.end)
    && s.start >= 0 && s.end >= s.start && validSegmentWords(s as WorkspaceData["transcript"][number]);
}

/**
 * Recupera o workspace inteiro: corrige campos corrompidos individualmente
 * (clamp/padrão), descarta somente as partes irrecuperáveis (segmento ou
 * edição isolada) e preserva o resto do projeto. Retorna null quando nem a
 * recuperação campo a campo é possível (ex.: versão desconhecida).
 */
function recuperarWorkspace(value: unknown): WorkspaceData | null {
  if (!value || typeof value !== "object") return null;
  const bruto = value as Record<string, unknown>;
  if (bruto.version !== 1 && bruto.version !== 2) return null; // versão futura: não degradar para baixo
  const settings = recuperarSettings(bruto.settings);
  if (!settings) return null; // sem settings recuperáveis não há projeto
  const videoSettings = bruto.videoSettings === undefined ? undefined : recuperarSettings(bruto.videoSettings) ?? undefined;
  if (bruto.videoSettings !== undefined && videoSettings === undefined) {
    console.warn("[workspace] configurações do vídeo completo irrecuperáveis foram descartadas na reabertura");
  }
  const clipEdits: WorkspaceData["clipEdits"] = {};
  if (bruto.clipEdits && typeof bruto.clipEdits === "object" && !Array.isArray(bruto.clipEdits)) {
    for (const [id, edicao] of Object.entries(bruto.clipEdits as Record<string, unknown>)) {
      if (!/^[a-f\d]{64}$/i.test(id)) continue; // chave corrompida: descarta a entrada, não o mapa
      const recuperada = recuperarSettings(edicao);
      if (recuperada) clipEdits[id] = recuperada;
    }
  }
  const transcript = Array.isArray(bruto.transcript)
    ? bruto.transcript.filter(segmentoValido) as WorkspaceData["transcript"]
    : [];
  if (Array.isArray(bruto.transcript) && transcript.length < bruto.transcript.length) {
    console.warn(`[workspace] ${bruto.transcript.length - transcript.length} segmento(s) corrompido(s) descartado(s) na reabertura`);
  }
  const transcriptMode = ["demo", "empty", "real"].includes(String(bruto.transcriptMode)) ? bruto.transcriptMode as WorkspaceData["transcriptMode"] : "empty";
  const tool = ["editor", "captions", "clips", "reframe"].includes(String(bruto.tool)) ? bruto.tool as WorkspaceData["tool"] : "editor";
  const activeClipId = typeof bruto.activeClipId === "string" && /^[a-f\d]{64}$/i.test(bruto.activeClipId) ? bruto.activeClipId : undefined;
  const mediaBruta = bruto.media as Record<string, unknown> | null | undefined;
  let media: WorkspaceData["media"] = null;
  if (mediaBruta && typeof mediaBruta === "object") {
    if (mediaBruta.kind === "youtube" && typeof mediaBruta.videoId === "string" && /^[a-zA-Z0-9_-]{11}$/.test(mediaBruta.videoId) && typeof mediaBruta.name === "string") {
      media = mediaBruta as unknown as WorkspaceData["media"];
    } else if (mediaBruta.kind === "local" && typeof mediaBruta.name === "string") {
      media = mediaBruta as unknown as WorkspaceData["media"];
    }
  }
  const recuperado: WorkspaceData = { version: 2, media, transcript, transcriptMode, settings, tool, videoSettings, clipEdits, activeClipId };
  return validWorkspace(recuperado) ? recuperado : null;
}

function validWorkspace(value: unknown): value is WorkspaceData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<WorkspaceData>;
  return (data.version === 1 || data.version === 2) && validSettings(data.settings) && ["demo", "empty", "real"].includes(data.transcriptMode ?? "")
    && (data.videoSettings === undefined || validSettings(data.videoSettings))
    && (data.clipEdits === undefined || Boolean(data.clipEdits && typeof data.clipEdits === "object" && !Array.isArray(data.clipEdits)
      && Object.entries(data.clipEdits).every(([id,value]) => /^[a-f\d]{64}$/i.test(id) && validSettings(value))))
    && (data.activeClipId === undefined || (typeof data.activeClipId === "string" && /^[a-f\d]{64}$/i.test(data.activeClipId)))
    && ["editor", "captions", "clips", "reframe"].includes(data.tool ?? "")
    && (data.media === null || Boolean(data.media && ["local", "youtube"].includes(data.media.kind)
      && typeof data.media.name === "string"
      && (data.media.kind !== "youtube" || (typeof data.media.videoId === "string" && /^[a-zA-Z0-9_-]{11}$/.test(data.media.videoId)))))
    && Array.isArray(data.transcript) && data.transcript.every((segment) => segmentoValido(segment));
}

/**
 * Preserva registro irrecuperável: copia o conteúdo bruto para a chave de
 * backup e NÃO altera o original — a falha de leitura nunca apaga dados.
 */
function preservarIrrecuperavel(id: string, raw: string): void {
  try { localStorage.setItem(backupKey(id), raw); } catch { /* backup best-effort */ }
  console.warn(`[workspace] registro irrecuperável preservado em ${backupKey(id)} — verifique manualmente`);
}

export function readWorkspace(id: string): WorkspaceData {
  try {
    const raw = localStorage.getItem(key(id));
    if (raw === null) return emptyWorkspace();
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      preservarIrrecuperavel(id, raw);
      return emptyWorkspace();
    }
    if (validWorkspace(data)) {
      const recuperado = data as WorkspaceData;
      // M2A: migra v1→v2 preservando títulos/configurações (mediaId ausente ok)
      if (recuperado.version === 1) {
        // backup do original antes de sobrescrever (achado adversarial 1.5):
        // um bug futuro na migração não destrói o último registro v1
        try { localStorage.setItem(backupKey(id), raw); } catch { /* best-effort */ }
        const migrated: WorkspaceData = { ...recuperado, version: 2 };
        saveWorkspace(id, migrated);
        return migrated;
      }
      return recuperado;
    }
    // registro inválido: tenta recuperação campo a campo ANTES de desistir;
    // o original permanece intacto — sem substituição silenciosa por vazio
    const recuperado = recuperarWorkspace(data);
    if (recuperado) return recuperado;
    preservarIrrecuperavel(id, raw);
    return emptyWorkspace();
  } catch { return emptyWorkspace(); }
}

export function saveWorkspace(id: string, data: WorkspaceData): boolean {
  try { localStorage.setItem(key(id), JSON.stringify(data)); return true; }
  catch { return false; }
}

/**
 * M2A: mídia persistida (cópia em app-data) servida pelo scheme cnplocal.
 * Object URLs de sessão continuam para o caminho YouTube/referência.
 */
export function attachPersistedMedia(id: string, _mediaId: string, url: string): void {
  const previous = sessionMedia.get(id);
  if (previous) URL.revokeObjectURL(previous.url);
  sessionMedia.set(id, { file: null as unknown as File, url });
}

export function attachSessionMedia(id: string, source: UploadSource): void {
  const previous = sessionMedia.get(id);
  if (previous) URL.revokeObjectURL(previous.url);
  sessionMedia.delete(id);
  if (source.kind === "local") sessionMedia.set(id, { file: source.video.file, url: URL.createObjectURL(source.video.file) });
}

export function getSessionMedia(id: string): string | null {
  return sessionMedia.get(id)?.url ?? null;
}

export function releaseSessionMedia(): void {
  sessionMedia.forEach(({ url }) => URL.revokeObjectURL(url));
  sessionMedia.clear();
}

export function removeWorkspace(id: string): void {
  localStorage.removeItem(key(id));
  localStorage.removeItem(backupKey(id));
  const media = sessionMedia.get(id);
  if (media) URL.revokeObjectURL(media.url);
  sessionMedia.delete(id);
}
