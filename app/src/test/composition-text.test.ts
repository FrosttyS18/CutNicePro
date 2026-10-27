import { describe, expect, it } from "vitest";
import { compositionNameLimit, isCompositionName } from "../lib/composition-text";

describe("nomes de faixas e marcadores", () => {
  it("usa o limite comum de 120 pontos Unicode", () => {
    expect(compositionNameLimit).toBe(120);
    expect(isCompositionName("A".repeat(120))).toBe(true);
    expect(isCompositionName("𐐀".repeat(120))).toBe(true);
    expect(isCompositionName("A".repeat(121))).toBe(false);
    expect(isCompositionName("𐐀".repeat(121))).toBe(false);
  });

  it.each([undefined, null, 12, {}, [], "", " \t\n "])("recusa nome ausente ou vazio: %j", value => {
    expect(isCompositionName(value)).toBe(false);
  });

  it.each(["Principal", "Áudio da fonte", "Legendas", "<script>alert(1)</script>", "<img src=x onerror=alert(1)>"])("mantém texto literal válido: %s", value => {
    expect(isCompositionName(value)).toBe(true);
    expect(JSON.parse(JSON.stringify(value))).toBe(value);
  });
});
