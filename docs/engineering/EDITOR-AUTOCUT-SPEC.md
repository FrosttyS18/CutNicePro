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

Contratos: segundos absolutos no original; corte preserva intervalo, nota,
justificativas, estado de revisão e vínculo à mídia. Seleção heurística local por
abertura, completude e densidade de fala, com supressão de sobreposição. Não é
previsão de viralização nem análise semântica por LLM. Nenhum envio externo.
Render usa apenas caminhos gerenciados, configuração validada e processo filho
rastreado. Saída incompleta nunca é publicada. Legendas usam tempos reais
recortados e deslocados ao início do corte. Edição do original é não destrutiva.

A janela de legenda é não modal, arrastável pelo cabeçalho, limitada à viewport;
campos continuam selecionáveis. Progresso visual sobe um inteiro por atualização
até o último valor medido, nunca acima; cancelamento e X pedem confirmação.

Validação planejada: unitários de seleção/limites/notas/overlap, persistência,
ASS/escape/intervalos e argumentos de render; testes de contratos/front-end,
posicionamento e progresso; TypeScript, build e cargo test. Sem navegador,
automação do aplicativo, benchmark ou transcrição de vídeo do usuário. Fluxo e
aparência ficam para o mantenedor. Status de runtime não será declarado PASS.

Graphify consultado: ferramenta não exposta nesta sessão e grafo inexistente
(graphify-out/graph.json); análise de impacto realizada diretamente no código.
