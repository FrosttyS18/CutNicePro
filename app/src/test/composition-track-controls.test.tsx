import { act, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { CompositionTimeline } from "../components/editor/CompositionTimeline";
import { compositionFromLegacy } from "../lib/composition-legacy";
import { emptyWorkspace } from "../lib/workspace";
import type { Composition, CompositionTrack } from "../lib/composition-types";
import { reactHost } from "./react-host";

let view: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async () => { await view?.close(); view = undefined; });

function fixture() {
  const workspace = emptyWorkspace();
  workspace.media = { kind: "local", mediaId: "source", name: "Fonte.mp4", duration: 10, width: 1920, height: 1080, videoId: null, url: null };
  workspace.transcript = [{ id: "s", start: 0, end: 5, text: "Uma legenda" }];
  return compositionFromLegacy(workspace);
}

async function mount(initial: Composition) {
  const changed = vi.fn();
  function Harness() {
    const [document, setDocument] = useState(initial);
    return <CompositionTimeline document={document} frame={0} selected={[]} mode="select" range={null}
      onSelect={vi.fn()} onRange={vi.fn()} onSeek={vi.fn()} onChange={vi.fn()} onPreview={vi.fn()} onError={vi.fn()}
      onTrackChange={(id: string, patch: Partial<Pick<CompositionTrack, "locked" | "hidden" | "muted">>) => {
        changed(id, patch);
        setDocument(current => ({ ...current, tracks: current.tracks.map(track => track.id === id ? { ...track, ...patch } : track) }));
      }}/>
  }
  view = await reactHost(<Harness />);
  return changed;
}

function button(label: string) {
  const control = view!.host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  expect(control, label).not.toBeNull();
  return control!;
}

it("expõe somente controles reais por tipo e envia a identidade da faixa acionada", async () => {
  const document = fixture();
  document.items.find(item => item.kind === "audio")!.groupId = "independent";
  document.tracks.find(track => track.kind === "caption")!.locked = true;
  const changed = await mount(document);
  expect(view!.host.querySelector('[aria-label="Silenciar faixa Principal"]')).not.toBeNull();
  expect(view!.host.querySelector('[aria-label="Ocultar faixa Áudio da fonte"]')).toBeNull();
  expect(view!.host.querySelector('[aria-label="Silenciar faixa Legendas"]')).toBeNull();
  const lock = button("Bloquear faixa Principal");
  await act(async () => lock.click());
  expect(changed).toHaveBeenLastCalledWith("V1", { locked: true });
  expect(lock.getAttribute("aria-pressed")).toBe("true");
  await act(async () => button("Ocultar faixa Legendas").click());
  expect(changed).toHaveBeenLastCalledWith("C1", { hidden: true });
  await act(async () => button("Silenciar faixa Áudio da fonte").click());
  expect(changed).toHaveBeenLastCalledWith("A1", { muted: true });
  expect(view!.host.querySelectorAll('.composition-track__menu')).toHaveLength(3);
});

it("ocultar ou silenciar o vídeo preserva áudio e legenda recolhidos no próprio material", async () => {
  const document = fixture();
  const originalItems = structuredClone(document.items);
  const changed = await mount(document);
  expect(view!.host.querySelectorAll('[data-composition-track]')).toHaveLength(1);
  await act(async () => button("Ocultar faixa Principal").click());
  expect(changed).toHaveBeenLastCalledWith("V1", { hidden: true });
  expect(view!.host.querySelectorAll('[data-composition-track]')).toHaveLength(1);
  expect(view!.host.querySelector('[data-source-audio="true"]')).not.toBeNull();
  expect(view!.host.querySelector('.composition-item__caption-badge')).not.toBeNull();
  await act(async () => button("Silenciar faixa Principal").click());
  expect(changed).toHaveBeenLastCalledWith("V1", { muted: true });
  expect(view!.host.querySelectorAll('[data-composition-track]')).toHaveLength(1);
  await act(async () => button("Ocultar faixa Principal").click());
  await act(async () => button("Silenciar faixa Principal").click());
  expect(view!.host.querySelectorAll('[data-composition-track]')).toHaveLength(1);
  expect(document.items).toEqual(originalItems);
});

it("usa tooltip próprio com estado e identifica uma faixa longa de legenda como C", async () => {
  const document = fixture();
  const caption = document.tracks.find(track => track.kind === "caption")!;
  caption.id = "caption-long-identifier";
  caption.locked = true;
  document.items.filter(item => item.kind === "caption").forEach(item => { item.trackId = caption.id; });
  await mount(document);
  const lane = view!.host.querySelector('[data-composition-track="caption-long-identifier"]')!;
  expect(lane.querySelector('.composition-track__label > span')?.textContent).toBe("C");
  const lock = button("Bloquear faixa Legendas");
  await act(async () => lock.focus());
  expect(globalThis.document.querySelector('[role="tooltip"]')?.textContent).toBe("Desbloquear faixa Legendas");
  expect(lock.hasAttribute("title")).toBe(false);
  await act(async () => lock.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(globalThis.document.querySelector('[role="tooltip"]')).toBeNull();
});

it.each([
  ["audio", "muted", "Silenciar faixa Áudio da fonte"],
  ["audio", "locked", "Bloquear faixa Áudio da fonte"],
  ["caption", "hidden", "Ocultar faixa Legendas"],
  ["caption", "locked", "Bloquear faixa Legendas"],
] as const)("mantém foco ao reativar %s %s e recolhe somente depois de sair da faixa", async (kind, flag, label) => {
  const document = fixture();
  const track = document.tracks.find(track => track.kind === kind)!;
  track[flag] = true;
  await mount(document);
  const control = button(label);
  await act(async () => control.focus());
  await act(async () => control.click());
  const lane = view!.host.querySelector(`[data-composition-track="${track.id}"]`);
  expect(lane).not.toBeNull();
  expect(lane!.querySelectorAll('[data-composition-item]')).toHaveLength(1);
  expect(globalThis.document.activeElement).toBe(control);
  expect(control.getAttribute("aria-pressed")).toBe("false");
  await act(async () => button("Bloquear faixa Principal").focus());
  expect(view!.host.querySelector(`[data-composition-track="${track.id}"]`)).toBeNull();
});
