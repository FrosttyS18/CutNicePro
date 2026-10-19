import { useCallback, useEffect, useState } from "react";
import { releaseIntroGate } from "../components/galaxy/intro-gate";

export function useSplashPhase(bootReady: boolean) {
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [animationComplete, setAnimationComplete] = useState(false);
  const onAnimationComplete = useCallback(() => setAnimationComplete(true), []);

  useEffect(() => {
    if (!bootReady || !animationComplete) return;
    const finish = () => {
      setVisible(false);
      releaseIntroGate();
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }
    setLeaving(true);
    const timer = window.setTimeout(finish, 270);
    return () => window.clearTimeout(timer);
  }, [bootReady, animationComplete]);

  return { visible, leaving, onAnimationComplete };
}
