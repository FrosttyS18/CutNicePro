import { describe, expect, it } from "vitest";
import { compositionDuration, validateComposition } from "../lib/composition";
import { parseComposition } from "../lib/composition-boundary";
import { removeRange } from "../lib/composition-edit";
import { duplicateSelection, extractComposition, insertComposition, overlayComposition } from "../lib/composition-insert";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { addCompositionMarker, markerColors, removeCompositionMarker, updateCompositionMarker } from "../lib/composition-markers";
import { CompositionSession } from "../lib/composition-session";
import type { Composition } from "../lib/composition-types";
import { emptyWorkspace } from "../lib/workspace";

function fixture() {
  const workspace = emptyWorkspace();
  workspace.media = { kind: "local", mediaId: "source", name: "video.mp4", duration: 10, width: 1920, height: 1080, videoId: null, url: null };
  return compositionFromLegacy(workspace);
}

describe("marcadores da montagem", () => {
  it("cria marcador imutável com nome, identidade e cor explícitos sem alterar mídia ou duração", () => {
    const document = fixture();
    const initial = structuredClone(document);
    const next = addCompositionMarker(document, 30);
    expect(next.markers).toHaveLength(1);
    expect(next.markers?.[0]).toEqual({ id: expect.any(String), name: "Marcador", frame: 30, color: "#00C2BE" });
    expect(next.markers?.[0].id).not.toBe("");
    expect(next.items).toBe(document.items);
    expect(compositionDuration(next)).toBe(compositionDuration(document));
    expect(document).toEqual(initial);
    expect(document).not.toHaveProperty("markers");
    expect(markerColors).toHaveLength(5);
    expect(markerColors.every(color => /^#[\da-f]{6}$/i.test(color))).toBe(true);
  });

  it("mantém um marcador por frame e identidades distintas entre frames", () => {
    const first = addCompositionMarker(fixture(), 0);
    expect(addCompositionMarker(first, 0)).toBe(first);
    const next = addCompositionMarker(first, 1);
    expect(new Set(next.markers?.map(marker => marker.id)).size).toBe(2);
    const marker = next.markers![1];
    expect(() => updateCompositionMarker(next, marker.id, { frame: 0 })).toThrow(/marcador|quadro/i);
  });

  it("altera nome, tempo e cor sem perder identidade e remove somente o marcador escolhido", () => {
    const original = addCompositionMarker(addCompositionMarker(fixture(), 30), 90);
    const id = original.markers![0].id;
    const changed = updateCompositionMarker(original, id, { name: "  Entrada  ", frame: 45, color: "#A078E8" });
    expect(changed.markers?.[0]).toEqual({ id, name: "Entrada", frame: 45, color: "#A078E8" });
    expect(original.markers?.[0].name).toBe("Marcador");
    expect(updateCompositionMarker(changed, id, { name: "Entrada", frame: 45, color: "#A078E8" })).toBe(changed);
    expect(updateCompositionMarker(changed, "missing", { name: "Outro" })).toBe(changed);
    expect(removeCompositionMarker(changed, "missing")).toBe(changed);
    expect(removeCompositionMarker(changed, id).markers).toEqual([changed.markers![1]]);
    expect(removeCompositionMarker(addCompositionMarker(fixture(), 30), "missing").markers).toHaveLength(1);
    const only = addCompositionMarker(fixture(), 30);
    expect(removeCompositionMarker(only, only.markers![0].id).markers).toEqual([]);
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("recusa criação e edição em frame inválido: %s", frame => {
    const document = addCompositionMarker(fixture(), 0);
    expect(() => addCompositionMarker(document, frame)).toThrow();
    expect(() => updateCompositionMarker(document, document.markers![0].id, { frame })).toThrow();
  });

  it.each([{ name: " " }, { name: "𐐀".repeat(121) }, { color: "red" }, { color: "#fff" }])("recusa metadados inválidos: %j", patch => {
    const document = addCompositionMarker(fixture(), 0);
    expect(() => updateCompositionMarker(document, document.markers![0].id, patch)).toThrow();
  });

  it("permite nomes com tags como texto literal e mantém o conteúdo no salvamento", () => {
    const document = addCompositionMarker(fixture(), 0);
    const name = '<script>alert("literal")</script>';
    const changed = updateCompositionMarker(document, document.markers![0].id, { name });
    expect(parseComposition(JSON.parse(JSON.stringify(changed))).markers?.[0].name).toBe(name);
  });

  it("conserva marcadores absolutos depois do fim após remoção e não estende duração", () => {
    const document = addCompositionMarker(fixture(), Number.MAX_SAFE_INTEGER);
    const shortened = removeRange(document, 150, 300);
    expect(compositionDuration(shortened)).toBe(150);
    expect(shortened.markers).toEqual(document.markers);
    expect(validateComposition(shortened)).toEqual([]);
    expect(parseComposition(JSON.parse(JSON.stringify(shortened)))).toEqual(shortened);
  });

  it("extrai só os marcadores dentro do intervalo e rebasa os frames para o novo clipe", () => {
    let document = fixture();
    for (const frame of [29, 30, 60, 90]) document = addCompositionMarker(document, frame);
    const extracted = extractComposition(document, 30, 90);
    expect(extracted.markers).toEqual(document.markers!.slice(1, 3).map(marker => ({ ...marker, frame: marker.frame - 30 })));
    expect(document.markers?.map(marker => marker.frame)).toEqual([29, 30, 60, 90]);
    expect(extractComposition(fixture(), 30, 90)).not.toHaveProperty("markers");
    expect(extractComposition({ ...fixture(), markers: [] }, 30, 90)).toHaveProperty("markers", []);
  });

  it("colar ou duplicar mídia preserva marcadores do destino sem copiar os do fragmento", () => {
    const document = addCompositionMarker(fixture(), 30);
    const fragment = addCompositionMarker(extractComposition(fixture(), 0, 30), 10);
    expect(insertComposition(document, fragment, 300).markers).toEqual(document.markers);
    expect(overlayComposition(document, fragment, 60).markers).toEqual(document.markers);
    expect(duplicateSelection(document, [document.items[0].id]).markers).toEqual(document.markers);
  });

  it("desfaz, refaz, salva, reabre e recupera marcadores sem gravação implícita", async () => {
    let disk = JSON.stringify(fixture());
    const persistence = { save: async (next: Composition, revision: number) => {
      disk = JSON.stringify({ ...next, revision: revision + 1 });
      return parseComposition(JSON.parse(disk));
    } };
    const session = new CompositionSession(parseComposition(JSON.parse(disk)), persistence);
    session.apply(addCompositionMarker(session.document, 30));
    expect(parseComposition(JSON.parse(disk))).not.toHaveProperty("markers");
    const id = session.document.markers![0].id;
    session.apply(updateCompositionMarker(session.document, id, { name: "Entrada", color: "#A078E8", frame: 45 }));
    session.undo();
    expect(session.document.markers?.[0].name).toBe("Marcador");
    session.redo();
    expect(session.document.markers?.[0].name).toBe("Entrada");
    expect(await session.save()).toBe(true);
    expect(session.dirty).toBe(false);
    const reopened = new CompositionSession(parseComposition(JSON.parse(disk)), persistence);
    expect(reopened.document.markers).toEqual(session.document.markers);
    reopened.restoreRecovery(removeCompositionMarker(reopened.document, id), reopened.document.revision);
    expect(reopened.dirty).toBe(true);
    expect(parseComposition(JSON.parse(disk)).markers).toHaveLength(1);
    reopened.undo();
    expect(reopened.dirty).toBe(false);
    reopened.redo();
    expect(await reopened.save()).toBe(true);
    expect(parseComposition(JSON.parse(disk)).markers).toEqual([]);
  });
});
