export interface Crumb {
  label: string;
  navigate?: () => void;
}

interface Props {
  crumbs: Crumb[];
}

/**
 * Breadcrumb do painel principal: Seção > … > Atual.
 * Crumbs anteriores são botões (navegação); o atual é texto branco.
 * (03B.3: o glifo inicial foi promovido a botão de expandir/recolher a
 * sidebar, posicionado antes deste breadcrumb no AppShell.)
 */
export function Breadcrumb({ crumbs }: Props) {
  return (
    <nav className="breadcrumb" aria-label="Trilha de navegação">
      <ol className="breadcrumb__list">
        {crumbs.map((c, i) => {
          const current = i === crumbs.length - 1;
          return (
            <li className="breadcrumb__item" key={`${c.label}-${i}`}>
              {i > 0 && (
                <span className="breadcrumb__sep" aria-hidden="true">
                  &gt;
                </span>
              )}
              {current || !c.navigate ? (
                <span className="breadcrumb__label breadcrumb__label--current" aria-current="page">
                  {c.label}
                </span>
              ) : (
                <button type="button" className="breadcrumb__label breadcrumb__label--link" onClick={c.navigate}>
                  {c.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
