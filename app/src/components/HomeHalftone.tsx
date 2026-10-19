import { useEffect, useRef } from "react";
import HalftoneWordmarkFooter from "./HalftoneWordmarkFooter";

const WORDMARK = "CutNicePro";
const FONT_STACK = "Poppins, 'Helvetica Neue', Arial, sans-serif";
const CROP = 0.2;
/** Teto da região inferior: a tipografia nunca engole o hero (missão 03B.4). */
const MAX_HEIGHT_FACTOR = 0.3;

/**
 * Integração do HalftoneWordmarkFooter ORIGINAL à Home do CutNicePro.
 *
 * Full-bleed 03B.4: o wordmark é dimensionado PELA LARGURA (com o leve
 * overscan do componente original) e a ALTURA da região é DERIVADA das
 * métricas reais da fonte — não é mais uma faixa fixa que esmagava a
 * tipografia no ultrawide. Um teto de 30% da altura da Home protege o
 * conteúdo central. Personalização apenas por props; a física (molas,
 * repulsão, onda, grain) permanece a do código original.
 */
export function HomeHalftone({ className }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const home = el.closest(".home") ?? el;

    const fit = () => {
      const w = el.clientWidth;
      if (!w) return;
      const m = document.createElement("canvas").getContext("2d");
      if (!m) return;
      m.font = `800 100px ${FONT_STACK}`;
      const measured = m.measureText(WORDMARK).width;
      if (measured <= 0) return;
      const fs = ((w * 1.02) / measured) * 100;
      m.font = `800 ${fs}px ${FONT_STACK}`;
      const box = m.measureText(WORDMARK);
      const cap = box.actualBoundingBoxAscent || fs * 0.72;
      const visible = cap * (1 - CROP);
      const maxH = Math.max(96, home.clientHeight * MAX_HEIGHT_FACTOR);
      el.style.height = `${Math.ceil(Math.min(visible, maxH))}px`;
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(home);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(fit).catch(() => {});
    }
    return () => ro.disconnect();
  }, []);

  return (
    <div className={className ? `home-halftone ${className}` : "home-halftone"} ref={wrapRef}>
      <HalftoneWordmarkFooter
        wordmark={WORDMARK}
        label=""
        meta=""
        columns={[]}
        backToTop={false}
        preset="night"
        palette={{ warm: "#02C2BE", background: "#0A0A0A" }}
        fontFamily={FONT_STACK}
        fontWeight={800}
        height="100%"
        interactive={true}
        transparent={true}
      />
    </div>
  );
}
