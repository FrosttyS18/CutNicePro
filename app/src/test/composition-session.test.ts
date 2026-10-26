import { describe, expect, it } from "vitest";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { CompositionSession, type CompositionPersistence } from "../lib/composition-session";
import type { Composition } from "../lib/composition-types";

function fixture() { return compositionFromLegacy(emptyWorkspace()); }
function change(document: Composition, text: string): Composition {
  return { ...document, settings: { ...document.settings, text } };
}
function adapter(): CompositionPersistence {
  return { save: async (document, revision) => ({ ...structuredClone(document), revision: revision + 1 }) };
}

describe("sessão com salvamento explícito", () => {
  it("mantém edição no rascunho e só confirma após salvar", async () => {
    const session = new CompositionSession(fixture(), adapter());
    session.apply(change(session.document, "Novo texto"));
    expect(session.dirty).toBe(true);
    expect(session.savedDocument.settings.text).toBe("");
    expect(await session.save()).toBe(true);
    expect(session.dirty).toBe(false);
    expect(session.savedDocument.settings.text).toBe("Novo texto");
    expect(session.document.revision).toBe(1);
  });

  it.each([new Error("Disco cheio"), "Disco cheio"])("salvar falhando mantém rascunho e versão salva (%s)", async failure => {
    const session = new CompositionSession(fixture(), { save: async () => { throw failure; } });
    session.apply(change(session.document, "Ainda não salvo"));
    expect(await session.save()).toBe(false);
    expect(session.error).toBe("Disco cheio");
    expect(session.dirty).toBe(true);
    expect(session.savedDocument.settings.text).toBe("");
  });

  it("edição durante uma gravação não é perdida nem salva implicitamente", async () => {
    let finish!: (document: Composition) => void;
    const persistence: CompositionPersistence = { save: () => new Promise(resolve => { finish = resolve; }) };
    const session = new CompositionSession(fixture(), persistence);
    session.apply(change(session.document, "Primeira edição"));
    const saving = session.save();
    session.apply(change(session.document, "Edição mais nova"));
    finish({ ...change(fixture(), "Primeira edição"), revision: 1 });
    expect(await saving).toBe(true);
    expect(session.savedDocument.settings.text).toBe("Primeira edição");
    expect(session.document.settings.text).toBe("Edição mais nova");
    expect(session.dirty).toBe(true);
  });

  it("desfazer e refazer preservam o ponto salvo e descartam a ramificação antiga", async () => {
    const session = new CompositionSession(fixture(), adapter());
    session.apply(change(session.document, "Um"));
    await session.save();
    session.apply(change(session.document, "Dois"));
    session.undo();
    expect(session.dirty).toBe(false);
    session.redo();
    expect(session.document.settings.text).toBe("Dois");
    session.undo();
    session.apply(change(session.document, "Três"));
    expect(session.canRedo).toBe(false);
  });

  it("restaurar recuperação não confirma a edição e recusa base desatualizada", () => {
    const session = new CompositionSession(fixture(), adapter());
    session.restoreRecovery(change(fixture(), "Recuperado"), 0);
    expect(session.dirty).toBe(true);
    expect(session.savedDocument.settings.text).toBe("");
    expect(() => session.restoreRecovery(fixture(), 3)).toThrow(/versão/);
    session.discard();
    expect(session.document.settings.text).toBe("");
    expect(session.dirty).toBe(false);
  });
});
