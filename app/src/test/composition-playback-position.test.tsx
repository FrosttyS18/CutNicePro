import { act, useLayoutEffect } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useCompositionPlayback } from "../hooks/useCompositionPlayback";
import { reactHost } from "./react-host";

let view: Awaited<ReturnType<typeof reactHost>> | undefined;
let playback: ReturnType<typeof useCompositionPlayback>;
afterEach(async () => { await view?.close(); view = undefined; vi.unstubAllGlobals(); });
function Probe({ duration, editorial = false }: { duration: number; editorial?: boolean }) {
  const value = useCompositionPlayback({ numerator: 30, denominator: 1 }, duration, true, { preservePausedPosition: editorial });
  useLayoutEffect(() => { playback = value; }, [value]);
  return <output>{value.frame}</output>;
}

it("o player limitado continua restringindo a posição quando a versão salva encurta", async () => {
  view = await reactHost(<Probe duration={300}/>);
  await act(async () => playback.seek(290));
  await view.render(<Probe duration={240}/>);
  expect(view.host.textContent).toBe("240");
  await act(async () => playback.pause());
  expect(view.host.textContent).toBe("240");
});

it("a posição editorial pausada sobrevive à duração curta, mas seek manual respeita o fim", async () => {
  view = await reactHost(<Probe duration={300} editorial/>);
  await act(async () => playback.seek(290));
  await view.render(<Probe duration={240} editorial/>);
  expect(view.host.textContent).toBe("290");
  await act(async () => playback.pause());
  expect(view.host.textContent).toBe("290");
  await act(async () => playback.seek(400));
  expect(view.host.textContent).toBe("240");
});

it("a pausa default do player de inspeção conserva a leitura temporal anterior", async () => {
  let now = 0;
  vi.stubGlobal("performance", { now: () => now });
  view = await reactHost(<Probe duration={300}/>, environment => {
    Object.defineProperty(environment, "requestAnimationFrame", { configurable: true, value: () => 1 });
    Object.defineProperty(environment, "cancelAnimationFrame", { configurable: true, value: () => undefined });
  });
  await act(async () => playback.toggle());
  now = 1000;
  await act(async () => playback.pause());
  expect(view.host.textContent).toBe("30");
});
