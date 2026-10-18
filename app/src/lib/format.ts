/** Funções puras de formatação (pt-BR) — testadas em vitest. */

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
