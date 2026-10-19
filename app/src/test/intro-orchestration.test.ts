import { beforeEach, describe, expect, it, vi } from "vitest";

function memoryLocalStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i) => Array.from(map.keys())[i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  };
}

/**
 * Testes de orquestração da entrada (03B.11) — unidade:
 * gate do splash, assinatura de replay e contrato do clock.
 */

describe("intro orchestration (gate × clock × replay)", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryLocalStorage());
    vi.stubGlobal("window", {
      matchMedia: (q: string) => ({
        matches: false,
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      }),
    });
  });
  it("gate propaga liberação uma única vez e notifica waiters (inclusive tardios)", async () => {
    const { releaseIntroGate, introGateReleased, onIntroGateReady } = await import(
      "../components/galaxy/intro-gate"
    );
    expect(introGateReleased()).toBe(false);
    let fired = 0;
    const off = onIntroGateReady(() => fired++);
    releaseIntroGate();
    releaseIntroGate();
    expect(fired).toBe(1);
    expect(introGateReleased()).toBe(true);
    off();
    let late = 0;
    onIntroGateReady(() => late++)();
    expect(late).toBe(1);
  });

  it("replayIntro zera o clock, marca não-concluído e notifica assinantes (idempotente por assinatura única)", async () => {
    const { introClock, replayIntro, onIntroReplay } = await import("../components/galaxy/intro");
    introClock.t = 999;
    introClock.done = true;
    let rearmed = 0;
    const off = onIntroReplay(() => rearmed++);
    replayIntro();
    expect(introClock.t).toBe(0);
    expect(introClock.done).toBe(false);
    expect(rearmed).toBe(1);
    off();
    replayIntro();
    expect(rearmed).toBe(1);
  });

  it("tunables efetivos do contrato: cardsAt 2.8, instrAt 2.8, introDur 4.0", async () => {
    localStorage.removeItem("artcraft-tuner");
    const { introTuner } = await import("../components/galaxy/intro");
    const { galaxyMotionTuner } = await import("../components/galaxy/hero-galaxy-tunables");
    expect(introTuner.read().cardsAt).toBe(2.8);
    expect(introTuner.read().instrAt).toBe(2.8);
    expect(galaxyMotionTuner.read().introDur).toBe(4.0);
  });
});
