import { useLayoutEffect } from "react";
import gsap from "gsap";
import {
  INTRO_SEEN_KEY,
  introClock,
  introTuner,
  onIntroReplay,
} from "./intro";
import { introGateReleased, onIntroGateReady } from "./intro-gate";
import { galaxyMotionTuner } from "./hero-galaxy-tunables";

const SEEN_KEY = "cnp-intro-session";

const TARGETS = [".home__rise", ".home__subtitle .home__fade", ".home__cta-slot"];

export default function IntroConductor() {
  useLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const settle = () => {
      gsap.set(TARGETS, { opacity: 1, y: 0 });
    };

    const buildTimeline = () =>
      gsap
        .timeline({ paused: true })
        .to(".home__rise", { opacity: 1, y: 0, duration: 1.0, ease: "power3.out" }, 0.25)
        .to(".home__subtitle .home__fade", { opacity: 1, y: 0, duration: 0.65, ease: "power3.out" }, 1.2)
        .to(".home__cta-slot", { opacity: 1, y: 0, duration: 0.65, ease: "power3.out" }, 1.8);

    let tl: gsap.core.Timeline | null = null;
    let raf = 0;
    let last = 0;
    let started = false;

    const stopDriver = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const finish = () => {
      introClock.done = true;
      if (started) {
        try {
          sessionStorage.setItem(SEEN_KEY, "1");
          localStorage.setItem(INTRO_SEEN_KEY, "1");
        } catch {
          // Storage indisponível — a próxima abertura repete a apresentação.
        }
      }
    };

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      introClock.t += dt;
      if (tl) tl.time(Math.min(introClock.t, tl.duration()), true);
      const iv = introTuner.read();
      const mv = galaxyMotionTuner.read();
      const tail = iv.cardsAt + mv.waveLag + mv.introDur;
      if (introClock.t >= tail + 0.1) {
        finish();
        stopDriver();
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    const beginPresentation = () => {
      if (raf) return;
      started = true;
      introClock.t = 0;
      introClock.done = false;
      introClock.scale = 1;
      gsap.set(TARGETS, { opacity: 0, y: 16 });
      tl = buildTimeline();
      tl.time(0, true);
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };

    const offReplay = onIntroReplay(() => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (!introGateReleased()) return;
      stopDriver();
      if (tl) {
        tl.kill();
        tl = null;
      }
      beginPresentation();
    });

    let offGate: (() => void) | null = null;

    if (reduce) {
      introClock.t = 999;
      introClock.done = true;
      introClock.scale = 1;
      settle();
    } else {
      gsap.set(TARGETS, { opacity: 0, y: 16 });
      introClock.t = 0;
      introClock.done = false;
      offGate = onIntroGateReady(beginPresentation);
    }

    return () => {
      offReplay();
      if (offGate) offGate();
      stopDriver();
      if (tl) {
        tl.kill();
        tl = null;
      }
      settle();
      introClock.t = 999;
    };
  }, []);

  return null;
}
