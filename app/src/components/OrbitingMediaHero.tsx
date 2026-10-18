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
 *   - órbita anti-horária com raio, ângulo e velocidade angular próprios por
 *     cartão (movimento não uniforme, trajetória contínua);
 *   - escala e opacidade crescem com o raio aparente: pequenos e esmaecidos
 *     no centro ("fantasmas" que atravessam a área do título), grandes e
 *     opacos na periferia (profundidade por z-order);
 *   - cartões frontais, cantos arredondados, sem rotação 3D — como observado;
 *   - SEM reação ao cursor: nenhum efeito de ponteiro foi confirmado na
 *     referência, e a missão proíbe inventar interações.
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
  /** Ângulo inicial (rad). */
  a0: number;
  /** Velocidade angular (rad/s), sempre positiva → anti-horário na tela. */
  w: number;
  /** Raio médio, fração do span [rMin..rMax]. */
  rMid: number;
  /** Amplitude da oscilação do raio, no span. */
  rAmp: number;
  /** Velocidade angular da oscilação do raio (rad/s). */
  sRad: number;
  /** Fase da oscilação do raio. */
  ph: number;
  /** Altura base do cartão (px). */
  baseH: number;
}

export function makeOrbitParams(rand: () => number, count: number): OrbitParams[] {
  const params: OrbitParams[] = [];
  for (let i = 0; i < count; i++) {
    params.push({
      a0: (i / count) * Math.PI * 2 + rand() * 0.5,
      w: (10 + rand() * 20) * (Math.PI / 180),
      rMid: 0.3 + rand() * 0.4,
      rAmp: 0.25 + rand() * 0.2,
      sRad: 0.08 + rand() * 0.12,
      ph: rand() * Math.PI * 2,
      baseH: 96 + rand() * 54,
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
}

/** Estado de um cartão no instante t (ms). Puro — testado em vitest. */
export function orbitFrame(
  tMs: number,
  p: OrbitParams,
  width: number,
  height: number,
  rMinFactor: number,
  rMaxFactor: number,
): OrbitFrame {
  const t = tMs / 1000;
  const span = Math.min(width, height);
  const rMin = rMinFactor * span;
  const rMax = rMaxFactor * span;
  const r = Math.min(
    rMax,
    Math.max(rMin, (rMin + p.rMid * (rMax - rMin)) + Math.sin(t * p.sRad + p.ph) * p.rAmp * (rMax - rMin) * 0.5),
  );
  const a = p.a0 + p.w * t;
  const u = (r - rMin) / Math.max(1, rMax - rMin); // 0 no centro, 1 na periferia
  const cu = Math.min(1, Math.max(0, u));
  return {
    x: width / 2 + r * Math.cos(a),
    y: height / 2 - r * Math.sin(a),
    scale: 0.45 + 0.75 * cu,
    opacity: 0.12 + 0.88 * cu * cu,
    z: 1 + Math.round(40 * cu),
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
        const f = orbitFrame(t, cards[i], w, h, ORBIT_DEFAULTS.rMinFactor, ORBIT_DEFAULTS.rMaxFactor);
        const cw = cards[i].baseH * cards[i].src.ratio;
        el.style.transform =
          "translate3d(" + (f.x - cw / 2).toFixed(1) + "px," + (f.y - cards[i].baseH / 2).toFixed(1) + "px,0)" +
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
        <div className="orbit__card" key={i} ref={(el) => { cardsRef.current[i] = el; }}>
          <img src={c.src.src} alt="" width={Math.round(c.baseH * c.src.ratio)} height={Math.round(c.baseH)} loading="lazy" decoding="async" />
        </div>
      ))}
    </div>
  );
}
