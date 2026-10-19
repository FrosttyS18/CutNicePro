import { useEffect, useState } from "react";
import { nextProgress } from "../lib/progress-display";

export function useMeasuredProgress(jobId: string, measured: number) {
  const [display, setDisplay] = useState({ id: jobId, value: 0 });
  const target = Number.isFinite(measured) ? Math.max(0,Math.min(100,Math.floor(measured))) : 0;
  const value = display.id === jobId ? Math.min(display.value, target) : 0;
  useEffect(() => {
    if (!target) return;
    const timer = window.setInterval(() => setDisplay(previous => {
      const current = previous.id === jobId ? previous.value : 0;
      const next = nextProgress(current, target);
      if (next >= target) window.clearInterval(timer);
      return previous.id === jobId && previous.value === next ? previous : { id: jobId, value: next };
    }), 35);
    return () => window.clearInterval(timer);
  }, [jobId, target]);
  return value;
}
