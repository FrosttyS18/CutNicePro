import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorTimeline } from "../components/editor/EditorTimeline";
import { TimelineSurface } from "../components/editor/TimelineSurface";
import { defaultEditorSettings, emptyWorkspace } from "../lib/workspace";
import { effectiveSegments, planDuration, planIsValid } from "../lib/edit-plan";
import { readWorkspace, saveWorkspace } from "../services/workspace-store";
import { renderSettings } from "../lib/clips";
import type { EditorSettings } from "../lib/workspace-types";
import { reactHost } from "./react-host";

const initial: EditorSettings = { ...defaultEditorSettings(), trimStart: 10, trimEnd: 70,
  editPlan: { version: 1, segments: [{ sourceStart: 10, sourceEnd: 30 }, { sourceStart: 40, sourceEnd: 70 }] } };
let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
let frames: Map<number, FrameRequestCallback>;

afterEach(async () => { await mounted?.close(); mounted = undefined; vi.restoreAllMocks(); });

async function editor(settings = initial, planEnabled = true, onTrimSettings?: (patch: Partial<EditorSettings>) => void) {
  const onSettings = vi.fn();
  const onSeek = vi.fn();
  frames = new Map();
  let frame = 0;
  mounted = await reactHost(<EditorTimeline localUrl={null} duration={100} time={20} playing={false} canPlay
    settings={settings} onSettings={onSettings} onTrimSettings={onTrimSettings} onSeek={onSeek} onTogglePlay={() => {}} planEnabled={planEnabled}/>, environment => {
    const captures = new WeakMap<object, number>();
    Object.defineProperties(environment.HTMLElement.prototype, {
      setPointerCapture: { configurable: true, value: function (this: HTMLElement, id: number) { captures.set(this, id); } },
      hasPointerCapture: { configurable: true, value: function (this: HTMLElement, id: number) { return captures.get(this) === id; } },
      releasePointerCapture: { configurable: true, value: function (this: HTMLElement) { captures.delete(this); } },
      getBoundingClientRect: { configurable: true, value: () => ({ left: 0, top: 0, width: 1000, height: 40, right: 1000, bottom: 40, x: 0, y: 0, toJSON: () => ({}) }) },
    });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++frame, callback); return frame; });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  });
  return { ...mounted, onSettings, onSeek };
}

function control(label: string): HTMLElement {
  const target = mounted?.host.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  if (!target) throw new Error(`Control not found: ${label}`);
  return target;
}

async function pointer(target: HTMLElement, type: string, clientX: number, pointerId = 1) {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, { clientX: { value: clientX }, pointerId: { value: pointerId }, button: { value: 0 } });
  await act(async () => { target.dispatchEvent(event); });
}

async function key(target: HTMLElement, value: string, shiftKey = false) {
  await act(async () => { target.dispatchEvent(new window.KeyboardEvent("keydown", { key: value, shiftKey, bubbles: true, cancelable: true })); });
}

