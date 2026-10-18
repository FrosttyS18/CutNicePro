interface Props {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onRetry, onDismiss }: Props) {
  return (
    <div className="state-banner state-banner--error" role="alert">
      <span className="state-banner__text">{message}</span>
      {onRetry && (
        <button className="btn btn--ghost" onClick={onRetry}>
          Tentar novamente
        </button>
      )}
      {onDismiss && (
        <button className="btn btn--ghost" onClick={onDismiss}>
          Fechar
        </button>
      )}
    </div>
  );
}
