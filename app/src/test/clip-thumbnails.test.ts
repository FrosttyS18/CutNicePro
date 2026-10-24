import { describe, expect, it, vi } from "vitest";
import { createThumbnailLoader } from "../services/clip-thumbnails";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const frame = { bytes: [255, 216, 255, 217], width: 1920, height: 1080 };

describe("miniaturas leves, cacheadas e com concorrência limitada", () => {
  it("27 solicitações nunca executam mais de uma leitura simultânea", async () => {
    let active = 0;
    let maximum = 0;
    const read = vi.fn(async () => {
      active++;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active--;
      return frame;
    });
    const load = createThumbnailLoader(read);
    const values = await Promise.all(Array.from({ length: 27 }, (_, i) => load("video", i)));
    expect(maximum).toBe(1);
    expect(read).toHaveBeenCalledTimes(27);
    expect(values.every(value => value.src.startsWith("data:image/jpeg;base64,"))).toBe(true);
  });
  it("compartilha solicitações em andamento e reutiliza imagem ao voltar no scroll", async () => {
    const read = vi.fn(async () => frame);
    const load = createThumbnailLoader(read);
    const first = load("media", 1);
    expect(load("media", 1)).toBe(first);
    expect(await load("media", 1)).toBe(await first);
    expect(await load("media", 1)).toBe(await first);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("mantém cache limitado e remove a imagem menos recentemente usada", async () => {
    const read = vi.fn(async () => frame);
    const load = createThumbnailLoader(read, 2);
    await load("a", 1); await load("b", 1); await load("a", 1);
    await load("c", 1); await load("b", 1);
    expect(read).toHaveBeenCalledTimes(4);
  });
  it("falha isolada não trava a fila e pode ser tentada novamente", async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error("Mídia ausente")).mockResolvedValue(frame);
    const load = createThumbnailLoader(read);
    await expect(load("a", 1)).rejects.toThrow("Mídia ausente");
    await expect(load("b", 1)).resolves.toMatchObject({ width: 1920 });
    await expect(load("a", 1)).resolves.toMatchObject({ height: 1080 });
  });
  it("rejeita posições e respostas inválidas sem guardar uma falha no cache", async () => {
    const read = vi.fn().mockResolvedValueOnce({ ...frame, bytes: [999] }).mockResolvedValue(frame);
    const load = createThumbnailLoader(read);
    await expect(load("a", -1)).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
    await expect(load("a", 1)).rejects.toThrow("Miniatura inválida");
    await expect(load("a", 1)).resolves.toMatchObject({ width: 1920 });
    expect(read).toHaveBeenCalledTimes(2);
  });
});
