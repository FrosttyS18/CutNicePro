# Conferência do mantenedor — editor e cortes

Sem automação visual ou controle do aplicativo nesta entrega. Reinicie o app
no ambiente de desenvolvimento para carregar os novos comandos nativos.

1. Abra um vídeo já transcrito. Em Ferramentas, abra Legendas. Arraste pelo
   cabeçalho, inclusive até as bordas; textos dos controles não devem selecionar.
   Campos de texto continuam selecionáveis. Mude estilo e observe a prévia;
   a janela permite interagir com o vídeo enquanto permanece aberta.
2. Clique no centro do vídeo para reproduzir/pausar. Depois use Espaço; ao
   editar um campo, Espaço deve digitar normalmente. Experimente início/fim
   e clique nas palavras como antes.
3. Altere a proporção na barra sobre o vídeo; use Preencher e Enquadrar para
   mover a área visível pelos controles horizontal/vertical. Recortar leva
   aos campos de início/fim, que delimitam o trecho exportado.
4. Em Ferramentas, inicie uma transcrição. Confira Transcrevendo…, efeito de
   pontos e porcentagem crescente em passos de um até o último progresso
   recebido. Em silêncio de callbacks ela para; não prevê avanço do motor.
   Tanto Cancelar quanto X/Escape pedem confirmação. Continuar preserva o job;
   confirmar interrompe, mantendo a transcrição anterior. Confira também retry.
5. Gere até 3 cortes de até 1 minuto em um vídeo com fala suficiente. Aguarde
   a análise real. Confira nota/justificativas, prévia/edição no trecho, filtro,
   ordenação e Aprovar/Rejeitar reversíveis. Não existe garantia de viralização.
6. Exporte um corte aprovado. Escolha um destino e reproduza o MP4 salvo;
   confira corte, proporção, enquadramento, áudio e legenda gravada. Cancelar
   não deve substituir um arquivo de destino existente. Exportação sem uma
   transcrição também funciona, sem legendas.
7. Salve, feche e reabra: transcrição, sugestões, aprovação e corte ativo devem
   permanecer. Voltar ao vídeo completo libera o intervalo original.

Limites explícitos: seleção é heurística explicável com cenas e fala, sem LLM;
sem detecção/rastreamento de rostos, sem garantia de ganchos semanticamente
ótimos. Não há histórico de versões por corte, lote ou retomada de job após
crash. Scratch é limpo em saída normal/cancelamento; encerramento forçado pode
deixar temporários próprios, nunca um MP4 final incompleto marcado como sucesso.
FFmpeg portátil é apenas de desenvolvimento; instalador/bundling permanecem
fora do escopo. Revisão e qualidade dos vídeos reais são do mantenedor.
