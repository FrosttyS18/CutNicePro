interface Props {
  onCreate: () => void;
}

export function EmptyState({ onCreate }: Props) {
  return (
    <div className="empty" data-testid="empty-state">
      <div className="empty__glyph" aria-hidden="true">
        ▸
      </div>
      <p className="empty__title">Nenhum projeto ainda</p>
      <p className="empty__text">
        Crie seu primeiro projeto para começar a importar vídeos e gerar cortes
        inteligentes no CutNicePro.
      </p>
      <button className="btn btn--primary" onClick={onCreate} data-testid="create-first-project">
        + Criar projeto
      </button>
    </div>
  );
}
