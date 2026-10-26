import { describe, expect, it } from "vitest";
import { formatCompositionTimecode, parseCompositionRange } from "../lib/composition-timecode";
import { fpsFromRate } from "../lib/composition-time";

describe("tempo legível do intervalo da montagem", () => {
  it.each([24000 / 1001, 30, 60])("preserva os frames selecionados em %s fps", rate => {
    const fps = fpsFromRate(rate);
    for (const start of [1, 59, 14359, 86158]) {
      const end = start + 137;
      expect(parseCompositionRange(formatCompositionTimecode(start, fps), formatCompositionTimecode(end, fps), end, fps)).toEqual({ start, end });
    }
  });

  it("formata milissegundos e horas sem segundos fracionários soltos", () => {
    const fps = fpsFromRate(30);
    expect(formatCompositionTimecode(0, fps)).toBe("00:00.000");
    expect(formatCompositionTimecode(43_079, fps)).toBe("23:55.967");
    expect(formatCompositionTimecode(108_001, fps)).toBe("01:00:00.033");
    expect(parseCompositionRange("00:23:55.968", "24:00.000", 45_000, fps)).toEqual({ start: 43_079, end: 43_200 });
  });

  it.each(["", "1435.967866", "-00:01.000", "00:60.000", "01:60:00.000", "00:01.0001", "00:01.000x", "00:00:00:01"])("rejeita formato inválido %s sem truncar", value => {
    expect(() => parseCompositionRange(value, "00:10.000", 300, fpsFromRate(30))).toThrow(/formato/i);
  });

  it.each([["00:02.000", "00:01.000"], ["00:01.000", "00:01.000"], ["00:00.001", "00:00.002"], ["00:00.000", "00:10.001"]])("rejeita ordem ou limite %s – %s", (start, end) => {
    expect(() => parseCompositionRange(start, end, 300, fpsFromRate(30))).toThrow();
  });
});
