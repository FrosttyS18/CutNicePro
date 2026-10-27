import { expect, it, vi } from "vitest";
import { compositionAssetUsage, removeCompositionAsset, renameCompositionAsset } from "../lib/composition-assets";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { duplicateSelection } from "../lib/composition-insert";
import { insertAssetAtTarget, registerCompositionAsset } from "../lib/composition-asset-drop";
import { applyCaptionTranscript } from "../lib/composition-captions";
import { CompositionSession } from "../lib/composition-session";
import { validateComposition } from "../lib/composition";
import { compositionNameLimit } from "../lib/composition-text";
import { emptyWorkspace } from "../lib/workspace";
import type { Composition, CompositionAsset } from "../lib/composition-types";

function fixture() {
  const workspace = emptyWorkspace();
  workspace.media = { kind: "local", mediaId: "source", name: "Fonte.mp4", duration: 10, width: 1920, height: 1080, videoId: null, url: null };
  workspace.transcript = [{ id: "s", start: 0, end: 8, text: "Uma fala completa." }];
  return compositionFromLegacy(workspace);
}
const image: CompositionAsset = { id: "image", mediaId: "image", name: "Imagem.png", kind: "image", durationUs: 0, width: 600, height: 400, transcript: [] };

it("conta ocorrências da mídia sem contar áudio e CC vinculados novamente", () => {
  const document = fixture();
  expect(compositionAssetUsage(document, "source")).toBe(1);
  const next = duplicateSelection(document, [document.items.find(item => item.kind === "video")!.id]);
  expect(compositionAssetUsage(next, "source")).toBe(2);
  expect(compositionAssetUsage(registerCompositionAsset(next, image), "image")).toBe(0);
});

it("conta uso apenas como áudio destacado para não tratar a mídia como fora da timeline", () => {
  const document = fixture();
  document.items = document.items.filter(item => item.kind === "audio");
  expect(compositionAssetUsage(document, "source")).toBe(1);
});

it("excluir mídia remove todas as ocorrências e vínculos sem ripple nem alterar outros arquivos", () => {
  const source = fixture();
  const copied = duplicateSelection(source, [source.items.find(item => item.kind === "video")!.id]);
  const document = insertAssetAtTarget(copied, image, { frame: 450, trackId: null });
  const original = JSON.stringify(document), kept = document.items.filter(item => item.assetId === "image");
  const removedTracks = document.tracks.filter(track => !track.primary && document.items.some(item => item.assetId === "source" && item.trackId === track.id)).map(track => track.id);
  const next = removeCompositionAsset(document, "source");
  expect(next.assets).toEqual([image]);
  expect(next.items).toEqual(kept);
  expect(next.items[0].startFrame).toBe(450);
  expect(next.tracks.some(track => removedTracks.includes(track.id))).toBe(false);
  expect(next.tracks.some(track => track.primary)).toBe(true);
  expect(validateComposition(next)).toEqual([]);
  expect(JSON.stringify(document)).toBe(original);
});

it("admite montagem sem mídia após excluir o último vídeo", () => {
  const next = removeCompositionAsset(fixture(), "source");
  expect(next.assets).toEqual([]); expect(next.items).toEqual([]);
  expect(next.tracks.filter(track => track.primary)).toHaveLength(1);
  expect(validateComposition(next)).toEqual([]);
});

it("exclui somente o asset escolhido mesmo quando outro referencia o mesmo arquivo original", () => {
  const document = fixture();
  document.assets.push({ ...document.assets[0], id: "alias", name: "Outra referência" });
  const track = { ...document.tracks[0], id: "V2", name: "Camada 2", primary: false };
  document.tracks.push(track);
  const alias = { ...structuredClone(document.items[0]), id: "alias-video", assetId: "alias", groupId: "alias-group", trackId: "V2", followsMain: false };
  document.items.push(alias);
  const next = removeCompositionAsset(document, "source");
  expect(next.assets).toEqual([document.assets[1]]);
  expect(next.items).toEqual([alias]);
  expect(compositionAssetUsage(next, "alias")).toBe(1);
});

