export function transcriptionMessage(error: unknown): string {
  const detail = String(error).toLocaleLowerCase("pt-BR");
  if (/out of memory|cuda.*alloc|cublas.*alloc/.test(detail)) return "Não há memória livre suficiente na placa de vídeo. Tente novamente marcando Usar apenas o processador.";
  if (detail.includes("cancelada")) return "Transcrição cancelada. Seu vídeo foi mantido.";
  if (detail.includes("sem áudio") || detail.includes("não tem áudio") || detail.includes("faixa de áudio")) {
    return "Este vídeo não tem áudio para transcrever. Escolha um vídeo com fala.";
  }
  if (detail.includes("ausente do disco") || detail.includes("vídeo não está disponível")) {
    return "O arquivo de vídeo não foi encontrado. Importe o vídeo novamente.";
  }
  if (detail.includes("posiç") || detail.includes("sincron") || detail.includes("tempo inválido") || detail.includes("fora da duração")) {
    return "Não foi possível sincronizar a transcrição com o vídeo. Tente novamente.";
  }
  if (detail.includes("já existe uma transcrição")) return "Outro vídeo está sendo transcrito. Aguarde a conclusão e tente novamente.";
  if (detail.includes("tempo limite")) return "A transcrição demorou mais que o esperado. Tente novamente com um vídeo menor.";
  if (["modelo", "motor", "ffmpeg", "whisper", "diagnóstico"].some(word => detail.includes(word))) {
    return "Não foi possível iniciar a transcrição. Verifique a instalação do aplicativo e tente novamente.";
  }
  return "Não foi possível transcrever este vídeo. Tente novamente.";
}
