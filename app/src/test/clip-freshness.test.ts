import { afterEach, describe, expect, it, vi } from "vitest";
import { isClipNew, relativeTime, type Clip } from "../lib/clips";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const now = 1_700_000_000_000;
const base: Clip = { id: "a".repeat(64), start: 0, end: 10, title: "T", score: 50, reasons: [], review: "pending" };

describe("Novo durante uma hora desde a criação", () => {
  it("permanece novo mesmo com registro antigo de abertura", () => {
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify([base.id]) });
    vi.spyOn(Date, "now").mockReturnValue(now);
    expect(isClipNew({ ...base, createdAtMs: now - 5_000 })).toBe(true);
  });
  it("expira ao completar exatamente 60 minutos", () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    expect(isClipNew({ ...base, createdAtMs: now - 3_599_999 })).toBe(true);
    expect(isClipNew({ ...base, createdAtMs: now - 3_600_000 })).toBe(false);
    expect(isClipNew({ ...base, createdAtMs: now - 3_600_001 })).toBe(false);
  });
  it("não inventa criação para legado, data inválida ou futura", () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    expect(isClipNew(base)).toBe(false);
    for (const createdAtMs of [0, -1, NaN, Infinity, now + 1]) {
      expect(isClipNew({ ...base, createdAtMs })).toBe(false);
    }
  });
  it("editar e reanalisar preserva a idade do clipe", () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    expect(isClipNew({ ...base, createdAtMs: now - 3_600_000, score: 90, review: "approved" })).toBe(false);
  });
});

describe("tempo relativo", () => {
  it("mostra agora, minutos, horas e dias sem modificar a data", () => {
    expect(relativeTime(now - 30_000, now)).toBe("Agora");
    expect(relativeTime(now - 60_000, now)).toBe("há 1 minuto");
    expect(relativeTime(now - 5 * 60_000, now)).toBe("há 5 minutos");
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe("há 3 horas");
    expect(relativeTime(now - 2 * 86_400_000, now)).toBe("há 2 dias");
    expect(relativeTime(now + 60_000, now)).toBe("Agora");
  });
});
