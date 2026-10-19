import { useEffect } from "react";
import {
  INTRO_SEEN_KEY,
  introClock,
  introFastForward,
  introTuner,
} from "./intro";

/**
 * Condutor do relógio de introdução — adaptação do IntroConductor original
 * (que usava gsap.ticker e animava a navbar do site) para o CutNicePro:
 * mesmo contrato de clock (intro.ts original), avançado por um requestAni-
 * mationFrame próprio; fast-forward por qualquer input do usuário; visitas
 * de retorno rodam comprimidas; reduced-motion abre com a página assentada
 * (t = 999). Sem gsap e sem navbar — nada do core do galaxy muda.
 */
export default function IntroConductor() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      introClock.t = 999;
      introClock.done = true;
      return;
    }

    let returning = false;
    try {
      returning = localStorage.getItem(INTRO_SEEN_KEY) === "1";
    } catch {
      // Storage indisponível — trata como primeira visita.
    }
    introClock.t = 0;
    introClock.done = false;
    introClock.scale = returning ? introTuner.read().returnScale : 1;

    const onInput = () => introFastForward();
    window.addEventListener("wheel", onInput, { passive: true });
    window.addEventListener("pointerdown", onInput, { passive: true });
    window.addEventListener("keydown", onInput);
    window.addEventListener("touchstart", onInput, { passive: true });

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const deltaMs = Math.min(now - last, 100);
      last = now;
      introClock.t += (deltaMs / 1000) * introClock.scale;
      if (!introClock.done && introClock.t > introTuner.read().cardsAt + 3) {
        introClock.done = true;
        try {
          localStorage.setItem(INTRO_SEEN_KEY, "1");
        } catch {
          // Storage indisponível — a próxima visita repete a intro inteira.
        }
        window.removeEventListener("wheel", onInput);
        window.removeEventListener("pointerdown", onInput);
        window.removeEventListener("keydown", onInput);
        window.removeEventListener("touchstart", onInput);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("wheel", onInput);
      window.removeEventListener("pointerdown", onInput);
      window.removeEventListener("keydown", onInput);
      window.removeEventListener("touchstart", onInput);
      introClock.t = 999;
    };
  }, []);

  return null;
}
