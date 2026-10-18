import type { ReactNode } from "react";
import { IconHome, IconProjects, IconSettings, IconSidePanel } from "../icons";
import { Breadcrumb, type Crumb } from "./Breadcrumb";
import avatarUrl from "../../assets/avatar-perfil.png";
import logoSidebarUrl from "../../assets/logo-sidebar.svg";

export type ShellSection = "home" | "projects";
export type ProjectsSub = "all" | "collections";

interface Props {
  expanded: boolean;
  onToggleExpanded: () => void;
  section: ShellSection;
  projectsSub: ProjectsSub;
  crumbs: Crumb[];
  onNavigateHome: () => void;
  onNavigateProjects: (sub: ProjectsSub) => void;
  children: ReactNode;
}

/**
 * Shell oficial 03B: rail de ícones (92px, altura total) + painel secundário
 * (269px, apenas no estado expandido) + painel principal (r20, #0A0A0A).
 * O clique no logo do rail alterna expandido/recolhido (preferência persistida
 * pelo App); o ícone da seção ativa fica teal.
 */
export function AppShell({
  expanded,
  onToggleExpanded,
  section,
  projectsSub,
  crumbs,
  onNavigateHome,
  onNavigateProjects,
  children,
}: Props) {
  return (
    <div className="shell">
      <aside className="rail">
        <img className="rail__avatar" src={avatarUrl} alt="Foto de perfil" width={42} height={42} />
        <button
          type="button"
          className={section === "home" ? "rail__btn rail__btn--active" : "rail__btn"}
          onClick={onNavigateHome}
          aria-label="Início"
          aria-current={section === "home" ? "page" : undefined}
          title="Início"
        >
          <IconHome size={24} />
        </button>
        <button
          type="button"
          className={section === "projects" ? "rail__btn rail__btn--active" : "rail__btn"}
          onClick={() => onNavigateProjects("all")}
          aria-label="Meus Projetos"
          aria-current={section === "projects" ? "page" : undefined}
          title="Meus Projetos"
        >
          <IconProjects size={24} />
        </button>
        <div className="rail__spacer" />
        <button type="button" className="rail__btn rail__btn--disabled" disabled aria-label="Configurações" title="Configurações">
          <IconSettings size={24} />
        </button>
        <div className="rail__divider" aria-hidden="true" />
        <div className="rail__logo">
          <img src={logoSidebarUrl} alt="" width={49} height={41} aria-hidden="true" />
        </div>
      </aside>

      <nav
        id="side-panel"
        className={expanded ? "side-panel side-panel--open" : "side-panel"}
        aria-label="Seções"
      >
        {section === "home" ? (
          <>
            <h2 className="side-panel__title">Home</h2>
            <button
              type="button"
              className="side-panel__pill side-panel__pill--active"
              onClick={onNavigateHome}
            >
              Início
            </button>
          </>
        ) : (
          <>
            <h2 className="side-panel__title">Meus Projetos</h2>
            <button
              type="button"
              className={
                projectsSub === "all"
                  ? "side-panel__pill side-panel__pill--active"
                  : "side-panel__pill"
              }
              onClick={() => onNavigateProjects("all")}
            >
              Todos
            </button>
            <button
              type="button"
              className={
                projectsSub === "collections"
                  ? "side-panel__pill side-panel__pill--active"
                  : "side-panel__pill"
              }
              onClick={() => onNavigateProjects("collections")}
            >
              Coleções
            </button>
          </>
        )}
      </nav>

      <main className={expanded ? "shell-main shell-main--expanded" : "shell-main"}>
        <div className="panel">
          <div className="panel-head">
            <button
              type="button"
              className="panel-toggle"
              onClick={onToggleExpanded}
              aria-label={expanded ? "Recolher barra lateral" : "Expandir barra lateral"}
              aria-expanded={expanded}
              aria-controls="side-panel"
              title={expanded ? "Recolher barra lateral" : "Expandir barra lateral"}
            >
              <IconSidePanel size={16} />
            </button>
            <Breadcrumb crumbs={crumbs} />
          </div>
          <div className="panel-body">{children}</div>
        </div>
      </main>
    </div>
  );
}
