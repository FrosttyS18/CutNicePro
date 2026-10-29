import type { FrameRate } from "./composition-types";

export const EXPORT_RESOLUTIONS = [
  { value: "hd480", label: "480p", edge: 480 }, { value: "hd720", label: "720p", edge: 720 },
  { value: "hd1080", label: "1080p", edge: 1080 }, { value: "qhd1440", label: "2K", edge: 1440 },
  { value: "uhd2160", label: "4K", edge: 2160 }, { value: "uhd4320", label: "8K", edge: 4320 },
] as const;
export const EXPORT_QUALITIES = [
  { value: "smaller", label: "Menor" }, { value: "balanced", label: "Recomendado" },
  { value: "high", label: "Superior" }, { value: "custom", label: "Personalizado" },
] as const;
export const EXPORT_CODECS = [
  { value: "h264", label: "H.264" }, { value: "hevc", label: "HEVC" },
  { value: "hevcAlpha", label: "HEVC (Alpha)" }, { value: "hevc422", label: "HEVC (422)" },
  { value: "av1", label: "AV1" }, { value: "rle", label: "RLE" },
] as const;
export const EXPORT_FRAME_RATES = [
  { value: "fps24", label: "24 fps", rate: 24 }, { value: "fps25", label: "25 fps", rate: 25 },
  { value: "fps2997", label: "29,97 fps", rate: 30000 / 1001 }, { value: "fps30", label: "30 fps", rate: 30 },
  { value: "fps50", label: "50 fps", rate: 50 }, { value: "fps5994", label: "59,94 fps", rate: 60000 / 1001 },
  { value: "fps60", label: "60 fps", rate: 60 },
] as const;
export type ExportCodec = typeof EXPORT_CODECS[number]["value"];
export interface ExportOptions {
  resolution: "original" | typeof EXPORT_RESOLUTIONS[number]["value"];
  quality: typeof EXPORT_QUALITIES[number]["value"];
  codec?: ExportCodec;
  format?: "mp4" | "mov";
  frameRate?: "original" | typeof EXPORT_FRAME_RATES[number]["value"];
  bitrateKbps?: number;
  bitrateMode?: "vbr" | "cbr";
}
export interface ResolvedExportOptions extends ExportOptions {
  codec: ExportCodec;
  format: "mp4" | "mov";
  frameRate: NonNullable<ExportOptions["frameRate"]>;
  bitrateMode: "vbr" | "cbr";
}
export interface ExportCapabilities { codecs: { codec: ExportCodec; supported: boolean; reason?: string }[] }

export function defaultExportOptions(fps: FrameRate, initial?: ExportOptions): ResolvedExportOptions {
  const rate = fps.numerator / fps.denominator;
  const options: ResolvedExportOptions = { resolution: "hd1080", quality: "high", codec: "h264", format: "mp4",
    frameRate: EXPORT_FRAME_RATES.find(item => Math.abs(item.rate - rate) < .001)?.value ?? "original",
    bitrateMode: "vbr", ...initial };
  if (options.quality !== "custom") {
    options.bitrateMode = "vbr";
    delete options.bitrateKbps;
  }
  return options;
}

export function parseExportCapabilities(value: unknown): ExportCapabilities {
  const invalid = () => new Error("Não foi possível verificar os codecs disponíveis.");
  if (!value || typeof value !== "object" || !("codecs" in value) || !Array.isArray(value.codecs) || value.codecs.length !== EXPORT_CODECS.length) throw invalid();
  const codecs: ExportCapabilities["codecs"] = [];
  for (const entry of value.codecs) {
    if (!entry || typeof entry !== "object" || typeof entry.supported !== "boolean") throw invalid();
    const known = EXPORT_CODECS.find(item => item.value === entry.codec);
    if (!known || codecs.some(item => item.codec === known.value) || (entry.reason != null && typeof entry.reason !== "string")) throw invalid();
    codecs.push({ codec: known.value, supported: entry.supported, ...(typeof entry.reason === "string" ? { reason: entry.reason } : {}) });
  }
  return { codecs };
}

export function validateExportOptions(options: ResolvedExportOptions, capabilities: ExportCapabilities): string | null {
  if (!capabilities.codecs.some(item => item.codec === options.codec && item.supported)) return "Este codec não está disponível. Escolha outro codec.";
  if (options.codec === "rle" && options.format !== "mov") return "RLE precisa do formato MOV.";
  if (options.codec === "hevcAlpha" && options.format !== "mov") return "HEVC (Alpha) precisa do formato MOV.";
  if (options.codec === "rle" && (options.quality !== "high" || options.bitrateMode !== "vbr" || options.bitrateKbps !== undefined)) return "RLE usa compressão sem perdas, sem taxa de bits personalizada.";
  if (options.quality === "custom" && (!Number.isInteger(options.bitrateKbps) || !Number.isFinite(options.bitrateKbps)
    || options.bitrateKbps! < 100 || options.bitrateKbps! > 500000)) return "Informe uma taxa inteira de 100 a 500.000 Kbps.";
  return null;
}

export interface ExportRequest {
  fileName: string;
  directory: string | null;
  options: ExportOptions;
  overwrite?: boolean;
}

export interface ExportDestination { exists: boolean; fileName: string }

export function parseExportDestination(value: unknown): ExportDestination {
  const invalid = () => new Error("Não foi possível verificar o destino da exportação.");
  if (!value || typeof value !== "object" || !("exists" in value) || typeof value.exists !== "boolean"
    || !("fileName" in value) || typeof value.fileName !== "string") throw invalid();
  const name = value.fileName;
  if (!name || name.length > 255 || name.trim() !== name || name === "." || name === ".."
    || /[<>:"/\\|?*]/.test(name) || Array.from(name).some(character => character.charCodeAt(0) < 32)
    || /[. ]$/.test(name)) throw invalid();
  return { exists: value.exists, fileName: name };
}

export interface ExportReceipt {
  id: string;
  path: string;
  bytes: number;
  reused: boolean;
}

export function exportOutputSize(size: { width: number; height: number }, resolution: ExportOptions["resolution"]): { width: number; height: number } {
  if (resolution === "original") return size;
  const edge = EXPORT_RESOLUTIONS.find(item => item.value === resolution)!.edge;
  const scale = edge / Math.min(size.width, size.height);
  const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);
  return { width: even(size.width * scale), height: even(size.height * scale) };
}

export function parseExportReceipt(value: unknown): ExportReceipt | null {
  if (value === null) return null;
  if (!value || typeof value !== "object") throw new Error("Não foi possível confirmar o arquivo exportado.");
  const receipt = value as Record<string, unknown>;
  if (typeof receipt.id !== "string" || !/^[a-f0-9-]{36}$/i.test(receipt.id)
    || typeof receipt.path !== "string" || !receipt.path.trim() || receipt.path.length > 32768
    || typeof receipt.bytes !== "number" || !Number.isSafeInteger(receipt.bytes) || receipt.bytes <= 0
    || typeof receipt.reused !== "boolean") throw new Error("Não foi possível confirmar o arquivo exportado.");
  return { id: receipt.id, path: receipt.path, bytes: receipt.bytes, reused: receipt.reused };
}
