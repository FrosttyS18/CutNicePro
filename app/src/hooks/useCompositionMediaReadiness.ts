import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { CompositionReadiness } from "../lib/composition-readiness";

export function useCompositionReadiness(keys: string[], onReady?: (ready: boolean) => void): CompositionReadiness {
  const tracker = useMemo(() => new CompositionReadiness(), []);
  useLayoutEffect(() => { tracker.listen(onReady); return () => tracker.listen(); }, [onReady, tracker]);
  useLayoutEffect(() => {
    tracker.expect(keys); tracker.activate();
    return () => tracker.deactivate();
  }, [keys, tracker]);
  return tracker;
}

export function useCompositionMediaReadiness(
  ref: RefObject<HTMLMediaElement | HTMLImageElement | null>, key: string, tracker: CompositionReadiness, intention: boolean,
) {
  const probe = useRef<(() => void) | null>(null);
  const fail = useRef<(() => void) | null>(null);
  const reset = useRef<(() => void) | null>(null);
  const checkReady = useCallback(() => probe.current?.(), []);
  const failReady = useCallback(() => fail.current?.(), []);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const source = tracker.observe(key, element.tagName === "IMG" ? undefined : () => {
      const media = element as HTMLMediaElement;
      if (!media.paused) media.pause();
    });
    let blocked = false;
    let failed = false;
    let latched = false;
    const check = () => {
      const current = !element.currentSrc || element.currentSrc === element.src;
      if (element.tagName === "IMG") {
        const image = element as HTMLImageElement;
        source.report(!failed && current && image.complete && image.naturalWidth > 0);
      } else {
        const media = element as HTMLMediaElement;
        const available = media.ended ? media.readyState >= 2 : !blocked && media.readyState >= 3;
        source.report(!failed && !media.error && current && available && !media.seeking);
      }
    };
    const markFailed = () => { failed = true; latched = true; source.report(false); };
    const resetFailure = () => { if (latched) { latched = false; failed = false; } check(); };
    const update = (event: Event) => {
      if (event.type === "error") { failed = true; source.report(false); return; }
      if (["waiting", "seeking", "emptied"].includes(event.type)) blocked = true;
      if (["load", "loadedmetadata", "loadeddata", "canplay", "canplaythrough", "playing", "seeked"].includes(event.type)) { blocked = false; if (!latched) failed = false; }
      check();
    };
    const events = ["load", "error", "emptied", "loadedmetadata", "loadeddata", "canplay", "canplaythrough", "waiting", "stalled", "seeking", "seeked", "pause", "playing", "ended"];
    events.forEach(event => element.addEventListener(event, update));
    probe.current = check; fail.current = markFailed; reset.current = resetFailure; check();
    return () => {
      events.forEach(event => element.removeEventListener(event, update));
      source.release();
      if (probe.current === check) probe.current = null;
      if (fail.current === markFailed) fail.current = null;
      if (reset.current === resetFailure) reset.current = null;
    };
  }, [key, ref, tracker]);
  useEffect(() => { reset.current?.(); }, [intention]);
  return { checkReady, failReady };
}
