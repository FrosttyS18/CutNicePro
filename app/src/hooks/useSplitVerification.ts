import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { EditorSettings } from "../lib/workspace-types";
import { verifySplitSettings, type SplitFramingSource } from "../services/split-framing";

export function useSplitVerification(settings: EditorSettings, source: SplitFramingSource | undefined, onSettings: (patch: Partial<EditorSettings>) => void) {
  const [notice, setNotice] = useState<string | null>(null);
  const callback = useRef(onSettings);
  const input = useRef({ settings, source });
  useLayoutEffect(() => { callback.current = onSettings; input.current = { settings, source }; }, [onSettings, settings, source]);
  const key = JSON.stringify([source, settings.splitScreen]);
  useEffect(() => {
    const { settings, source } = input.current;
    if (!source || !settings.splitScreen || settings.splitScreen.faceValidated) return;
    let disposed = false;
    setNotice("Confirmando duas pessoas na composição anterior…");
    void verifySplitSettings(settings, source).then(result => {
      if (disposed) return;
      callback.current({ splitScreen: result.settings.splitScreen });
      setNotice(result.notice ?? null);
    }).catch(() => {
      if (!disposed) {
        callback.current({ splitScreen: null });
        setNotice("Não foi possível confirmar duas pessoas. O quadro único foi mantido; tente localizar novamente em Enquadrar.");
      }
    });
    return () => { disposed = true; };
  }, [key]);
  return notice;
}
