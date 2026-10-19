import { useId, useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { SplashLogoArtwork } from "./SplashLogoArtwork";
import { SPLASH_DURATION, splashFrame } from "./splash-motion";

interface Props {
  onComplete: () => void;
}

export function SplashLogo({ onComplete }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const clipId = useId();

  useLayoutEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const mark = svg.querySelector<SVGGElement>("[data-splash-mark]");
    const word = svg.querySelector<SVGGElement>("[data-splash-word]");
    const clip = svg.querySelector<SVGRectElement>("[data-splash-clip]");
    const frame = svg.querySelector<SVGGElement>("[data-splash-frame]");
    if (!mark || !word || !clip || !frame) return;

    const apply = (time: number) => {
      const value = splashFrame(time);
      mark.setAttribute("transform", `translate(${value.markX} 0)`);
      mark.setAttribute("opacity", String(value.markOpacity));
      word.setAttribute("transform", `translate(${value.wordX} 0)`);
      clip.setAttribute("x", String(value.clipX));
      frame.setAttribute("opacity", String(value.frameOpacity));
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      apply(SPLASH_DURATION);
      onComplete();
      return;
    }

    const clock = { time: 0 };
    apply(0);
    const tween = gsap.to(clock, {
      time: SPLASH_DURATION,
      duration: SPLASH_DURATION,
      ease: "none",
      onUpdate: () => apply(clock.time),
      onComplete,
    });
    return () => { tween.kill(); };
  }, [onComplete]);

  return (
    <svg ref={ref} className="splash__logo" viewBox="0 0 507.429 96" fill="none"
      width={507} height={96} role="img" aria-label="CutNicePro">
      <SplashLogoArtwork clipId={clipId} />
    </svg>
  );
}
