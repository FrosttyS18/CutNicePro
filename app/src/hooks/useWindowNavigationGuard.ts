import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { NavigationGuard } from "../lib/navigation-guard";

export function useWindowNavigationGuard(guard: NavigationGuard, onError: (message: string) => void): void {
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!guard.hasUnsavedChanges()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    let active = true;
    let unlisten: (() => void) | undefined;
    if (isTauri()) {
      void getCurrentWindow().onCloseRequested(async event => {
        if (!guard.hasUnsavedChanges()) return;
        try {
          const allowed = await guard.requestNavigation(() => undefined);
          if (!allowed) event.preventDefault();
        } catch (error) {
          event.preventDefault();
          if (active) onError(error instanceof Error ? error.message : "Não foi possível verificar as alterações antes de fechar.");
        }
      }).then(stop => { if (active) unlisten = stop; else stop(); }).catch(error => {
        if (active) onError(error instanceof Error ? error.message : "Não foi possível proteger o fechamento desta janela.");
      });
    }
    return () => { active = false; unlisten?.(); window.removeEventListener("beforeunload", beforeUnload); };
  }, [guard, onError]);
}
