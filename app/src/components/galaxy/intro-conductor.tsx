import { useEffect } from "react";
import gsap from "gsap";
import { INTRO_SEEN_KEY, introClock, introTuner } from "./intro";

/**
 * Condutor da entrada — Fase 03B.10.
 *
 * Referência ORIGINAL do ArtCraft (frontend/apps/artcraft-website-next):
 * o IntroConductor deles anima o conteúdo com GSAP (power*.out + stagger)
 * sobre o MESMO relógio compartilhado (`introClock`) que rege o galaxy —
 * nunca timers CSS independentes. Aqui a mesma arquitetura, com o clock
 * avançando por rAF próprio (como desde a 03B.5, sem gsap.ticker):
 *
 *   0.25s→1.25s  Bem-Vindo     (y+16→0, opacity 0→1 · power3.out)
 *   1.20s→1.85s  subtítulo     (y+12→0 · power3.out)
 *   1.80s→2.45s  botão (SLOT externo — nunca o FlipButton/Motion interno)
 *   2.45s→2.80s  respiro
 *   2.80s        espiral INTEIRA (instrAt = cardsAt = 2.8; wave original
 *                de 4.0s → revelação completa ~6.8s)
 *
 * Política de sessão (missão §5): primeira abertura do app = apresentação
 * integral (1× por SESSÃO, sessionStorage); Home→Biblioteca→Home = tudo
 * assentado (gsap.set final + introClock.t=999) — nenhuma parte da Home
 * anima sozinha enquanto outra está assentada. Reduced-motion: abre
 * assentado, sem timeline.
 */

const SEEN_KEY = "cnp-intro-session";

export default function IntroConductor() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      // Storage indisponível — trata como primeira apresentação.
    }

    const settle = () => {
      gsap.set([".home__rise", ".home__subtitle .home__fade", ".home__cta-slot"], {
        opacity: 1,
        y: 0,
      });
    };

    if (reduce || seen) {
      // Assentado: texto completo + galaxy além de todo beat (clock 999 =
      // rollT/wave saturados, movimento contínuo imediato).
      introClock.t = 999;
      introClock.done = true;
      introClock.scale = 1;
      settle();
      return;
    }

    introClock.t = 0;
    introClock.done = false;
    introClock.scale = 1;

    // Estado inicial ANTES do primeiro paint visível (sem flash do final).
    gsap.set([".home__rise", ".home__subtitle .home__fade", ".home__cta-slot"], {
      opacity: 0,
      y: 16,
    });

    const ease = "power3.out";
    const tl = gsap.timeline();
    tl.to(".home__rise", { opacity: 1, y: 0, duration: 1.0, ease }, 0.25)
      .to(".home__subtitle .home__fade", { opacity: 1, y: 0, duration: 0.65, ease }, 1.2)
      .to(".home__cta-slot", { opacity: 1, y: 0, duration: 0.65, ease }, 1.8);

    // Clock compartilhado (rAF) — rege a apresentação do galaxy.
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const deltaMs = Math.min(now - last, 100);
      last = now;
      introClock.t += (deltaMs / 1000) * introClock.scale;
      if (!introClock.done && introClock.t > introTuner.read().cardsAt + 4.2) {
        introClock.done = true;
        try {
          sessionStorage.setItem(SEEN_KEY, "1");
          // Key legada de primeira-visita: não controla mais nada; mantida
          // apenas para não alterar o dado existente do usuário.
          localStorage.setItem(INTRO_SEEN_KEY, "1");
        } catch {
          // Storage indisponível — a próxima abertura repete a apresentação.
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      tl.kill();
      cancelAnimationFrame(raf);
      settle();
      introClock.t = 999;
    };
  }, []);

  return null;
}
