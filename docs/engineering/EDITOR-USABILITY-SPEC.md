# Editor: seções, palavras e ações de projeto

Versão 03H, IN REVIEW — implementação pendente de conferência humana. Solicitação 2026-10-19, referências visuais do mantenedor. JRN-006/009/011, FR-008/011/012/016/017; BR-005/020/025/026, AC-015 e aceites de navegação/edição. Exclusão antecipada da V1 por solicitação explícita. Sem tela nova ou mudança de identidade. Substitui o contrato anterior de texto sempre expandido.

Aceites: Cancelar usa o botão secundário existente; transcrição agrupada em seções recolhíveis com título extraído do conteúdo, duração e abertura independente; palavra selecionável navega ao tempo real e permite correção mantendo intervalo; seleção acompanha reprodução além do primeiro trecho. Nenhum jargão de modelo, migração ou implementação na UI.

Diagnóstico: alinhamento integral descartava o trecho por uma diferença lexical; tokens de duração zero com espaço eram descartados, permitindo juntar palavras subsequentes; ambos exigem regressão. Alinhamento não inventa divisão proporcional. Seções são extraídas por duração/pausas/pontuação, não resumos semânticos fabricados.

Onda: PCM de áudio real com maior taxa e resolução; envelope min/max denso desenhado em canvas na resolução visível, sem blocos esticados ou aleatoriedade. Cache versionado para invalidar os 600 picos anteriores.

Exclusão: ação explícita nos cards e projeto, confirmação com nome; backend remove projeto, vínculos em coleções, transcrição e apenas mídia gerenciada sem outros projetos. Operação retomável por marcador persistido antes da remoção; limpeza pendente é retomada no próximo início, erro mantém marcador. Sem atomicidade global entre arquivos; dados corrompidos suspendem a operação antes da primeira alteração. Nunca apagar origem ou exports. Bloquear durante transcrição. Menu nativo de navegador bloqueado, eventos de contexto continuam disponíveis ao app.

Modelo: Large v3 Turbo oficial, 1.624.555.275 bytes, SHA-256 1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69. Fonte: https://huggingface.co/ggerganov/whisper.cpp . Contrato CLI/tokens: https://github.com/ggml-org/whisper.cpp/blob/v1.9.5/examples/cli/cli.cpp . Qualidade humana permanece pendente; sem prometer precisão absoluta. Usar contexto limitado e supressão de tokens não falados para reduzir repetições; sem apagar falas automaticamente por heurística.

Tempos: DTW nativo (`-dtw large.v3.turbo`, `-nfa`) em centissegundos; offsets normais continuam em milissegundos. Flag confirmada no help do binário instalado. Converter unidades e preservar fronteiras mesmo quando um token tem duração zero. A UI alinha palavras individualmente, sem invalidar um trecho inteiro por ruído/pontuação. Edição de uma palavra preserva os demais tempos e o intervalo substituído; edição livre de trecho invalida o alinhamento desse trecho.

Onda v2: áudio PCM mono 16 kHz, até 120 picos por segundo com limite de 300 mil; canvas agrupa amplitudes reais para cada coluna visível. Cache anterior invalidado por versão. Sem ASR real, reprodução ou desenho de canvas executados nesta tarefa; testes são de contratos, PCM/arrays, argumentos e markup Node.

Verificação: uma rodada de testes automatizados de contratos, agrupamento, alinhamento, edição/persistência, envelope, exclusão compartilhada/idempotente e bloqueio de contexto; compilação. Repetição apenas para falha/impacto corrigido. Sem app/navegador, conforme instrução permanente do mantenedor. Conferência visual e fala pelo mantenedor.