describe("timeline com alças de corte", () => {
  it("ampliar um clipe sincroniza o intervalo usado na prévia e no download", async () => {
    const ui = await editor({ ...initial, trimStart: 10, trimEnd: 30, editPlan: null });
    await pointer(control("Fim do trecho 1"), "pointerdown", 300);
    await pointer(control("Fim do trecho 1"), "pointerup", 800);
    expect(ui.onSettings).toHaveBeenCalledWith(expect.objectContaining({ trimStart: 10, trimEnd: 80 }));
    const next = { ...initial, editPlan: null, ...ui.onSettings.mock.calls[0][0] };
    expect(effectiveSegments(next, 100)).toEqual([{ sourceStart: 10, sourceEnd: 80 }]);
    expect(renderSettings(next).trimEnd).toBe(80);
  });
  it("mantém os controles de trecho fora do slider de posição", async () => {
    await editor();
    const seek = control("Posição do vídeo");
    expect(seek.querySelector('button, input, [role="slider"]')).toBeNull();
    expect(control("Início do trecho 1").getAttribute("role")).toBe("slider");
    expect(control("Selecionar trecho 2").getAttribute("aria-pressed")).toBe("false");
  });

  it("arrasta início em draft, não faz seek e salva uma vez ao soltar", async () => {
    const ui = await editor();
    const start = control("Início do trecho 1");
    await pointer(start, "pointerdown", 100);
    await pointer(start, "pointermove", 150);
    await pointer(start, "pointermove", 180);
    expect(start.getAttribute("aria-valuenow")).toBe("18");
    expect(ui.onSettings).not.toHaveBeenCalled();
    expect(ui.onSeek).not.toHaveBeenCalled();
    await pointer(start, "pointerup", 200);
    expect(ui.onSettings).toHaveBeenCalledTimes(1);
    expect(ui.onSettings).toHaveBeenCalledWith({ trimStart: 20, trimEnd: 70, editPlan: { version: 1, segments: [{ sourceStart: 20, sourceEnd: 30 }, initial.editPlan!.segments[1]] } });
    expect(initial.editPlan!.segments[0].sourceStart).toBe(10);
  });

  it("limita as alças pelos vizinhos, mídia e duração mínima", async () => {
    const ui = await editor();
    const end = control("Fim do trecho 1");
    await pointer(end, "pointerdown", 300);
    await pointer(end, "pointerup", 900);
    expect(ui.onSettings.mock.calls[0][0].editPlan.segments[0].sourceEnd).toBe(40);
    const start = control("Início do trecho 2");
    await pointer(start, "pointerdown", 400);
    await pointer(start, "pointerup", -900);
    expect(ui.onSettings.mock.calls[1][0].editPlan.segments[1].sourceStart).toBe(30);
    await pointer(end, "pointerdown", 300);
    await pointer(end, "pointerup", -900);
    const minimumPlan = ui.onSettings.mock.calls[2][0].editPlan.segments;
    expect(minimumPlan[0].sourceEnd - minimumPlan[0].sourceStart).toBeCloseTo(0.05, 10);
    expect(planIsValid(minimumPlan, 100)).toBe(true);
    const firstStart = control("Início do trecho 1");
    await pointer(firstStart, "pointerdown", 100);
    await pointer(firstStart, "pointerup", -900);
    expect(ui.onSettings.mock.calls[3][0].editPlan.segments[0].sourceStart).toBe(0);
    const lastEnd = control("Fim do trecho 2");
    await pointer(lastEnd, "pointerdown", 700);
    await pointer(lastEnd, "pointerup", 1500);
    expect(ui.onSettings.mock.calls[4][0].editPlan.segments[1].sourceEnd).toBe(100);
  });

  it.each(["pointercancel", "lostpointercapture"])("descarta o draft em %s", async type => {
    const ui = await editor();
    const start = control("Início do trecho 1");
    await pointer(start, "pointerdown", 100);
    await pointer(start, "pointermove", 200);
    await pointer(start, type, 200);
    await pointer(start, "pointerup", 200);
    expect(start.getAttribute("aria-valuenow")).toBe("10");
    expect(ui.onSettings).not.toHaveBeenCalled();
  });

  it("Escape cancela e gesto sem mudança não cria histórico", async () => {
    const ui = await editor();
    const start = control("Início do trecho 1");
    await pointer(start, "pointerdown", 100);
    await pointer(start, "pointermove", 200);
    await key(start, "Escape");
    await pointer(start, "pointerup", 200);
    await pointer(start, "pointerdown", 100);
    await pointer(start, "pointerup", 100);
    expect(ui.onSettings).not.toHaveBeenCalled();
  });

  it("ajusta pelo teclado com limites e usa o commit dedicado", async () => {
    const commit = vi.fn();
    const ui = await editor(initial, true, commit);
    await key(control("Início do trecho 2"), "Home");
    expect(commit.mock.calls[0][0].editPlan.segments[1].sourceStart).toBe(30);
    await key(control("Fim do trecho 1"), "ArrowRight", true);
    expect(commit.mock.calls[1][0].editPlan.segments[0].sourceEnd).toBe(31);
    expect(ui.onSettings).not.toHaveBeenCalled();
    expect(ui.onSeek).not.toHaveBeenCalled();
  });

  it("preserva os atalhos de desfazer/refazer quando a alça está em foco", async () => {
    const ui = await editor();
    const shortcut = vi.fn();
    window.addEventListener("keydown", shortcut);
    await act(async () => { control("Início do trecho 1").dispatchEvent(new window.KeyboardEvent("keydown", {
      key: "z", ctrlKey: true, bubbles: true, cancelable: true,
    })); });
    expect(shortcut).toHaveBeenCalledTimes(1);
    expect(ui.onSettings).not.toHaveBeenCalled();
    window.removeEventListener("keydown", shortcut);
  });

  it("exclui o trecho selecionado mesmo com o cursor no primeiro", async () => {
    const ui = await editor();
    await act(async () => { control("Selecionar trecho 2").click(); });
    expect(control("Selecionar trecho 2").getAttribute("aria-pressed")).toBe("true");
    await ui.click("Excluir trecho selecionado");
    expect(ui.onSettings).toHaveBeenCalledWith({ editPlan: null, trimStart: 10, trimEnd: 30 });
    expect(ui.onSeek).not.toHaveBeenCalled();
  });

  it("preserva corte simples sem introduzir plano de edição", async () => {
    const ui = await editor({ ...initial, editPlan: null }, false);
    const start = control("Início do trecho 1");
    await pointer(start, "pointerdown", 100);
    await pointer(start, "pointerup", 150);
    expect(ui.onSettings).toHaveBeenCalledWith({ editPlan: null, trimStart: 15, trimEnd: 70 });
  });

  it("salva e reabre o plano realmente produzido pelo arrasto", async () => {
    const ui = await editor();
    const start = control("Início do trecho 1");
    await pointer(start, "pointerdown", 100);
    await pointer(start, "pointerup", 150);
    const workspace = emptyWorkspace();
    workspace.settings = { ...initial, ...ui.onSettings.mock.calls[0][0] };
    expect(saveWorkspace("timeline-trim", workspace)).toBe(true);
    const restored = readWorkspace("timeline-trim");
    expect(effectiveSegments(restored.settings, 100)).toEqual(workspace.settings.editPlan!.segments);
    expect(planDuration(effectiveSegments(restored.settings, 100))).toBe(45);
    expect(renderSettings(restored.settings).segments).toEqual(effectiveSegments(restored.settings, 100));
    expect(renderSettings(restored.settings)).not.toHaveProperty("editPlan");
  });

  it.each(["duration", "enabled"])("invalida o draft quando muda %s e não salva depois", async change => {
    const ui = await editor();
    const commit = vi.fn();
    const surface = (duration = 100, canPlay = true) => <TimelineSurface duration={duration} time={20} canPlay={canPlay}
      frames={[]} peaks={[]} loading={false} hasAudio={false} settings={initial} segments={initial.editPlan!.segments}
      onSeek={ui.onSeek} onTrimCommit={commit}/>;
    await ui.render(surface());
    const start = control("Início do trecho 1");
    await pointer(start, "pointerdown", 100);
    await pointer(start, "pointermove", 200);
    expect(start.getAttribute("aria-valuenow")).toBe("20");
    await ui.render(change === "duration" ? surface(80) : surface(100, false));
    await ui.render(surface());
    expect(control("Início do trecho 1").getAttribute("aria-valuenow")).toBe("10");
    await pointer(control("Início do trecho 1"), "pointerup", 200);
    expect(commit).not.toHaveBeenCalled();
  });

  it("coalesce seek usando a última coordenada por frame", async () => {
    const ui = await editor();
    const seek = control("Posição do vídeo");
    await pointer(seek, "pointerdown", 100);
    await pointer(seek, "pointermove", 200);
    await pointer(seek, "pointermove", 800);
    expect(frames.size).toBe(1);
    await act(async () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)); });
    expect(ui.onSeek.mock.calls.map(call => call[0])).toEqual([10, 80]);
    await pointer(seek, "pointerup", 900);
    expect(ui.onSeek).toHaveBeenLastCalledWith(90);
  });

  it("mantém TimelineSurface sem callback de trim compatível", async () => {
    const ui = await editor();
    await ui.render(<TimelineSurface duration={100} time={20} canPlay frames={[]} peaks={[]} loading={false} hasAudio={false}
      settings={initial} onSeek={ui.onSeek}/>);
    expect(control("Posição do vídeo")).toBeTruthy();
    expect(ui.host.querySelector('[aria-label="Início do trecho 1"]')).toBeNull();
  });
});
