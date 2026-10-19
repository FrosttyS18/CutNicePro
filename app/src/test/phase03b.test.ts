/** Testes das regras puras da Fase 03B (coleções, plurais, preferências). */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  plural,
  projectCount,
  projectsOf,
  sortCollections,
  validateCollectionName,
} from "../lib/collections";
import { loadSidebarExpanded, saveSidebarExpanded } from "../lib/prefs";
import { formatCompactDate } from "../lib/format";
import {
  assertLocalSources,
  CARD_RATIOS,
  contactSheetPlaceholders,
} from "../lib/contactSheetSources";
import type { CollectionMeta, ProjectMeta } from "../lib/types";

/** localStorage em memória para o ambiente node do vitest. */
function memoryLocalStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i) => Array.from(map.keys())[i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  };
}

function project(id: string, name: string): ProjectMeta {
  return {
    id,
    name,
    created_at_ms: 1,
    updated_at_ms: 1,
    last_opened_at_ms: null,
  };
}

function collection(over: Partial<CollectionMeta>): CollectionMeta {
  return {
    id: "c1",
    name: "Coleção",
    icon: "archive-box",
    created_at_ms: 1,
    updated_at_ms: 1,
    project_ids: [],
    ...over,
  };
}

describe("validateCollectionName", () => {
  it("rejeita vazio e espaços", () => {
    expect(validateCollectionName("").ok).toBe(false);
    expect(validateCollectionName("   ").ok).toBe(false);
  });

  it("rejeita acima de 80 caracteres", () => {
    const err = validateCollectionName("a".repeat(81));
    expect(err.ok).toBe(false);
    expect(err.error).toContain("80");
  });

  it("aceita nome válido com trim", () => {
    expect(validateCollectionName("  Mr beast  ")).toEqual({ ok: true, error: null });
  });
});

describe("plural", () => {
  it("singular e plural em pt-BR", () => {
    expect(plural(1, "projeto", "projetos")).toBe("1 projeto");
    expect(plural(0, "clipe", "clipes")).toBe("0 clipes");
    expect(plural(3, "clipe", "clipes")).toBe("3 clipes");
  });
});

describe("coleções x projetos", () => {
  it("conta projetos da coleção", () => {
    expect(projectCount(collection({ project_ids: ["a", "b"] }))).toBe(2);
  });

  it("resolve projetos na ordem de adição e ignora ids órfãos", () => {
    const c = collection({ project_ids: ["p2", "p404", "p1"] });
    const out = projectsOf(c, [project("p1", "A"), project("p2", "B")]);
    expect(out.map((p) => p.id)).toEqual(["p2", "p1"]);
  });

  it("ordena coleções por atualização mais recente", () => {
    const a = collection({ id: "a", updated_at_ms: 10 });
    const b = collection({ id: "b", updated_at_ms: 20 });
    expect(sortCollections([a, b]).map((c) => c.id)).toEqual(["b", "a"]);
  });
});

describe("formatCompactDate (design 03B: dd.mm.aaaa)", () => {
  it("formata com zeros à esquerda e pontos", () => {
    expect(formatCompactDate(new Date(2026, 9, 18, 12).getTime())).toBe("18.10.2026");
    expect(formatCompactDate(new Date(2026, 0, 5).getTime())).toBe("05.01.2026");
  });
});

describe("fontes de mídia do hero (contrato)", () => {
  it("placeholders são locais, sem URLs externas, nas 4 proporções", () => {
    expect(contactSheetPlaceholders.length).toBeGreaterThanOrEqual(12);
    expect(assertLocalSources(contactSheetPlaceholders)).toBe(true);
    const ratios = new Set(contactSheetPlaceholders.map((c) => c.ratio));
    expect(ratios.has(CARD_RATIOS.vertical)).toBe(true); // 9:16
    expect(ratios.has(CARD_RATIOS.portrait)).toBe(true); // 4:5
    expect(ratios.has(CARD_RATIOS.square)).toBe(true); // 1:1
    expect(ratios.has(CARD_RATIOS.wide)).toBe(true); // 16:9
  });
});

describe("preferência da sidebar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("padrão expandida; persiste e recarrega", () => {
    vi.stubGlobal("localStorage", memoryLocalStorage());
    expect(loadSidebarExpanded()).toBe(true);
    saveSidebarExpanded(false);
    expect(loadSidebarExpanded()).toBe(false);
    saveSidebarExpanded(true);
    expect(loadSidebarExpanded()).toBe(true);
  });

  it("sem localStorage: segue o padrão sem quebrar", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(loadSidebarExpanded()).toBe(true);
    expect(() => saveSidebarExpanded(false)).not.toThrow();
  });
});
