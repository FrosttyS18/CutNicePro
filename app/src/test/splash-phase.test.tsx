import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reactHost } from "./react-host";
import { useSplashPhase } from "../hooks/useSplashPhase";
import { releaseIntroGate } from "../components/galaxy/intro-gate";

vi.mock("../components/galaxy/intro-gate", () => ({ releaseIntroGate: vi.fn() }));
let mounted: Awaited<ReturnType<typeof reactHost>> | undefined;
let reduced = false;

function fakeTimers() {
  vi.useFakeTimers();
  window.setTimeout = setTimeout;
  window.clearTimeout = clearTimeout;
}

function Splash({ boot }: { boot: boolean }) {
  const phase = useSplashPhase(boot);
  return <div data-visible={phase.visible} data-leaving={phase.leaving}>
    <button onClick={phase.onAnimationComplete}>Concluir animação</button>
  </div>;
}

function mount(boot: boolean) {
  return reactHost(<Splash boot={boot} />, environment => {
    environment.matchMedia = vi.fn().mockReturnValue({ matches: reduced });
  });
}

afterEach(async () => {
  await mounted?.close(); mounted = undefined;
  vi.useRealTimers(); vi.clearAllMocks(); reduced = false;
});

describe("saída coordenada do splash", () => {
  it("aguarda a animação mesmo quando o boot terminou", async () => {
    mounted = await mount(true);
    expect(mounted.host.querySelector("[data-visible]")?.getAttribute("data-visible")).toBe("true");
    expect(releaseIntroGate).not.toHaveBeenCalled();
  });

  it("aguarda o boot mesmo quando a animação terminou", async () => {
    mounted = await mount(false);
    await mounted.click("Concluir animação");
    expect(mounted.host.querySelector("[data-leaving]")?.getAttribute("data-leaving")).toBe("false");
    expect(releaseIntroGate).not.toHaveBeenCalled();
  });

  it("libera a Home somente depois da animação, boot e fade de saída", async () => {
    mounted = await mount(false);
    fakeTimers();
    await mounted.click("Concluir animação");
    await mounted.render(<Splash boot />);
    expect(mounted.host.querySelector("[data-leaving]")?.getAttribute("data-leaving")).toBe("true");
    await act(async () => { vi.advanceTimersByTime(269); });
    expect(releaseIntroGate).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(mounted.host.querySelector("[data-visible]")?.getAttribute("data-visible")).toBe("false");
    expect(releaseIntroGate).toHaveBeenCalledOnce();
  });

  it("cancela a liberação ao desmontar durante o fade", async () => {
    mounted = await mount(true);
    fakeTimers();
    await mounted.click("Concluir animação");
    await mounted.close(); mounted = undefined;
    await act(async () => { vi.runAllTimers(); });
    expect(releaseIntroGate).not.toHaveBeenCalled();
  });

  it("dispensa o fade com movimento reduzido", async () => {
    reduced = true;
    mounted = await mount(true);
    fakeTimers();
    await mounted.click("Concluir animação");
    expect(mounted.host.querySelector("[data-visible]")?.getAttribute("data-visible")).toBe("false");
    expect(releaseIntroGate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});

