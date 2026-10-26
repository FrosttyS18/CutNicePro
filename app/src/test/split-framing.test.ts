import { beforeEach, describe, expect, it, vi } from "vitest";
import { suggestSplitFraming } from "../services/split-framing";
import { defaultSplitScreen } from "../lib/split-screen";

const { suggestSplitScreen } = vi.hoisted(() => ({ suggestSplitScreen: vi.fn() }));
vi.mock("../lib/ipc", () => ({ suggestSplitScreen }));
const source = { projectId: "p", mediaId: "m", start: 0, end: 20 };

beforeEach(() => suggestSplitScreen.mockReset());

describe("fronteira da sugestão local de tela dividida", () => {
  it.each([
    { ...source, projectId: " " }, { ...source, mediaId: "" }, { ...source, start: -1 },
    { ...source, start: NaN }, { ...source, end: Infinity }, { ...source, end: 0 },
  ])("rejeita fonte ou intervalo inválido antes do IPC: %j", async invalid => {
    await expect(suggestSplitFraming(invalid)).rejects.toThrow("trecho válido");
    expect(suggestSplitScreen).not.toHaveBeenCalled();
  });

  it.each([
    null, "found", [], {}, { status: "found", layout: defaultSplitScreen(), message: "" },
    { status: "found", message: "Pronto" }, { status: "unknown", message: "Pronto" },
    { status: "manual", layout: { version: 2 }, message: "Manual" },
    { status: "found", layout: { ...defaultSplitScreen(), bottom: { x: 50, y: 50, zoom: 4 } }, message: "Pronto" },
  ])("rejeita payload incompatível: %j", async response => {
    suggestSplitScreen.mockResolvedValue(response);
    await expect(suggestSplitFraming(source)).rejects.toThrow("Resposta de enquadramento inválida");
  });

  it("aceita dois painéis validados e uma recusa manual explicada", async () => {
    const found = { status: "found", layout: { ...defaultSplitScreen(), faceValidated: true }, message: "Duas pessoas localizadas." };
    suggestSplitScreen.mockResolvedValueOnce(found).mockResolvedValueOnce({ status: "manual", message: "Ajuste cada painel." });
    await expect(suggestSplitFraming(source)).resolves.toEqual(found);
    await expect(suggestSplitFraming(source)).resolves.toEqual({ status: "manual", message: "Ajuste cada painel." });
  });
});
