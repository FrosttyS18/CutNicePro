import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClipGallery } from "../components/clips/ClipGallery";
import { loadClipThumbnail } from "../services/clip-thumbnails";
import * as workspaceStore from "../services/workspace-store";
import type { LibraryClip } from "../lib/clip-library";
import { reactHost } from "./react-host";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../services/clip-thumbnails", () => ({ loadClipThumbnail: vi.fn(async () => ({ src: "data:image/jpeg;base64,/9j/2Q==", width: 1920, height: 1080 })) }));
afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const observers: Viewport[] = [];
class Viewport {
  active = true;
  target: Element | null = null;
  constructor(readonly callback: IntersectionObserverCallback) { observers.push(this); }
  observe(target: Element) { this.target = target; }
  disconnect() { this.active = false; }
  enter() {
    if (this.active && this.target) this.callback([{ target: this.target, isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

function entries(): LibraryClip[] {
  return Array.from({ length: 27 }, (_, i) => ({
    project: { id: `p${i % 2}`, name: `Projeto ${i % 2}`, created_at_ms: 0, updated_at_ms: 0, last_opened_at_ms: null },
    mediaId: "m", clip: { id: i.toString(16).padStart(64, "0"), start: i, end: i + 20, title: `Trecho ${i}`, score: 80, reasons: [], review: "pending", format: "9:16" },
  }));
}

describe("biblioteca não mantém decodificadores por card", () => {
  it("27 cards usam imagens, carregam só ao se aproximar e não repetem no scroll", async () => {
    observers.length = 0;
    vi.stubGlobal("IntersectionObserver", Viewport);
    const read = vi.spyOn(workspaceStore, "readWorkspace");
    const view = await reactHost(<ClipGallery entries={entries()} showProject onInspect={() => {}} />);
    expect(view.host.querySelectorAll(".clip-card")).toHaveLength(27);
    expect(view.host.querySelectorAll("video")).toHaveLength(0);
    expect(loadClipThumbnail).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(2);
    await act(async () => observers.forEach(observer => observer.enter()));
    expect(view.host.querySelectorAll(".clip-card__poster img")).toHaveLength(27);
    expect(view.host.querySelectorAll("video")).toHaveLength(0);
    await act(async () => observers.forEach(observer => observer.enter()));
    expect(loadClipThumbnail).toHaveBeenCalledTimes(27);
    expect(read).toHaveBeenCalledTimes(2);
    await view.close();
  });
  it("erro em uma miniatura é informado sem derrubar os outros cards", async () => {
    observers.length = 0;
    vi.stubGlobal("IntersectionObserver", Viewport);
    vi.mocked(loadClipThumbnail).mockRejectedValueOnce(new Error("Arquivo ausente"));
    const view = await reactHost(<ClipGallery entries={entries().slice(0, 2)} onInspect={() => {}} />);
    await act(async () => observers.forEach(observer => observer.enter()));
    expect(view.host.querySelectorAll(".clip-card")).toHaveLength(2);
    expect(view.host.querySelectorAll(".clip-card__unavailable")).toHaveLength(1);
    expect(view.host.querySelectorAll(".clip-card__poster img")).toHaveLength(1);
    await view.close();
  });
});
