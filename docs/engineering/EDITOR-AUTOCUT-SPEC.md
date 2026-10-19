# Editor e cortes automáticos — 2026-10-19 — IN REVIEW

Escopo autorizado pelo /start: janela móvel de legendas, reprodução por clique,
controles de enquadramento/corte, ferramentas consistentes, progresso mensurável
suavizado com confirmação de cancelamento e geração/revisão/exportação de cortes.
Compartilhamento permanece adiado pelo mantenedor.

Vínculos: JRN-007/008/009/010; FR-010/011/012/013/014/016;
BR-019..023/026..031; EPIC-006/008/009, AC-040..045.

Plano: corrigir interações existentes; implementar domínio de candidatos e notas
explicáveis (BR-023), persistência por projeto, job cancelável e render FFmpeg
com legendas; conectar ferramentas/resultados; executar testes em código e build.

Contratos: segundos absolutos no original; corte preserva intervalo, formato, análise/nota,
estado de revisão e vínculo à mídia. Atualização 03N: a seleção heurística original por densidade/cadência foi substituída em produção por leitura textual Qwen em janelas sobrepostas e seleção sem sobreposição. Análise por LLM textual com citações por referência existe; não é previsão de viralização nem compreensão visual. Código heurístico legado permanece em testes, não na seleção de produção. Nenhum envio externo.
Render usa apenas caminhos gerenciados, configuração validada e processo filho
rastreado. Saída incompleta nunca é publicada. Legendas usam tempos reais
recortados e deslocados ao início do corte. Edição do original é não destrutiva.

A janela de legenda é não modal, arrastável pelo cabeçalho, limitada à viewport;
campos continuam selecionáveis. Progresso visual sobe um inteiro por atualização
até o último valor medido, nunca acima; cancelamento e X pedem confirmação.

Validação planejada na entrega original (histórico): unitários de seleção/limites/notas/overlap, persistência,
ASS/escape/intervalos e argumentos de render; testes de contratos/front-end,
posicionamento e progresso; TypeScript, build e cargo test. Sem navegador,
automação do aplicativo, benchmark ou transcrição de vídeo do usuário. Fluxo e
aparência ficam para o mantenedor. Esse limite era daquela entrega; a 03M executou processamento nativo delimitado, conforme REVIEW de confiabilidade, sem validar o aplicativo inteiro.

Pendências atuais do mantenedor (03N): resumo/critérios ainda técnicos e pouco naturais; 9:16 gerado usa contain e não garante quadro preenchido. Corrigir com estudo prévio das referências open-source e aceites de conteúdo/composição no BACKLOG. Esta revisão não implementa tais correções nem promove qualidade visual/editorial a aprovada.

Graphify consultado: ferramenta não exposta nesta sessão e grafo inexistente
(graphify-out/graph.json); análise de impacto realizada diretamente no código.
