import { describe, expect, it } from "vitest";
import { importedProjectDisplayName, mediaFileName, mediaProjectName } from "../lib/media-name";

describe("nomes de mídia importada", () => {
  it.each([
    [String.raw`C:\Users\adcka\Downloads\Podcast — Ep. 12.MP4`, "Podcast — Ep. 12.MP4"],
    [String.raw`\\servidor\vídeos\aula.webm`, "aula.webm"],
    ["/home/videos/aula.mov", "aula.mov"],
    ["aula.mp4", "aula.mp4"],
  ])("extrai somente o arquivo de %s", (path, expected) => expect(mediaFileName(path)).toBe(expected));
  it("remove só a extensão do arquivo e preserva os pontos do título", () => {
    expect(mediaProjectName(String.raw`C:\pasta.com.ponto\Aula 1.2.mp4`)).toBe("Aula 1.2");
  });
  it("usa título alternativo e respeita o limite de caracteres", () => {
    expect(mediaProjectName("")).toBe("Novo projeto");
    expect(Array.from(mediaProjectName("a".repeat(90) + ".mp4"))).toHaveLength(80);
  });
  it("corrige a exibição legada usando o nome original completo", () => {
    expect(importedProjectDisplayName(String.raw`C:\Users\adcka\Downloads\nome truncado`, "Vídeo original.mp4")).toBe("Vídeo original");
  });
  it("preserva títulos escolhidos pelo usuário", () => {
    expect(importedProjectDisplayName("Meu projeto editado", "original.mp4")).toBe("Meu projeto editado");
  });
});
