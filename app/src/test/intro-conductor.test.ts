import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  effect: null as (() => (() => void)) | null,
  reduced: false,
  released: false,
  gateCallback: null as (() => void) | null,
  replayCallback: null as (() => void) | null,
  clock: { t: 999, done: true, scale: 1 },
  set: vi.fn(),
  timeline: vi.fn(),
  kill: vi.fn(),
  offGate: vi.fn(),
  offReplay: vi.fn(),
}));

vi.mock("react", () => ({ useLayoutEffect: (effect: typeof state.effect) => { state.effect = effect; } }));
vi.mock("gsap", () => ({ default: { set: state.set, timeline: state.timeline } }));
vi.mock("../components/galaxy/intro", () => ({
  INTRO_SEEN_KEY: "cnp-intro-seen",
  introClock: state.clock,
  introTuner: { read: () => ({ cardsAt: 2.8 }) },
  onIntroReplay: (cb: () => void) => { state.replayCallback = cb; return state.offReplay; },
}));
vi.mock("../components/galaxy/hero-galaxy-tunables", () => ({
  galaxyMotionTuner: { read: () => ({ waveLag: 0.4, introDur: 4 }) },
}));
vi.mock("../components/galaxy/intro-gate", () => ({
  introGateReleased: () => state.released,
  onIntroGateReady: (cb: () => void) => {
    state.gateCallback = cb;
    if (state.released) cb();
    return state.offGate;
  },
}));

import IntroConductor from "../components/galaxy/intro-conductor";

function mount() {
  IntroConductor();
  return state.effect!();
}

describe("entrada da Home em cada montagem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.reduced = false;
    state.released = true;
    Object.assign(state.clock, { t: 999, done: true, scale: 1 });
    const timeline = { to: vi.fn().mockReturnThis(), time: vi.fn(), duration: () => 2.45, kill: state.kill };
    state.timeline.mockReturnValue(timeline);
    vi.stubGlobal("window", { matchMedia: () => ({ matches: state.reduced }) });
    vi.stubGlobal("sessionStorage", { getItem: () => "1", setItem: vi.fn() });
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("reinicia texto e clock ao retornar, mesmo com sessão marcada", () => {
    const cleanup = mount();
    expect(state.clock).toEqual({ t: 0, done: false, scale: 1 });
    state.clock.t = 8;
    state.clock.done = true;
    cleanup();
    const cleanupReturn = mount();
    expect(state.clock).toEqual({ t: 0, done: false, scale: 1 });
    expect(state.timeline).toHaveBeenCalledTimes(2);
    expect(state.set).toHaveBeenLastCalledWith(expect.any(Array), { opacity: 0, y: 16 });
    cleanupReturn();
    expect(state.kill).toHaveBeenCalledTimes(2);
    expect(state.offGate).toHaveBeenCalledTimes(2);
    expect(state.offReplay).toHaveBeenCalledTimes(2);
  });

  it("espera o splash liberar antes de iniciar o driver", () => {
    state.released = false;
    const cleanup = mount();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    state.released = true;
    state.gateCallback!();
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("mantém movimento reduzido assentado, inclusive no replay", () => {
    state.reduced = true;
    const cleanup = mount();
    state.replayCallback!();
    expect(state.clock.t).toBe(999);
    expect(state.clock.done).toBe(true);
    expect(state.set).toHaveBeenLastCalledWith(expect.any(Array), { opacity: 1, y: 0 });
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    cleanup();
  });
});
