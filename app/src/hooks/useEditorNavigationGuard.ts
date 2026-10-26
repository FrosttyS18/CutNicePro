import { useEffect, useLayoutEffect, useRef } from "react";
import type { UnsavedWork } from "../lib/navigation-guard";
import { useNavigationGuard } from "./useNavigationGuard";

export function useEditorNavigationGuard(source: UnsavedWork): void {
  const guard = useNavigationGuard();
  const latest = useRef(source);
  useLayoutEffect(() => { latest.current = source; }, [source]);
  useEffect(() => guard?.register({
    hasUnsavedChanges: () => latest.current.hasUnsavedChanges(),
    save: () => latest.current.save(),
    discard: () => latest.current.discard(),
    onPause: () => latest.current.onPause?.(),
  }), [guard]);
}
