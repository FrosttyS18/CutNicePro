import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Titlebar personalizada (Fase 03B.9) — substitui a barra nativa do Windows
 * (decorations: false no tauri.conf.json). Sem marca/texto; apenas três
 * controles à direita (minimizar / maximizar-restaurar / fechar) e área
 * livre arrastável (data-tauri-drag-region + duplo clique alterna
 * maximizar). Global: montada fora da Home, acima do AppShell.
 */
export function WindowTitlebar() {
  const win = getCurrentWindow();

  return (
    <div className="titlebar" role="toolbar" aria-label="Controles da janela">
      <div
        className="titlebar__drag"
        data-tauri-drag-region
        onDoubleClick={() => void win.toggleMaximize()}
      />
      <div className="titlebar__controls">
        <button
          type="button"
          className="titlebar__btn"
          aria-label="Minimizar"
          title="Minimizar"
          onClick={() => void win.minimize()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <button
          type="button"
          className="titlebar__btn"
          aria-label="Maximizar ou restaurar"
          title="Maximizar ou restaurar"
          onClick={() => void win.toggleMaximize()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <button
          type="button"
          className="titlebar__btn titlebar__btn--close"
          aria-label="Fechar"
          title="Fechar"
          onClick={() => void win.close()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
      </div>
    </div>
  );
}
