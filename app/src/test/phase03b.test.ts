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
import { makeOrbitParams, mulberry32, orbitFrame } from "../components/OrbitingMediaHero";
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

describe("fontes do OrbitingMediaHero (contrato 03B.2)", () => {
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

describe("orbitFrame (motor puro 03B.3 — órbita elíptica relativa ao hero)", () => {
  const p = makeOrbitParams(mulberry32(20261018), 1)[0];

  it("movimento contínuo: posição muda com o tempo", () => {
    const a = orbitFrame(0, p, 1000, 800);
    const b = orbitFrame(2000, p, 1000, 800);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(10);
  });

  it("centro da órbita = centro exato do container (qualquer aspecto)", () => {
    // ângulos opostos com a mesma profundidade são simétricos em torno do centro
    const e = orbitFrame(0, { ...p, rAmp: 0, a0: 0 }, 1000, 800);
    const w = orbitFrame(0, { ...p, rAmp: 0, a0: Math.PI }, 1000, 800);
    expect((e.x + w.x) / 2).toBeCloseTo(500, 1);
    const n = orbitFrame(0, { ...p, rAmp: 0, a0: Math.PI / 2 }, 1000, 800);
    const s = orbitFrame(0, { ...p, rAmp: 0, a0: -Math.PI / 2 }, 1000, 800);
    expect((n.y + s.y) / 2).toBeCloseTo(400, 1);
  });

  it("raios proporcionais ao container (sem min(w,h)): elipse acompanha o aspecto", () => {
    const far = (w: number, h: number) =>
      orbitFrame(0, { ...p, rMid: 1, rAmp: 0, a0: 0 }, w, h);
    const wide = far(1600, 400);
    expect(wide.x).toBeGreaterThan(1400); // usa a LARGURA, não o min
    const tall = orbitFrame(0, { ...p, rMid: 1, rAmp: 0, a0: Math.PI / 2 }, 600, 1200);
    expect(tall.y).toBeLessThan(200); // usa a ALTURA no eixo vertical
  });

  it("profundidade: u maior ⇒ escala/opacidade/z maiores; interior discreto", () => {
    const near = orbitFrame(0, { ...p, rMid: 0.06, rAmp: 0 }, 1000, 800);
    const far = orbitFrame(0, { ...p, rMid: 0.95, rAmp: 0 }, 1000, 800);
    expect(far.scale).toBeGreaterThan(near.scale);
    expect(far.opacity).toBeGreaterThan(near.opacity);
    expect(far.z).toBeGreaterThan(near.z);
    expect(near.opacity).toBeLessThan(0.2);
    expect(far.opacity).toBeGreaterThan(0.9);
  });

  it("cartão dimensionado como fração moderada da largura do hero", () => {
    const f1 = orbitFrame(0, p, 1000, 800);
    const f2 = orbitFrame(0, p, 2000, 800);
    expect(f2.w).toBeCloseTo(f1.w * 2, 0);
    expect(f2.w).toBeLessThan(2000 * 0.13);
  });

  it("composição determinística: mesma seed ⇒ mesmos parâmetros", () => {
    const a = makeOrbitParams(mulberry32(7), 5);
    const b = makeOrbitParams(mulberry32(7), 5);
    expect(a).toEqual(b);
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
