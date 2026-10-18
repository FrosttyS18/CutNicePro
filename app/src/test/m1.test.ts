import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime } from "../lib/format";
import {
  PROJECT_NAME_MAX,
  sortProjects,
  validateProjectName,
} from "../lib/projects";
import type { ProjectMeta } from "../lib/types";

describe("validateProjectName", () => {
  it("aceita nome válido", () => {
    expect(validateProjectName("  Meu projeto  ")).toEqual({
      ok: true,
      error: null,
    });
  });

  it("rejeita vazio e só espaços", () => {
    expect(validateProjectName("").ok).toBe(false);
    expect(validateProjectName("   ").ok).toBe(false);
  });

  it("rejeita acima do máximo", () => {
    const long = "a".repeat(PROJECT_NAME_MAX + 1);
    const res = validateProjectName(long);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("80");
  });

  it("aceita exatamente o máximo", () => {
    expect(validateProjectName("a".repeat(PROJECT_NAME_MAX)).ok).toBe(true);
  });
});

function proj(p: Partial<ProjectMeta>): ProjectMeta {
  return {
    id: p.id ?? "x",
    name: p.name ?? "n",
    created_at_ms: p.created_at_ms ?? 0,
    updated_at_ms: p.updated_at_ms ?? 0,
    last_opened_at_ms: p.last_opened_at_ms ?? null,
  };
}

describe("sortProjects", () => {
  it("última abertura mais recente primeiro", () => {
    const list = [
      proj({ id: "old", created_at_ms: 100, last_opened_at_ms: 200 }),
      proj({ id: "new", created_at_ms: 300, last_opened_at_ms: 900 }),
      proj({ id: "mid", created_at_ms: 500, last_opened_at_ms: 400 }),
    ];
    expect(sortProjects(list).map((p) => p.id)).toEqual(["new", "mid", "old"]);
  });

  it("nunca abertos: por criação (mais recente primeiro)", () => {
    const list = [
      proj({ id: "a", created_at_ms: 100 }),
      proj({ id: "b", created_at_ms: 999 }),
    ];
    expect(sortProjects(list).map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("não muta o array original", () => {
    const list = [
      proj({ id: "a", created_at_ms: 1 }),
      proj({ id: "b", created_at_ms: 2 }),
    ];
    const before = list.map((p) => p.id).join();
    sortProjects(list);
    expect(list.map((p) => p.id).join()).toBe(before);
  });
});

describe("format", () => {
  it("formatDate produz string curta não vazia", () => {
    const out = formatDate(Date.UTC(2026, 9, 18));
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(4);
  });

  it("formatDateTime inclui hora", () => {
    const out = formatDateTime(Date.UTC(2026, 9, 18, 10, 30));
    expect(out.length).toBeGreaterThan(formatDate(Date.UTC(2026, 9, 18)).length);
  });
});
