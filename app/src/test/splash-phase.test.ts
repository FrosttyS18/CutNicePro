import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  values: [true, false, false],
  index: 0,
  setters: [vi.fn(), vi.fn(), vi.fn()],
  effect: null as (() => void | (() => void)) | null,
  release: vi.fn(),
  reduced: false,
}));

vi.mock("react", () => ({
  useState: () => {
    const index = state.index++;
    return [state.values[index], state.setters[index]];
  },
  useCallback: (callback: () => void) => callback,
  useEffect: (effect: typeof state.effect) => { state.effect = effect; },
}));
vi.mock("../components/galaxy/intro-gate", () => ({ releaseIntroGate: state.release }));

import { useSplashPhase } from "../hooks/useSplashPhase";

describe("saída coordenada do splash", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    state.index = 0;
    state.values = [true, false, false];
    state.reduced = false;
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: state.reduced }),
      setTimeout, clearTimeout,
    });
  });

  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it.each([[true, false], [false, true]])("aguarda boot=%s e animação=%s", (boot, animation) => {
    state.values[2] = animation;
    useSplashPhase(boot);
    state.effect!();
    vi.runAllTimers();
    expect(state.release).not.toHaveBeenCalled();
    expect(state.setters[1]).not.toHaveBeenCalled();
  });

  it("libera a Home somente depois da animação, boot e fade de saída", () => {
    state.values[2] = true;
    useSplashPhase(true);
    state.effect!();
    expect(state.setters[1]).toHaveBeenCalledWith(true);
    vi.advanceTimersByTime(269);
    expect(state.release).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(state.setters[0]).toHaveBeenCalledWith(false);
    expect(state.release).toHaveBeenCalledTimes(1);
  });

  it("cancela a liberação ao desmontar durante o fade", () => {
    state.values[2] = true;
    useSplashPhase(true);
    const cleanup = state.effect!();
    if (cleanup) cleanup();
    vi.runAllTimers();
    expect(state.release).not.toHaveBeenCalled();
  });

  it("dispensa o fade com movimento reduzido", () => {
    state.values[2] = true;
    state.reduced = true;
    useSplashPhase(true);
    state.effect!();
    expect(state.release).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
