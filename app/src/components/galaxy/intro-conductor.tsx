import { useEffect } from "react";
import { INTRO_SEEN_KEY, introClock, introTuner } from "./intro";

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
    // 03B.9: retornos NÃO repetem/comprimem a coreografia — o galaxy abre
    // no estado assentado (t além de todo beat), retomada natural do
    // movimento contínuo. Primeira visita roda o contrato integral.
    if (returning) {
      introClock.t = 999;
      introClock.done = true;
      introClock.scale = 1;
      return;
    }
    introClock.t = 0;
    introClock.done = false;
    introClock.scale = 1;

    // 03B.9: fast-forward por eventos genéricos de ponteiro/teclado
    // REMOVIDO — qualquer input acelerava a apresentação sem querer.
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
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      introClock.t = 999;
    };
  }, []);

  return null;
}
