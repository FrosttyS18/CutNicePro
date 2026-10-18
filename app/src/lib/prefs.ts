/** Preferências locais da UI (persistência leve, sem IPC). */

const SIDEBAR_KEY = "cnp.sidebar.expanded";

/** Sidebar começa expandida (padrão do design); a escolha do usuário persiste. */
export function loadSidebarExpanded(): boolean {
  try {
    const v = localStorage.getItem(SIDEBAR_KEY);
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

export function saveSidebarExpanded(expanded: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_KEY, expanded ? "1" : "0");
  } catch {
    // localStorage indisponível: preferência só vive na sessão.
  }
}
