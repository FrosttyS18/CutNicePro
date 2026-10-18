import { useEffect, useMemo, useRef } from "react";
import {
  ORBIT_DEFAULTS,
  type ContactCardSource,
} from "../lib/contactSheetSources";

/**
 * OrbitingMediaHero — cartões de mídia independentes orbitando o centro.
 *
 * Implementação ORIGINAL do CutNicePro, calibrada pela inspeção real do
 * header público do ArtCraft (getartcraft.com, 2026-10-18; evidências em
 * docs/reports/evidence/03b2/artcraft-inspection/):
 *   - órbita anti-horária com ângulo e velocidade angular próprios por
 *     cartão (movimento não uniforme, trajetória contínua);
 *   - escala e opacidade crescem com a profundidade no anel: discretos no
 *     interior (atravessam o centro como "fantasmas"), nítidos e opacos na
 *     periferia (z-order simulando profundidade);
 *   - cartões frontais, cantos arredondados, sem rotação 3D — como observado;
 *   - SEM reação ao cursor: nenhum efeito de ponteiro foi confirmado na
 *     referência, e a missão proíbe inventar interações.
 *
 * Geometria 03B.3: TUDO é relativo à área artística da Home (o próprio
 * container) — órbita ELÍPTICA com raios horizontais e verticais próprios
 * (nada de min(w,h)), centro no centro exato do container e cartões
 * dimensionados como fração moderada da largura. Recalcula a cada frame a
 * partir das dimensões medidas, então expandir/recolher a sidebar ou
 * redimensionar a janela recompõe a órbita sem reiniciar nada.
 *
 * Performance: um único requestAnimationFrame escrevendo transform/opacity/
 * zIndex direto nos nós (zero React state por frame); pausa via
 * IntersectionObserver + visibilitychange; limpeza integral no unmount.
 * prefers-reduced-motion recebe a composição estática inicial.
 */

/** PRNG determinístico (mulberry32) — composição reproduzível para testes. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface OrbitParams {
  /** Ângulo inicial (rad), distribuído pelos quadrantes. */
  a0: number;
  /** Velocidade angular (rad/s), sempre positiva → anti-horário na tela. */
  w: number;
  /** Profundidade base no anel, 0 (interior) a 1 (periferia). */
  rMid: number;
  /** Amplitude da oscilação de profundidade. */
  rAmp: number;
  /** Velocidade angular da oscilação (rad/s). */
  sRad: number;
  /** Fase da oscilação. */
  ph: number;
  /** Largura base do cartão como fração da largura do hero. */
  fracW: number;
}

export function makeOrbitParams(rand: () => number, count: number): OrbitParams[] {
  const params: OrbitParams[] = [];
  for (let i = 0; i < count; i++) {
    params.push({
      a0: (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.6,
      w: (8 + rand() * 16) * (Math.PI / 180),
      rMid: 0.18 + rand() * 0.68,
      rAmp: 0.16 + rand() * 0.18,
      sRad: 0.07 + rand() * 0.1,
      ph: rand() * Math.PI * 2,
      fracW: 0.075 + rand() * 0.05,
    });
  }
  return params;
}

export interface OrbitFrame {
  x: number;
  y: number;
  scale: number;
  opacity: number;
  z: number;
  /** Largura visual do cartão (px) na resolução atual. */
  w: number;
}

/** Estado de um cartão no instante t (ms). Puro — testado em vitest. */
export function orbitFrame(
  tMs: number,
  p: OrbitParams,
  width: number,
  height: number,
): OrbitFrame {
  const t = tMs / 1000;
  // Raios elípticos: o anel interno reserva a área central de leitura
  // (título/subtítulo/CTA); o anel externo alcança a periferia do hero.
  const rxMin = width * 0.5 * 0.42;
  const rxMax = width * 0.5 * 0.94;
  const ryMin = height * 0.5 * 0.46;
  const ryMax = height * 0.5 * 0.88;
  const u = Math.min(1, Math.max(0.05, p.rMid + Math.sin(t * p.sRad + p.ph) * p.rAmp * 0.5));
  const a = p.a0 + p.w * t;
  return {
    x: width / 2 + Math.cos(a) * (rxMin + u * (rxMax - rxMin)),
    y: height / 2 - Math.sin(a) * (ryMin + u * (ryMax - ryMin)),
    scale: 0.55 + 0.45 * u,
    opacity: 0.1 + 0.9 * u * u,
    z: 1 + Math.round(40 * u),
    w: width * p.fracW,
  };
}

interface Props {
  sources: ContactCardSource[];
  cardCount?: number;
  className?: string;
}

export function OrbitingMediaHero({ sources, cardCount = ORBIT_DEFAULTS.cardCount, className }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);

  const cards = useMemo(() => {
    const rand = mulberry32(20261018);
    const params = makeOrbitParams(rand, cardCount);
    return params.map((p, i) => ({ ...p, src: sources[i % sources.length] }));
  }, [sources, cardCount]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let visible = true;
    let w = 0;
    let h = 0;

    const apply = (t: number) => {
      for (let i = 0; i < cards.length; i++) {
        const el = cardsRef.current[i];
        if (!el) continue;
        const f = orbitFrame(t, cards[i], w, h);
        el.style.transform =
          "translate3d(" + f.x.toFixed(1) + "px," + f.y.toFixed(1) + "px,0)" +
          " translate(-50%,-50%)" +
          " scale(" + f.scale.toFixed(3) + ")";
        el.style.opacity = f.opacity.toFixed(3);
        el.style.zIndex = String(f.z);
      }
    };

    const loop = (t: number) => {
      if (!visible) {
        raf = 0;
        return;
      }
      apply(t);
      raf = requestAnimationFrame(loop);
    };

    const measure = () => {
      const rect = root.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      apply(reduced ? 0 : performance.now());
    };

    measure();
    if (!reduced) raf = requestAnimationFrame(loop);

    const ro = new ResizeObserver(measure);
    ro.observe(root);
    const io = new IntersectionObserver((entries) => {
      const nowVisible = entries[0] ? entries[0].isIntersecting : true;
      if (nowVisible && !visible && !reduced && !raf) raf = requestAnimationFrame(loop);
      visible = nowVisible;
    });
    io.observe(root);
    const onVis = () => {
      if (!document.hidden && visible && !reduced && !raf) raf = requestAnimationFrame(loop);
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [cards]);

  return (
    <div className={className ? `orbit ${className}` : "orbit"} ref={rootRef} aria-hidden="true">
      {cards.map((c, i) => (
        <div
          className="orbit__card"
          key={i}
          ref={(el) => { cardsRef.current[i] = el; }}
          style={{ width: `${(c.fracW * 100).toFixed(2)}%`, aspectRatio: `${c.src.ratio}` }}
        >
          <img src={c.src.src} alt="" loading="lazy" decoding="async" />
        </div>
      ))}
    </div>
  );
}
