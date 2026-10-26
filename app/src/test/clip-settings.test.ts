import { describe, expect, it } from "vitest";
import { clipSettings, isolatedClipSettings, type Clip } from "../lib/clips";
import { defaultEditorSettings } from "../lib/workspace";
import type { EditorSettings } from "../lib/workspace-types";
import { openClipWorkspace } from "../lib/clip-workspace";
import type { WorkspaceData } from "../lib/workspace-types";

/**
 * Regressão da UPD-020 (auditoria externa): o download/preview DEVIA usar a
 * edição salva, mas clipSettings() sobrescrevia trimStart/trimEnd com os
 * limites originais do clipe e `captionModel || 2` transformava o ZERO
 * legítimo (legendas desativadas) em modelo 2.
 * Cenário da auditoria: clipe 10–60 s, edição salva 30–40 s, captionModel 0
 * → saída antiga: 10–60 s e modelo 2. Correto: 30–40 s e modelo 0.
 */

const clip: Clip = { id: "a".repeat(64), start: 10, end: 60, title: "Trecho", score: 80, reasons: [], review: "pending" };
const saved = (over: Partial<EditorSettings> = {}): EditorSettings =>
  ({ ...defaultEditorSettings(), trimStart: 30, trimEnd: 40, captionModel: 0, ...over });

describe("configurações do clipe preservam a edição salva (upd 20)", () => {
  it("cenário da auditoria: intervalo editado e legendas desativadas sobrevivem", () => {
    const settings = isolatedClipSettings(clip, saved());
    expect(settings.trimStart).toBe(30);
    expect(settings.trimEnd).toBe(40);
    expect(settings.captionModel).toBe(0);
  });
  it("clipSettings sozinho também preserva intervalo e modelo zero", () => {
    const settings = clipSettings(saved(), clip);
    expect(settings.trimStart).toBe(30);
    expect(settings.trimEnd).toBe(40);
    expect(settings.captionModel).toBe(0);
  });
  it("sem edição salva: limites originais do clipe e legendas ativas (padrão histórico)", () => {
    const settings = isolatedClipSettings(clip, undefined, null);
    expect(settings.trimStart).toBe(10);
    expect(settings.trimEnd).toBe(60);
    expect(settings.captionModel).toBe(2);
  });
  it("edição histórica fora dos limites do clipe é ajustada para dentro, não expandida", () => {
    const settings = isolatedClipSettings(clip, saved({ trimStart: 0, trimEnd: 200 }));
    expect(settings.trimStart).toBe(10);
    expect(settings.trimEnd).toBe(60);
  });
  it("trimEnd nulo usa o fim do clipe; modelo legítimo diferente de zero persiste", () => {
    const settings = isolatedClipSettings(clip, saved({ trimEnd: null, captionModel: 3 }));
    expect(settings.trimEnd).toBe(60);
    expect(settings.captionModel).toBe(3);
  });
  it("reabertura do editor mantém o intervalo editado (openClipWorkspace)", () => {
    const data: WorkspaceData = { version: 2, media: null, transcript: [], transcriptMode: "empty",
      settings: defaultEditorSettings(), tool: "editor", clipEdits: { [clip.id]: saved() } };
    const opened = openClipWorkspace(data, clip);
    expect(opened.settings.trimStart).toBe(30);
    expect(opened.settings.trimEnd).toBe(40);
    expect(opened.settings.captionModel).toBe(0);
    expect(opened.activeClipId).toBe(clip.id);
  });

  it("ampliação manual usa a mídia original ao reabrir e preparar download", () => {
    const data: WorkspaceData = { version: 2, media: { kind: "local", name: "Fonte.mp4", videoId: null, url: null, width: 1920, height: 1080, duration: 180 },
      transcript: [], transcriptMode: "empty", settings: defaultEditorSettings(), tool: "editor", clipEdits: { [clip.id]: saved({ trimStart: 5, trimEnd: 90 }) } };
    const opened = openClipWorkspace(data, clip);
    expect([opened.settings.trimStart, opened.settings.trimEnd]).toEqual([5, 90]);
    expect(isolatedClipSettings(clip, data.clipEdits![clip.id], data.media)).toMatchObject({ trimStart: 5, trimEnd: 90 });
    expect(isolatedClipSettings(clip, saved({ trimStart: -5, trimEnd: 999 }), data.media)).toMatchObject({ trimStart: 0, trimEnd: 180 });
  });
});
