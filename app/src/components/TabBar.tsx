interface Tab {
  id: string;
  label: string;
}

interface Props {
  tabs: Tab[];
  active: string;
  onSelect: (id: string) => void;
  /** compact = abas menores do interior de coleção (design, tela 6). */
  compact?: boolean;
}

/** Abas do painel principal com underline teal na ativa (padrão do design 03B). */
export function TabBar({ tabs, active, onSelect, compact = false }: Props) {
  return (
    <div
      className={compact ? "tabbar tabbar--compact" : "tabbar"}
      role="tablist"
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={isActive ? "tabbar__tab tabbar__tab--active" : "tabbar__tab"}
            onClick={() => onSelect(t.id)}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
