import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { NavigationGuard } from "../lib/navigation-guard";

export function useWindowNavigationGuard(guard: NavigationGuard, onError: (message: string) => void): void {
  useEffect(() => {
    let active = true;
    let closing = false;
    let unlisten: (() => void) | undefined;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!guard.hasUnsavedChanges()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const cleanup = () => {
      if (!active) return;
      active = false;
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("unload", cleanup);
      const stop = unlisten;
      unlisten = undefined;
      if (stop) void Promise.resolve(stop()).catch(() => undefined);
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("unload", cleanup);
    if (isTauri()) {
      const nativeWindow = getCurrentWindow();
      void nativeWindow.onCloseRequested(async event => {
        event.preventDefault();
        if (!active || closing) return;
        closing = true;
        try {
          const allowed = await guard.requestNavigation(() => undefined);
          if (!active || !allowed) return;
          if (guard.hasUnsavedChanges()) {
            onError("Há alterações novas no rascunho. Salve novamente antes de fechar.");
            return;
          }
          try { await nativeWindow.destroy(); }
          catch (error) {
            console.warn("[CutNicePro:window:destroy]", error);
            if (active) onError("Não foi possível fechar a janela. Salve suas alterações e tente novamente.");
          }
        } catch (error) {
          console.warn("[CutNicePro:window:guard]", error);
          if (active) onError(error instanceof Error ? error.message : "Não foi possível verificar as alterações antes de fechar.");
        } finally {
          closing = false;
        }
      }).then(stop => { if (active) unlisten = stop; else return stop(); }).catch(error => {
        console.warn("[CutNicePro:window:listen]", error);
        if (active) onError(error instanceof Error ? error.message : "Não foi possível proteger o fechamento desta janela.");
      });
    }
    return cleanup;
  }, [guard, onError]);
}