it.each(["visual", "audio", "caption"] as const)("excluir recusa qualquer vínculo na faixa bloqueada %s", kind => {
  const document = fixture();
  document.tracks.find(track => track.kind === kind)!.locked = true;
  const original = JSON.stringify(document);
  expect(() => removeCompositionAsset(document, "source")).toThrow("bloqueada");
  expect(JSON.stringify(document)).toBe(original);
});

it("remove mídia sem uso da biblioteca sem alterar itens ou faixas existentes", () => {
  const document = registerCompositionAsset(fixture(), image);
  const next = removeCompositionAsset(document, "image");
  expect(next.items).toEqual(document.items);
  expect(next.tracks).toBe(document.tracks);
  expect(next.assets).toEqual([document.assets[0]]);
});

it("renomeia apenas a identificação de exibição e preserva IDs, conteúdo, links e locks", () => {
  const document = fixture(); document.tracks[0].locked = true;
  const original = JSON.stringify(document);
  const next = renameCompositionAsset(document, "source", "  Entrevista final.mp4  ");
  expect(next.assets[0]).toEqual({ ...document.assets[0], name: "Entrevista final.mp4" });
  expect(next.items).toBe(document.items); expect(next.tracks).toBe(document.tracks);
  expect(next.settings).toBe(document.settings);
  expect(JSON.stringify(document)).toBe(original);
  expect(renameCompositionAsset(next, "source", "Entrevista final.mp4")).toBe(next);
});

it("usa limite de 120 pontos Unicode sem quebrar caracteres multibyte", () => {
  const document = fixture(), name = "𐐀".repeat(compositionNameLimit);
  expect(renameCompositionAsset(document, "source", name).assets[0].name).toBe(name);
  expect(() => renameCompositionAsset(document, "source", `${name}x`)).toThrow("120");
});

it.each(["", "   ", "a\u0000b", "a\nb", "\tNome", "Nome\u007f", "Nome\u0085"])("recusa nome vazio ou com controles %j", name => {
  const document = fixture(), original = JSON.stringify(document);
  expect(() => renameCompositionAsset(document, "source", name)).toThrow();
  expect(JSON.stringify(document)).toBe(original);
});

it("mantém marcação de script como texto literal sem reinterpretar ou executar", () => {
  const name = '<img src=x onerror="alert(1)">';
  const next = renameCompositionAsset(fixture(), "source", name);
  expect(next.assets[0].name).toBe(name);
  expect(JSON.parse(JSON.stringify(next)).assets[0].name).toBe(name);
});

it("mídia removida ou identidade vazia gera erro seguro sem usar seleção antiga", () => {
  const document = fixture(), next = removeCompositionAsset(document, "source");
  for (const id of ["source", "", "<script>alert(1)</script>"]) {
    expect(() => compositionAssetUsage(next, id)).toThrow("Mídia não encontrada");
    expect(() => renameCompositionAsset(next, id, "Nome")).toThrow("Mídia não encontrada");
    expect(() => removeCompositionAsset(next, id)).toThrow("Mídia não encontrada");
  }
  expect(applyCaptionTranscript(next, "source", document.assets[0].transcript)).toBe(next);
});

it("valida a composição atual antes de remover ou renomear mídia", () => {
  const invalid = fixture(); invalid.items[0].assetId = "inexistente";
  expect(() => removeCompositionAsset(invalid, "source")).toThrow("Item sem mídia");
  expect(() => renameCompositionAsset(invalid, "source", "Nome")).toThrow("Item sem mídia");
});

it("renomear e excluir têm histórico reversível e persistem somente ao salvar", async () => {
  const original = fixture();
  const save = vi.fn(async (document: Composition, revision: number) => ({ ...structuredClone(document), revision: revision + 1 }));
  const session = new CompositionSession(original, { save });
  session.apply(renameCompositionAsset(session.document, "source", "Entrevista"));
  session.apply(removeCompositionAsset(session.document, "source"));
  expect(save).not.toHaveBeenCalled();
  session.undo(); expect(session.document.assets[0].name).toBe("Entrevista");
  session.undo(); expect(session.document).toEqual(original);
  session.redo(); session.redo(); expect(session.document.assets).toEqual([]);
  expect(await session.save()).toBe(true); expect(save).toHaveBeenCalledTimes(1);
  const reopened = new CompositionSession(JSON.parse(JSON.stringify(session.savedDocument)), { save });
  expect(reopened.document).toEqual(session.savedDocument);
});
