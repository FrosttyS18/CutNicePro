import { beforeEach, describe, expect, it, vi } from "vitest";

/** M2A — contratos de mídia persistente e migração v1→v2 do workspace. */

function memoryLocalStorage() {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

const WORKSPACE_V1 = JSON.stringify({
  version: 1,
  media: { kind: "local", name: "aula.mp4", videoId: null, url: null, width: 1920, height: 1080, duration: 61.5 },
  transcript: [],
  transcriptMode: "empty",
  settings: { ratio: "16:9", fit: "contain", captionModel: 0, text: "", volume: 1, muted: false, background: "#000000", trimStart: 0, trimEnd: 61.5 },
  tool: "editor",
});

describe("workspace v1 → v2 (M2A)", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryLocalStorage());
  });

  it("readWorkspace migra v1 para v2 preservando títulos e configurações", async () => {
    localStorage.setItem("cnp.workspace.v1.p1", WORKSPACE_V1);
    const { readWorkspace } = await import("../services/workspace-store");
    const data = readWorkspace("p1");
    expect(data.version).toBe(2);
    expect(data.media?.name).toBe("aula.mp4");
    expect(data.settings.trimEnd).toBe(61.5);
    // persistiu a migração
    expect(JSON.parse(localStorage.getItem("cnp.workspace.v1.p1") ?? "{}").version).toBe(2);
  });

  it("workspace inválido continua caindo no vazio (sem wipe silencioso de dado válido)", async () => {
    localStorage.setItem("cnp.workspace.v1.p2", "{ corrompido");
    const { readWorkspace } = await import("../services/workspace-store");
    expect(readWorkspace("p2").version).toBe(2);
    expect(readWorkspace("p2").media).toBeNull();
  });

  it("mediaId é opcional no descriptor v2 (mídia de sessão legada continua válida)", async () => {
    const { readWorkspace } = await import("../services/workspace-store");
    localStorage.setItem("cnp.workspace.v1.p3", WORKSPACE_V1);
    const data = readWorkspace("p3");
    expect(data.media?.mediaId).toBeUndefined();
  });
});

describe("contrato ipc M2A (tipos)", () => {
  it("mediaUrl aponta para o scheme cnplocal com hash.ext", async () => {
    const ipc = await import("../lib/ipc");
    const url = ipc.mediaUrl({ sha256: "a".repeat(64), ext: "mp4" });
    expect(url).toBe(`http://cnplocal.localhost/${"a".repeat(64)}.mp4`);
  });
});
