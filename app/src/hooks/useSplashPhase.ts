import { useCallback, useEffect, useState } from "react";
import { releaseIntroGate } from "../components/galaxy/intro-gate";

export function useSplashPhase(bootReady: boolean) {
  const [visible, setVisible] = useState(true);
  const [animationComplete, setAnimationComplete] = useState(false);
  const [reducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const leaving = bootReady && animationComplete;
  const onAnimationComplete = useCallback(() => setAnimationComplete(true), []);

  useEffect(() => {
    if (!leaving) return;
    const finish = () => {
      setVisible(false);
      releaseIntroGate();
    };
    if (reducedMotion) {
      releaseIntroGate();
      return;
    }
    const timer = window.setTimeout(finish, 270);
    return () => window.clearTimeout(timer);
  }, [leaving,reducedMotion]);

  return { visible: visible && !(leaving && reducedMotion), leaving, onAnimationComplete };
}
