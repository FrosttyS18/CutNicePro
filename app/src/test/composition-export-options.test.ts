import { expect, it } from "vitest";
import { EXPORT_CODECS, defaultExportOptions, exportOutputSize, parseExportCapabilities, parseExportDestination, validateExportOptions } from "../lib/composition-export";

it("expande presets legados preservando resolução e qualidade", () => {
  expect(defaultExportOptions({ numerator: 30, denominator: 1 }, { resolution: "hd720", quality: "balanced" })).toEqual({ resolution: "hd720", quality: "balanced", codec: "h264", format: "mp4", frameRate: "fps30", bitrateMode: "vbr" });
});

it.each([[24, 1, "fps24"], [25, 1, "fps25"], [30000, 1001, "fps2997"], [30, 1, "fps30"], [50, 1, "fps50"], [60000, 1001, "fps5994"], [60, 1, "fps60"]] as const)("prefere a taxa compatível da edição %i/%i", (numerator, denominator, expected) => {
  expect(defaultExportOptions({ numerator, denominator }).frameRate).toBe(expected);
});

it("novas configurações começam em 1080p, Superior, H264 e MP4", () => {
  expect(defaultExportOptions({ numerator: 30, denominator: 1 })).toEqual({ resolution: "hd1080", quality: "high", codec: "h264", format: "mp4", frameRate: "fps30", bitrateMode: "vbr" });
});

it("taxa 23,976 fora da lista preserva o FPS original por padrão", () => {
  expect(defaultExportOptions({ numerator: 24000, denominator: 1001 }).frameRate).toBe("original");
});

it("reabrir preset legado remove CBR e bitrate que ficaram ocultos", () => {
  expect(defaultExportOptions({ numerator: 30, denominator: 1 }, {
    resolution: "hd1080", quality: "balanced", bitrateMode: "cbr", bitrateKbps: 18000,
  })).toEqual({ resolution: "hd1080", quality: "balanced", codec: "h264", format: "mp4", frameRate: "fps30", bitrateMode: "vbr" });
});

it.each([["hd480", 854, 480], ["hd720", 1280, 720], ["hd1080", 1920, 1080], ["qhd1440", 2560, 1440], ["uhd2160", 3840, 2160], ["uhd4320", 7680, 4320]] as const)("%s corresponde aos pixels efetivamente solicitados", (resolution, width, height) => {
  expect(exportOutputSize({ width: 1920, height: 1080 }, resolution)).toEqual({ width, height });
  expect(exportOutputSize({ width: 1080, height: 1920 }, resolution)).toEqual({ width: height, height: width });
});

it("resolução original mantém compatibilidade e dimensões", () => {
  expect(exportOutputSize({ width: 640, height: 360 }, "original")).toEqual({ width: 640, height: 360 });
});

it("capacidade é validada sem presumir suporte a codec ausente", () => {
  const complete = { codecs: EXPORT_CODECS.map(item => ({ codec: item.value, supported: item.value === "h264", reason: null })) };
  expect(parseExportCapabilities(complete)).toEqual({ codecs: complete.codecs.map(item => ({ codec: item.codec, supported: item.supported })) });
  for (const value of [null, {}, { codecs: [{ codec: "h265", supported: true }] }, { codecs: [{ codec: "h264", supported: "true" }] }, { codecs: [{ codec: "h264", supported: true }, { codec: "h264", supported: false }] }]) expect(() => parseExportCapabilities(value)).toThrow();
});

it("opções incompatíveis e bitrate custom inválido impedem submissão", () => {
  const supported = { codecs: [{ codec: "h264" as const, supported: true }, { codec: "rle" as const, supported: true }] };
  const options = defaultExportOptions({ numerator: 30, denominator: 1 });
  expect(validateExportOptions(options, supported)).toBeNull();
  expect(validateExportOptions({ ...options, codec: "hevcAlpha" }, supported)).toContain("codec");
  expect(validateExportOptions({ ...options, codec: "rle", format: "mp4" }, supported)).toContain("MOV");
  for (const bitrateKbps of [undefined, 0, 99, 100.5, 500001, Number.NaN]) expect(validateExportOptions({ ...options, quality: "custom", bitrateKbps }, supported)).toContain("100");
  expect(validateExportOptions({ ...options, quality: "custom", bitrateKbps: 100, bitrateMode: "cbr" }, supported)).toBeNull();
  expect(validateExportOptions({ ...options, quality: "custom", bitrateKbps: 500000, bitrateMode: "vbr" }, supported)).toBeNull();
});

it("RLE exige MOV, Superior, VBR e ausência de taxa de bits", () => {
  const supported = { codecs: [{ codec: "rle" as const, supported: true }] };
  const options = { ...defaultExportOptions({ numerator: 30, denominator: 1 }), codec: "rle" as const, format: "mov" as const };
  expect(validateExportOptions(options, supported)).toBeNull();
  expect(validateExportOptions({ ...options, bitrateMode: "cbr" }, supported)).not.toBeNull();
  expect(validateExportOptions({ ...options, quality: "balanced" }, supported)).not.toBeNull();
  expect(validateExportOptions({ ...options, bitrateKbps: 8000 }, supported)).not.toBeNull();
});

it("HEVC Alpha suportado continua exigindo MOV", () => {
  const supported = { codecs: [{ codec: "hevcAlpha" as const, supported: true }] };
  const options = { ...defaultExportOptions({ numerator: 30, denominator: 1 }), codec: "hevcAlpha" as const };
  expect(validateExportOptions(options, supported)).toContain("MOV");
  expect(validateExportOptions({ ...options, format: "mov" }, supported)).toBeNull();
});

it("destino da exportação exige existência booleana e nome de arquivo sem caminho", () => {
  expect(parseExportDestination({ exists: true, fileName: "Entrevista final.mp4" })).toEqual({ exists: true, fileName: "Entrevista final.mp4" });
  expect(parseExportDestination({ exists: false, fileName: "Montagem.mov" })).toEqual({ exists: false, fileName: "Montagem.mov" });
  for (const value of [null, {}, { exists: 1, fileName: "Vídeo.mp4" }, { exists: true, fileName: "" },
    { exists: false, fileName: "C:/Vídeo.mp4" }, { exists: true, fileName: "../Vídeo.mp4" }, { exists: true, fileName: "Vídeo\u0000.mp4" },
    { exists: false, fileName: "x".repeat(256) }, { exists: true, fileName: " Vídeo.mp4" }]) expect(() => parseExportDestination(value)).toThrow();
});
