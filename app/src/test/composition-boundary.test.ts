import { describe, expect, it } from "vitest";
import { parseComposition } from "../lib/composition-boundary";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";

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
});
