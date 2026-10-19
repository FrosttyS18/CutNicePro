# 03M — Confiabilidade de clipes e processamento

Estado: IN REVIEW, autorizado por /start em 2026-10-19. Extensão das jornadas JRN-003/006/007/008/009/010, FR-008..014/016/022 e BR-019..023/026..031. Não promove artefatos visuais a aprovados.

## SPEC e aceites

Revisão documental 03N após teste do mantenedor: os testes 03M cobrem contratos/processamento e não aprovam qualidade editorial, composição ou precisão ASR. Análise exibida permanece técnica/metalinguística; clipes 9:16 usam contain e podem ter faixas. Correções desses resultados e retirada de Large completo (DEC-014) estão registradas como pendentes, sem alteração de código nesta etapa. Estudo dos fluxos open-source deve preceder a próxima implementação, conforme documento de pesquisa existente.

- AC-03M-01: abrir corte salvo executa somente leitura/reprodução; análise explícita não abre progresso de geração em outro componente.
- AC-03M-02: rejeição confirmada pelo backend fecha a inspeção, atualiza contagem e remove o corte da lista ativa; Rejeitados permite consultar o registro. Nunca apaga a mídia original. Falha mantém a janela e informa o erro.
- AC-03M-03: evidências da análise referenciam IDs da fala; o backend constrói citações da fonte, sem exigir reprodução literal pelo modelo. Um erro de análise não descarta todos os cortes válidos.
- AC-03M-04: seleção semântica cobre toda a transcrição em janelas sobrepostas antes da seleção final; frequência de palavras/cadência não elimina candidatos antes de a IA ler seu conteúdo.
- AC-03M-05: inferência textual utiliza GPU detectada e memória disponível com fallback sequencial em CPU; validar aceleração real, não só presença de binário.
- AC-03M-06: transcrição longa tem checkpoints validados por mídia/modelo/configuração; falha/cancelamento mantém blocos concluídos e resultado publicado anterior; retomada evita retranscrever blocos válidos e preserva tempos absolutos.
- AC-03M-07: detecção visual limitada às regiões de candidatos; não percorrer podcast inteiro para pontuar poucos cortes.
- AC-03M-08: NVENC só é escolhido após teste real do encoder; falha de hardware permite uma tentativa em libx264, sem publicar saída parcial.

## PLAN

Regras aplicadas: BR-03M-01 abertura somente de leitura e jobs por operação; BR-03M-02 revisão reversível com confirmação de persistência, sem apagar origem; BR-03M-03 evidências montadas da fonte e falha parcial explícita, sem nota inventada; BR-03M-04 checkpoints por mídia/modelo/configuração, sem substituir transcrição publicada após falha/cancelamento; BR-03M-05 exclusividade do processamento, fallback sequencial e publicação apenas da saída validada. Regras de implementação em IN REVIEW, rastreadas nos documentos de produto.

1. Remover processamento automático na inspeção e separar posse dos jobs; rejeição e estados de revisão.
2. Conferir documentação oficial Opus/llama.cpp/FFmpeg/Whisper e instalar aceleração local isolada.
3. Seleção semântica com cobertura completa, evidências por referência e tolerância a falha por clipe.
4. Transcrição em blocos com cache de retomada; cenas regionais e encoder com sondagem real.
5. Testes relacionados e execuções reais delimitadas em fixtures do workspace; registrar resultados e limites.

## TEST

Testar leitura sem efeitos, posse do job, sucesso/falha da rejeição, filtro e contagem; IDs de evidência inválidos; cobertura de janelas e limites; persistência parcial sem notas fictícias; cache e tempos nos limites de blocos; cancelamento/retomada; regiões de cena e argumentos dos encoders. Exercitar GPU textual, geração de múltiplos cortes, transcrição retomada e exportação reais. Uma rodada inicial e uma repetição apenas por falha ou alteração justificada, sem repetir aprovados para ampliar evidência. Sem automação visual do aplicativo; estética depende do mantenedor.
