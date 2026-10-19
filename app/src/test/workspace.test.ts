import { afterEach, describe, expect, it, vi } from "vitest";
import { clampTime, createWorkspace, formatMediaTime, sourceName } from "../lib/workspace";
import { readWorkspace, saveWorkspace } from "../services/workspace-store";
import type { UploadSource } from "../lib/workspace-types";

const source: UploadSource = { kind: "youtube", url: "https://youtu.be/abcdefghijk", videoId: "abcdefghijk" };
const options = { tool: "editor" as const, ratio: "16:9" as const, model: 1 };

describe("contrato do fluxo de projeto e editor", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("aguarda o motor sem inventar transcrição ou metadados do YouTube", () => {
    const workspace = createWorkspace(source, options);
    expect(workspace.transcriptMode).toBe("empty");
    expect(workspace.media?.duration).toBeNull();
    expect(workspace.media?.width).toBeNull();
    expect(workspace.transcript).toHaveLength(0);
  });
  it("deriva nome válido da origem", () => expect(sourceName(source)).toContain("abcdefghijk"));
  it("limita seek ao intervalo real", () => {
    expect(clampTime(-5, 10)).toBe(0);
    expect(clampTime(12, 10)).toBe(10);
    expect(clampTime(NaN, 10)).toBe(0);
    expect(formatMediaTime(125)).toBe("02:05");
  });
  it("persiste configurações e texto sem guardar o arquivo binário", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) });
    const workspace = createWorkspace(source, options);
    workspace.settings.text = "Meu título";
    expect(saveWorkspace("p1", workspace)).toBe(true);
    expect(readWorkspace("p1").settings.text).toBe("Meu título");
    expect(readWorkspace("outro").media).toBeNull();
  });
  it("recupera arquivo de preferências inválido sem quebrar a tela", () => {
    vi.stubGlobal("localStorage", { getItem: () => '{"version":1,"settings":{}}', setItem: () => { throw new Error("disco cheio"); } });
    expect(readWorkspace("p1").media).toBeNull();
    expect(saveWorkspace("p1", createWorkspace(source, options))).toBe(false);
  });
});
