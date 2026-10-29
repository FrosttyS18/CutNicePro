import { beforeEach, describe, expect, it, vi } from "vitest";
import * as ipc from "../lib/ipc";

const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: native.invoke }));
const codecs = ["h264", "hevc", "hevcAlpha", "hevc422", "av1", "rle"] as const;
beforeEach(() => native.invoke.mockReset());

describe("capacidades de exportação pela fronteira nativa", () => {
  it("lê codecs comprovados e normaliza razão opcional sem exigir conteúdo do projeto", async () => {
    native.invoke.mockResolvedValue({ codecs: codecs.map(codec => ({ codec, supported: codec !== "hevcAlpha", reason: null })) });
    const result = await ipc.getEditorExportCapabilities();
    expect(native.invoke).toHaveBeenCalledWith("get_editor_export_capabilities");
    expect(result.codecs).toHaveLength(6);
    expect(result.codecs.find(item => item.codec === "hevcAlpha")?.supported).toBe(false);
    expect(result.codecs[0].reason).toBeUndefined();
  });

  it.each([null, {}, { codecs: [] }, { codecs: codecs.map(codec => ({ codec, supported: "yes" })) }])("não aceita resposta incompatível como suporte ao codec", async payload => {
    native.invoke.mockResolvedValue(payload);
    await expect(ipc.getEditorExportCapabilities()).rejects.toThrow();
  });
});

describe("destino informado no modal de exportação", () => {
  it("consulta o destino antes do render sem abrir janela de salvar", async () => {
    const options = { resolution: "hd1080", quality: "high", format: "mov" } as const;
    native.invoke.mockResolvedValue({ exists: true, fileName: "Meu vídeo.mov" });
    expect(await ipc.getEditorExportDestination("C:/exports", "Meu vídeo", options)).toEqual({ exists: true, fileName: "Meu vídeo.mov" });
    expect(native.invoke).toHaveBeenCalledWith("get_editor_export_destination", { directory: "C:/exports", fileName: "Meu vídeo", options });
  });

  it.each([null, { exists: "yes", fileName: "Vídeo.mp4" }, { exists: false, fileName: "../fora.mp4" }])("rejeita resposta inválida da consulta de destino", async value => {
    native.invoke.mockResolvedValue(value);
    await expect(ipc.getEditorExportDestination("C:/exports", "Vídeo", { resolution: "hd1080", quality: "high" })).rejects.toThrow();
  });
});
