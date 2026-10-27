import { act } from "react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CompositionMediaLibrary } from "../components/editor/CompositionMediaLibrary";
import type { CompositionAsset } from "../lib/composition-types";
import type { MediaEntryDto } from "../lib/ipc";
import { reactHost } from "./react-host";

const native = vi.hoisted(() => ({ open: vi.fn(), relink: vi.fn(), get: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: native.open }));
vi.mock("../lib/ipc", () => ({ relinkMedia: native.relink, getMedia: native.get }));
vi.mock("../components/editor/CompositionMediaPoster", () => ({ CompositionMediaPoster: () => null }));

const asset: CompositionAsset = { id: "asset", mediaId: "media", name: "Entrevista.mp4", kind: "video", durationUs: 60_000_000, width: 640, height: 360, transcript: [] };
const entry: MediaEntryDto = { mediaId: "media", sha256: "a".repeat(64), sizeBytes: 100, ext: "mp4", originalName: asset.name, createdAtMs: 1, projectIds: ["project"], analysis: null, unavailable: false, storageKind: "reference", availability: "available" };
let view: Awaited<ReturnType<typeof reactHost>> | undefined;

beforeEach(() => { native.open.mockResolvedValue(null); });
afterEach(async () => { await view?.close(); view = undefined; vi.clearAllMocks(); });

async function library(available: boolean, callbacks = { onSelect: vi.fn(), onOpen: vi.fn(), onInsert: vi.fn(), onAssetDrag: vi.fn() }) {
  view = await reactHost(<CompositionMediaLibrary projectId="project" assets={[asset]} selectedId={asset.id} previews={{}}
    media={{ asset: { url: available ? "source.mp4" : null, error: available ? null : "Arquivo original ausente.", entry: { ...entry, unavailable: !available, availability: available ? "available" : "missing" } } }} {...callbacks}/>);
  return callbacks;
}

it("mídia disponível oferece apenas inserir e abrir fonte sem pedir para reconectar", async () => {
  const callbacks = await library(true);
  const footer = view!.host.querySelector(".composition-media__selection")!;
  expect(footer.querySelectorAll("button")).toHaveLength(2);
  expect(footer.querySelector('[aria-label="Localizar arquivo original"]')).toBeNull();
  expect(native.get).not.toHaveBeenCalled();
  await view!.click("Adicionar no cursor");
  await view!.click("Abrir fonte selecionada");
  expect(callbacks.onInsert).toHaveBeenCalledWith(asset);
  expect(callbacks.onOpen).toHaveBeenCalledWith(asset);
});

it("mantém clique, arraste e duplo clique da miniatura disponível", async () => {
  const callbacks = await library(true);
  const button = view!.host.querySelector<HTMLButtonElement>(`[aria-label="Selecionar mídia: ${asset.name}"]`)!;
  await act(async () => {
    button.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true, button: 0 }));
    button.click();
    button.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true }));
  });
  expect(callbacks.onSelect).toHaveBeenCalledWith(asset);
  expect(callbacks.onAssetDrag).toHaveBeenCalledWith(expect.anything(), asset);
  expect(callbacks.onOpen).toHaveBeenCalledWith(asset);
});

it("mídia ausente explica o problema, bloqueia inserção e mantém recuperar o original", async () => {
  const callbacks = await library(false);
  expect(view!.host.querySelector('[role="alert"]')?.textContent).toContain("Arquivo original ausente");
  expect(view!.host.querySelector('[aria-label="Localizar arquivo original"]')).not.toBeNull();
  await view!.click("Adicionar no cursor");
  expect(callbacks.onInsert).not.toHaveBeenCalled();
  expect(native.get).not.toHaveBeenCalled();
});

it("cancelar a localização preserva a seleção e não altera a mídia", async () => {
  const callbacks = await library(false);
  await view!.click("Localizar arquivo original");
  expect(native.open).toHaveBeenCalledTimes(1);
  expect(native.relink).not.toHaveBeenCalled();
  expect(callbacks.onInsert).not.toHaveBeenCalled();
  expect(view!.host.querySelector('.composition-media__asset[aria-pressed="true"]')).not.toBeNull();
});

it("erro ao reconectar fica visível e mantém as ações separadas", async () => {
  native.open.mockResolvedValue("C:/Vídeos/Outro.mp4");
  native.relink.mockRejectedValue(new Error("Este arquivo não corresponde ao original."));
  await library(false);
  await view!.click("Localizar arquivo original");
  expect([...view!.host.querySelectorAll('[role="alert"]')].some(alert => alert.textContent?.includes("não corresponde"))).toBe(true);
  expect(view!.host.querySelector('.composition-media__actions .media-relink')).toBeNull();
});

it.each([240, 288, 480])("footer mantém espaço entre ações no painel de %i px", async width => {
  await library(false);
  const style = document.createElement("style");
  style.textContent = readFileSync(new URL("../components/editor/composition-editor.css", import.meta.url), "utf8");
  document.head.append(style);
  const footer = view!.host.querySelector<HTMLElement>(".composition-media__selection")!;
  footer.style.width = `${width}px`;
  const computed = window.getComputedStyle(footer);
  expect(computed.display).toBe("grid");
  expect(computed.gap).toBe("8px");
  expect(computed.minWidth).toBe("0");
  expect(window.getComputedStyle(footer.querySelector<HTMLElement>(".composition-media__actions")!).gap).toBe("8px");
  expect(footer.querySelector(".media-relink")?.parentElement).toBe(footer);
});
