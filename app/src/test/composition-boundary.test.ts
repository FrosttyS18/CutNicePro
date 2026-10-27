import { describe, expect, it } from "vitest";
import { parseComposition } from "../lib/composition-boundary";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import { validateComposition } from "../lib/composition";

describe("contrato de montagem na fronteira IPC", () => {
  it("aceita o contrato versionado e preserva os ajustes existentes", () => {
    const document = compositionFromLegacy(emptyWorkspace());
    expect(parseComposition(JSON.parse(JSON.stringify(document)))).toEqual(document);
  });
  it.each([null, {}, { version: 2 }, { version: 1, items: "erro" }])("recusa documento incompleto: %j", value => {
    expect(() => parseComposition(value)).toThrow(/montagem/i);
  });
  it("recusa dados de faixa, mídia e configurações com tipos incorretos", () => {
    const document = compositionFromLegacy(emptyWorkspace());
    expect(() => parseComposition({ ...document, tracks: [{ ...document.tracks[0], locked: "false" }] })).toThrow();
    expect(() => parseComposition({ ...document, settings: { ...document.settings, volume: 200 } })).toThrow();
    expect(() => parseComposition({ ...document, assets: [null] })).toThrow();
    expect(() => parseComposition({ ...document, fps: { numerator: Infinity, denominator: 1 } })).toThrow();
  });

  it("preserva ausência, lista vazia e metadados válidos de marcadores e faixas", () => {
    const document = compositionFromLegacy(emptyWorkspace());
    expect(parseComposition(document)).not.toHaveProperty("markers");
    expect(parseComposition({ ...document, markers: [] })).toHaveProperty("markers", []);
    const decorated = { ...document, markers: [{ id: "marker", name: "Início", frame: 900, color: "#00C2BE" }],
      tracks: document.tracks.map(track => ({ ...track, color: "#A078E8" })) };
    expect(parseComposition(JSON.parse(JSON.stringify(decorated)))).toEqual(decorated);
    expect(parseComposition({ ...document, markers: [{ id: "unicode", name: "𐐀".repeat(120), frame: 0, color: "#00c2be" }] })).toBeTruthy();
  });

  it.each([
    null, {}, [null], [{ id: "marker", name: "", frame: 0, color: "#00C2BE" }],
    [{ id: "marker", name: "  ", frame: 0, color: "#00C2BE" }],
    [{ id: "marker", name: "𐐀".repeat(121), frame: 0, color: "#00C2BE" }],
    [{ id: "", name: "Nome", frame: 0, color: "#00C2BE" }],
    [{ id: "marker", name: "Nome", frame: -1, color: "#00C2BE" }],
    [{ id: "marker", name: "Nome", frame: 1.5, color: "#00C2BE" }],
    [{ id: "marker", name: "Nome", frame: Number.MAX_SAFE_INTEGER + 1, color: "#00C2BE" }],
    [{ id: "marker", name: "Nome", frame: 0, color: "teal" }],
    [{ id: "marker", name: "Nome", frame: 0, color: "#fff" }],
    [{ id: "marker", name: "Nome", frame: 0, color: "#000000;display:none" }],
    [{ id: "same", name: "Um", frame: 0, color: "#00C2BE" }, { id: "same", name: "Dois", frame: 1, color: "#00C2BE" }],
    [{ id: "one", name: "Um", frame: 0, color: "#00C2BE" }, { id: "two", name: "Dois", frame: 0, color: "#00C2BE" }],
  ])("recusa marcadores inválidos na fronteira: %j", markers => {
    expect(() => parseComposition({ ...compositionFromLegacy(emptyWorkspace()), markers })).toThrow();
  });

  it.each([null, "", "red", "#fff", "#12345678", 10])("recusa cor inválida de faixa: %j", color => {
    const document = compositionFromLegacy(emptyWorkspace());
    expect(() => parseComposition({ ...document, tracks: document.tracks.map(track => ({ ...track, color })) })).toThrow();
  });

  it.each(["", " \t\n ", "A".repeat(121), "𐐀".repeat(121)])("recusa nome de faixa inválido na leitura e na edição: %j", name => {
    const document = compositionFromLegacy(emptyWorkspace());
    const changed = { ...document, tracks: document.tracks.map(track => ({ ...track, name })) };
    expect(() => parseComposition(changed)).toThrow();
    expect(validateComposition(changed).length).toBeGreaterThan(0);
  });

  it.each(["A".repeat(120), "𐐀".repeat(120), "<script>alert(1)</script>", "<img src=x onerror=alert(1)>"])("preserva nome literal de faixa e marcador sem interpretar: %s", name => {
    const document = compositionFromLegacy(emptyWorkspace());
    const changed = { ...document, tracks: document.tracks.map(track => ({ ...track, name })),
      markers: [{ id: "marker", name, frame: 0, color: "#00C2BE" }] };
    expect(parseComposition(JSON.parse(JSON.stringify(changed)))).toEqual(changed);
  });

  it("não aplica o limite de nomes a arquivos de mídia", () => {
    const document = compositionFromLegacy(emptyWorkspace());
    const asset = { id: "asset", mediaId: "media", name: "a".repeat(250), kind: "video", durationUs: 1, width: 1, height: 1, transcript: [] };
    expect(parseComposition({ ...document, assets: [asset] }).assets[0].name).toBe(asset.name);
  });
});
