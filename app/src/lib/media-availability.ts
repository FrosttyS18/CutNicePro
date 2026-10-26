import type { MediaEntryDto } from "./ipc";

export function canRelinkMedia(entry: MediaEntryDto | null | undefined): boolean {
  if (!entry) return false;
  return entry.storageKind === "reference" || (entry.availability ?? (entry.unavailable ? "missing" : "available")) === "missing";
}

export function unavailableMediaMessage(entry: MediaEntryDto | null, name: string): string {
  if (!entry) return `Mídia não encontrada: ${name}. Importe o arquivo novamente.`;
  if (entry.availability === "changed") return `O arquivo original de ${name} foi alterado. Suas edições foram preservadas. Localize uma cópia idêntica ao original para reconectar.`;
  if (entry.availability === "inaccessible") return `Não foi possível acessar ${name}. Verifique as permissões ou a disponibilidade da unidade.`;
  return `Mídia indisponível: ${name}. O arquivo está ausente do disco. Reconecte o arquivo original.`;
}
