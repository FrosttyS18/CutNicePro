import { describe, expect, it, vi } from "vitest";
import { EditHistoryCore } from "../lib/edit-history";

interface Doc { value: string }
const serialize = (doc: Doc) => JSON.stringify(doc);

function core(initial: Doc, coalesceMs = 700) {
  return new EditHistoryCore<Doc>(serialize, serialize(initial), coalesceMs);
}

describe("EditHistoryCore (núcleo do desfazer/refazer)", () => {
  it("desfaz e refaz uma edição restaurando o snapshot", () => {
    const h = core({ value: "a" });
    h.commit({ value: "b" }, "grupo");
    expect(h.canUndo).toBe(true);
    const restaurados: Doc[] = [];
    h.restore((doc) => restaurados.push(doc));
    expect(h.undo({ value: "b" })).toBe(true);
    expect(restaurados).toEqual([{ value: "a" }]);
    expect(h.canRedo).toBe(true);
    expect(h.redo({ value: "a" })).toBe(true);
    expect(restaurados).toEqual([{ value: "a" }, { value: "b" }]);
  });

  it("agrupa edições contínuas do mesmo grupo numa entrada só", () => {
    const h = core({ value: "a" });
    h.commit({ value: "ab" }, "tecla");
    h.commit({ value: "abc" }, "tecla");
    h.commit({ value: "abcd" }, "tecla");
    const restaurados: Doc[] = [];
    h.restore((doc) => restaurados.push(doc));
    h.undo({ value: "abcd" });
    expect(restaurados).toEqual([{ value: "a" }]);
    expect(h.canUndo).toBe(false);
  });

  it("grupo vazio nunca coalesce e refazer é limpo por nova edição", () => {
    const h = core({ value: "a" });
    h.commit({ value: "b" }, "");
    h.commit({ value: "c" }, "");
    const restaurados: Doc[] = [];
    h.restore((doc) => restaurados.push(doc));
    h.undo({ value: "c" });
    expect(restaurados).toEqual([{ value: "b" }]);
    h.commit({ value: "z" }, "");
    expect(h.canRedo).toBe(false);
  });

  it("commit sem mudança não cria entradas", () => {
    const h = core({ value: "a" });
    h.commit({ value: "a" }, "x");
    h.commit({ value: "a" }, "x");
    expect(h.canUndo).toBe(false);
  });

  it("snapshot corrompido é ignorado sem pânico", () => {
    const h = core({ value: "a" });
    h.commit({ value: "b" }, "");
    const hack = h as unknown as { past: string[] };
    hack.past = ["{{{"];
    expect(h.undo({ value: "b" })).toBe(false);
  });
});

describe("autosave serializado do VideoEditor (fila)", () => {
  it("chamada durante gravação enfileira; a mais recente vence", async () => {
    const save = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return true;
    });
    const busy = { value: false };
    const pending = { value: false };
    const run = async () => {
      if (busy.value) { pending.value = true; return; }
      busy.value = true;
      try {
        for (;;) {
          pending.value = false;
          const ok = await save();
          if (!ok) return;
          if (!pending.value) break;
        }
      } finally { busy.value = false; }
    };
    const first = run();
    const second = run();
    await Promise.all([first, second]);
    expect(save).toHaveBeenCalledTimes(2);
  });
});
