import { afterEach, describe, expect, it, vi } from "vitest";
import { readWorkspace, saveWorkspace } from "../services/workspace-store";
import { createWorkspace, defaultEditorSettings } from "../lib/workspace";
import type { TranscriptSegment, WorkspaceData } from "../lib/workspace-types";

const source = { kind: "youtube" as const, url: "https://youtu.be/abcdefghijk", videoId: "abcdefghijk" };
const options = { tool: "editor" as const, ratio: "16:9" as const, model: 1 };

function storageStub() {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  return storage;
}

function workspaceCompleto(): WorkspaceData {
  const workspace = createWorkspace(source, options);
  workspace.media = { kind: "youtube", name: "Vídeo de origem", videoId: "abcdefghijk", url: null, width: 1920, height: 1080, duration: 120 };
  workspace.transcriptMode = "real";
  const segmento: TranscriptSegment = { id: "seg1", start: 0, end: 4, text: "frase original", words: [{ text: "frase", start: 0, end: 2 }, { text: "original", start: 2, end: 4 }] };
  workspace.transcript = [segmento];
  return workspace;
}

describe("integridade da persistência de projetos (atualização 16)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("REPRODUÇÃO: volume 150% salvo não pode destruir o projeto na reabertura", () => {
    storageStub();
    const workspace = workspaceCompleto();
    workspace.settings.volume = 1.5; // permitido pelo slider (0–200%) e pelo render (0..=2)
    expect(saveWorkspace("p1", workspace)).toBe(true);
    const reaberto = readWorkspace("p1");
    // antes da correção: validWorkspace rejeita volume>1 → emptyWorkspace() → mídia e transcrição somem
    expect(reaberto.transcriptMode).toBe("real");
    expect(reaberto.transcript[0]?.text).toBe("frase original");
    expect(reaberto.settings.volume).toBe(1.5);
  });

  it("REPRODUÇÃO: volume 150% dentro de clipEdits não pode invalidar o projeto", () => {
    storageStub();
    const workspace = workspaceCompleto();
    const clipId = "a".repeat(64);
    workspace.clipEdits = { [clipId]: { ...defaultEditorSettings(), volume: 1.5 } };
    expect(saveWorkspace("p1", workspace)).toBe(true);
    const reaberto = readWorkspace("p1");
    expect(reaberto.clipEdits?.[clipId]?.volume).toBe(1.5);
    expect(reaberto.transcriptMode).toBe("real");
  });

  it("aceita volumes 0%, 100% e 200% sem perder mídia nem transcrição", () => {
    for (const volume of [0, 1, 2]) {
      storageStub();
      const workspace = workspaceCompleto();
      workspace.settings.volume = volume;
      saveWorkspace("p1", workspace);
      const reaberto = readWorkspace("p1");
      expect(reaberto.settings.volume).toBe(volume);
      expect(reaberto.transcript).toHaveLength(1);
      expect(reaberto.media?.videoId).toBe("abcdefghijk");
    }
  });

  it("rascunho antigo sem zoom/effects/y/wordsPerCaption continua válido (migração por defeito)", () => {
    const storage = storageStub();
    const workspace = workspaceCompleto();
    // simula rascunho gravado antes das atualizações 13–15
    const antigo = { ...workspace, settings: { ...workspace.settings } } as WorkspaceData & { settings: Record<string, unknown> };
    delete antigo.settings.zoom;
    delete antigo.settings.effects;
    delete (antigo.settings.captionStyle as { y?: unknown })?.y;
    delete (antigo.settings.captionStyle as { wordsPerCaption?: unknown })?.wordsPerCaption;
    storage.set("cnp.workspace.v1.p1", JSON.stringify(antigo));
    const reaberto = readWorkspace("p1");
    expect(reaberto.transcriptMode).toBe("real");
    expect(reaberto.transcript[0]?.text).toBe("frase original");
  });

  it("dado irrecuperável preserva o registro original e não o substitui por vazio", () => {
    const storage = storageStub();
    const bruto = '{"version":9,"coisa":"desconhecida"}'; // versão futura/malformada: não migrar para baixo
    storage.set("cnp.workspace.v1.p1", bruto);
    const reaberto = readWorkspace("p1");
    expect(reaberto.media).toBeNull(); // UI recebe vazio para não travar
    // mas o original PRECISA continuar intacto no storage (sem sobrescrita silenciosa)
    expect(storage.get("cnp.workspace.v1.p1")).toBe(bruto);
    // e um backup do conteúdo irrecuperável deve existir para recuperação manual
    expect(storage.get("cnp.workspace.backup.p1")).toBe(bruto);
  });

  it("JSON corrompido não apaga nada: registro permanece para recuperação", () => {
    const storage = storageStub();
    storage.set("cnp.workspace.v1.p1", "{não é json");
    const reaberto = readWorkspace("p1");
    expect(reaberto.media).toBeNull();
    expect(storage.get("cnp.workspace.v1.p1")).toBe("{não é json");
    expect(storage.get("cnp.workspace.backup.p1")).toBe("{não é json");
  });

  it("sanitiza campos corrompidos sem descartar o resto do projeto", () => {
    const storage = storageStub();
    const workspace = workspaceCompleto();
    const corrompido = {
      ...workspace,
      settings: { ...workspace.settings, volume: 42 }, // fora de 0–2: clamp sem perder o resto
      transcript: [...workspace.transcript, { id: "quebrado", start: 10, end: 5, text: "inverted" }], // segmento inválido isolado
      clipEdits: { ["z".repeat(64)]: { ...defaultEditorSettings(), captionModel: 99 } }, // edição com campo fora do contrato
    };
    storage.set("cnp.workspace.v1.p1", JSON.stringify(corrompido));
    const reaberto = readWorkspace("p1");
    expect(reaberto.transcriptMode).toBe("real");
    expect(reaberto.transcript).toHaveLength(1); // só o segmento válido
    expect(reaberto.settings.volume).toBe(2); // clamp ao máximo do contrato
    expect(reaberto.clipEdits?.["z".repeat(64)]).toBeUndefined(); // entrada inválida descartada SEM invalidar o projeto
  });

  it("valores LEGÍTIMOS zero sobrevivem à recuperação (sem coalescência falsy)", () => {
    const storage = storageStub();
    const workspace = workspaceCompleto();
    workspace.settings.focalPoint = { x: 0, y: 0 }; // cantos do slider
    workspace.settings.effects = { brightness: 100, contrast: 100, saturation: 0, blur: 0, hue: 0 }; // P&B
    // força a recuperação com um SEGUNDO campo corrompido (volume fora do contrato)
    const registro = JSON.parse(JSON.stringify({ ...workspace, settings: { ...workspace.settings, volume: 99 } }));
    storage.set("cnp.workspace.v1.p1", JSON.stringify(registro));
    const reaberto = readWorkspace("p1");
    expect(reaberto.settings.volume).toBe(2); // clamp do campo inválido
    expect(reaberto.settings.focalPoint).toEqual({ x: 0, y: 0 }); // zeros preservados
    expect(reaberto.settings.effects?.saturation).toBe(0); // P&B preservado
    expect(reaberto.transcriptMode).toBe("real");
  });

  it("migra v1→v2 preservando dados e mantendo backup do original", () => {
    const storage = storageStub();
    const workspace = workspaceCompleto();
    const v1 = { ...workspace, version: 1 as const };
    storage.set("cnp.workspace.v1.p1", JSON.stringify(v1));
    const reaberto = readWorkspace("p1");
    expect(reaberto.version).toBe(2);
    expect(reaberto.transcriptMode).toBe("real");
    expect(reaberto.transcript[0]?.text).toBe("frase original");
    const salvo = JSON.parse(storage.get("cnp.workspace.v1.p1") ?? "{}");
    expect(salvo.version).toBe(2);
    // backup do original v1 preservado (achado adversarial 1.5)
    const backup = JSON.parse(storage.get("cnp.workspace.backup.p1") ?? "{}");
    expect(backup.version).toBe(1);
  });
});
