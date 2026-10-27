import { afterEach, expect, it, vi } from "vitest";
import { revealEditorMedia } from "../lib/ipc";

const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: native.invoke }));
afterEach(() => vi.resetAllMocks());

it("solicita abrir somente a mídia vinculada ao projeto sem expor caminhos", async () => {
  native.invoke.mockResolvedValue(null);
  await revealEditorMedia("project", "media");
  expect(native.invoke).toHaveBeenCalledOnce();
  expect(native.invoke).toHaveBeenCalledWith("reveal_editor_media", { projectId: "project", mediaId: "media" });
});

it("preserva o erro nativo de mídia ausente ou alterada", async () => {
  native.invoke.mockRejectedValue(new Error("O arquivo original foi alterado."));
  await expect(revealEditorMedia("project", "media")).rejects.toThrow("O arquivo original foi alterado.");
});
