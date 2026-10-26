import { suggestSplitScreen } from "../lib/ipc";
import { isSplitScreen } from "../lib/split-screen";
import type { EditorSettings, SplitScreenSettings, SplitViewport } from "../lib/workspace-types";

export interface SplitFramingSource {
  projectId: string;
  mediaId: string;
  start: number;
  end: number;
  viewport?: SplitViewport;
}

export type SplitFramingSuggestion =
  | { status: "found"; layout: SplitScreenSettings; message: string }
  | { status: "manual"; message: string };

export async function suggestSplitFraming(source: SplitFramingSource): Promise<SplitFramingSuggestion> {
  if (!source.projectId.trim() || !source.mediaId.trim()
    || !Number.isFinite(source.start) || !Number.isFinite(source.end) || source.start < 0 || source.end <= source.start) {
    throw new Error("Conecte um vídeo local e selecione um trecho válido para localizar duas pessoas.");
  }
  const response: unknown = await suggestSplitScreen(source);
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new Error("Resposta de enquadramento inválida. Tente novamente ou use quadro único.");
  }
  const result = response as Record<string, unknown>;
  if (typeof result.message !== "string" || !result.message.trim()) {
    throw new Error("Resposta de enquadramento inválida. Tente novamente ou use quadro único.");
  }
  if (result.status === "found" && isSplitScreen(result.layout)) {
    if (result.layout.shots?.some(shot => shot.sourceStart < source.start || shot.sourceEnd > source.end)) {
      throw new Error("Resposta de enquadramento fora do trecho selecionado.");
    }
    return { status: "found", layout: { ...result.layout, faceValidated: true }, message: result.message };
  }
  if (result.status === "manual" && result.layout == null) {
    return { status: "manual", message: result.message };
  }
  throw new Error("Resposta de enquadramento inválida. Tente novamente ou use quadro único.");
}

export async function verifySplitSettings(settings: EditorSettings, source: SplitFramingSource): Promise<{ settings: EditorSettings; notice?: string }> {
  if (!settings.splitScreen || settings.splitScreen.faceValidated) return { settings };
  const result = await suggestSplitFraming(source);
  return { settings: { ...settings, splitScreen: result.status === "found" ? result.layout : null }, notice: result.message };
}
