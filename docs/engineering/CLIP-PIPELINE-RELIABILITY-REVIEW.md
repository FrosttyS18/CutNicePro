# Revisão 03M — 2026-10-19

FUNCTIONAL STATUS: PARTIAL. REGRESSION STATUS: PASS no escopo testado. VISUAL STATUS: PENDING HUMAN APPROVAL.

Reavaliação do mantenedor registrada na 03N: análise do trecho rejeitada por linguagem técnica/genérica e clipes verticais com faixas rejeitados para publicação. São defeitos abertos; os números e execuções da 03M abaixo permanecem evidência histórica dos contratos, não aprovação desses resultados. Preferência por Turbo e retirada de Large completo em DEC-014 ainda não implementada. A 03N atualiza só documentos; nenhum novo teste de processamento ou correção funcional foi realizado.

## Resultado dos aceites

| Aceite | Evidência | Limite |
|---|---|---|
| AC-03M-01 | Efeitos React executados em memória: abrir somente consulta clipes/job; análise de outra instância não abre geração; falha antiga não reaparece | IPC simulado; não é teste do aplicativo Tauri completo |
| AC-03M-02 | Clique real no componente: sucesso persiste, informa e fecha; falha mostra erro e mantém inspeção; rejeitado sai do filtro ativo | Revisão é reversível no filtro Rejeitados, sem apagar a mídia |
| AC-03M-03 | Referências montadas na fonte, IDs inválidos recusados; falha individual preserva coleção, sem nota fictícia; três cortes reais com análise válida | Citação literal válida não comprova interpretação correta do modelo |
| AC-03M-04 | Janelas cobrem todos os segmentos; seleção/validação/persistência reais sobre vídeo de 599,098 s geraram três cortes | Preferência editorial e qualidade precisam de avaliação humana |
| AC-03M-05 | Binário Vulkan verificado, dispositivo detectado e processo associado à RTX; execução real concluída, sem log de fallback CPU | Não medido pico exclusivo; falha durante inferência GPU não foi forçada |
| AC-03M-06 | Cancelamento real após bloco persistido; retomada mantém bytes e mtime do primeiro checkpoint, completa segundo bloco e valida tempos até 260 s | Precisão linguística de bordas e vídeos maiores ainda requer amostragem humana |
| AC-03M-07 | Regiões de extremidades delimitadas; geração real executou detecção regional; teste de vídeo de 2 h solicita só 4 s para um candidato | Não é compreensão visual nem rastreamento de objetos |
| AC-03M-08 | NVENC real; saída 1080×1920, H.264/AAC, 2 s; fallback CPU observado na primeira sondagem inválida | Não garante disponibilidade em todo hardware/driver |

## Contagens e orçamento

152 testes frontend em 23 arquivos; 90 testes da suíte nativa geral; um novo teste de tolerância a falha por clipe; quatro testes nativos reais explícitos. Total de 247 casos únicos aprovados. Dois testes históricos ignorados, relativos às comparações ASR antigas, não foram reexecutados. Repetições não são somadas. O harness completo retornou 5 checks aprovados e 1 SKIP por ausência de testes Python; não somar esses checks aos casos unitários.

Build Vite/TypeScript, compilação nativa dos testes e cargo check --lib aprovados. Binário de desenvolvimento atualizado compilado em app/src-tauri/target/debug/cutnicepro-updated.exe (22.696.448 bytes), sem lançar/interromper a instância aberta; cargo rustc com -o informou adaptação de nome/ignorou out-dir. Não é instalador/release. Aviso preexistente de bundle JS acima de 500 kB. Sem script de lint. Testes de regressão cobrem os contratos das suítes, não todos os fluxos do aplicativo em uso.

Execuções reais: análise individual 39,56 s; geração de três cortes 228,62 s; cancelamento e retomada de 260 s 96,72 s; exportação NVENC 1,03 s. São durações dos testes locais, não benchmark controlado contra CPU/Opus. Não comparar diretamente a partida fria de modelos com vídeos diferentes.

Falhas iniciais registradas: tentativa de link durante execução de outro teste bloqueou o EXE (LNK1104); terminou e recompilou normalmente. A sondagem NVENC de 128×128 falhou por dimensão mínima e escolheu libx264; o teste exigindo hardware falhou. Corrigida para 640×360, uma repetição aprovada. Não houve nova tentativa sem diagnóstico. A suíte completa foi rodada antes da extração final do helper de análise; seu novo contrato foi executado separadamente. O teste de pixels de legenda foi repetido após a correção da sondagem para conferir o caminho acelerado.

## Revisão de implementação

Responsabilidades separadas em seleção, evidências, motor textual, regiões de cena, geração, checkpoints e encoder. Store mantém compatibilidade com coleções sem os novos campos opcionais. Jobs carregam a operação desde a criação, para que UI não confunda análise explícita, geração e exportação. Coleção só substituída na publicação validada; cancelamento impede publicação.

Checkpoints incluem mídia, duração, metadados de modelo/executável, perfil e configuração. Os registros locais têm limites de tamanho, formato e tempos verificados; corrupção leva ao reprocessamento daquele bloco. Publicação de transcrição permanece no armazenamento canônico antes de marcar cache concluído. Tentativa seguinte após conclusão faz nova transcrição; após falha/cancelamento reaproveita blocos válidos. Scratch temporário é removido pelo escopo do job.

Happy DOM 21.0.3 é dependência somente de testes. Renderização estática não executava o efeito responsável pelo defeito. Não houve troca da stack nem inclusão de serviço comercial. Cache npm ignorado no Git.

Skill web-design-guidelines consultada nas [diretrizes atuais](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md), sem auditoria estética: `ClipGallery.tsx` mantém controles nomeados, heading e status; `ClipInspection.tsx` usa ações button, rótulo de seek, estado de erro e só cancela o próprio job; `ClipTools.tsx` reutiliza modal/seletores existentes e distingue operações. Não há novo sistema visual. Abertura/rejeição e posse do job têm testes de interação.

## Limites e continuidade

Não aberto/automatizado aplicativo ou navegador, conforme restrição de validação. Sem alegação de IPC completo ou console limpo no Tauri. Precisão ASR e avaliação editorial anteriores continuam pendentes; nenhum remendo de palavras ou promessa de equivalência ao Opus. O modelo lê texto, não imagens. Recursos multimodais do concorrente confirmados e limites documentados em `docs/references/OPUS-PIPELINE-RESEARCH-2026-10-19.md`.

GPU abaixo de 8 GB, fallback textual provocado e instalador não testados/entregues. Motores e pesos permanecem locais em `.tooling/vendor/`; originais e projetos reais não foram gravados pelas ferramentas. Nenhum processo llama/Whisper/FFmpeg permaneceu na consulta após os testes. Nenhum commit/push/deploy executado.

FigCraft/Graphify não expostos pelos tools da sessão; `graphify-out/graph.json` inexistente. Código-fonte atual foi usado como evidência estrutural, sem afirmar atualização de grafo. Refactor guard não encontrado no catálogo/busca local da tarefa. Evidências: `docs/reports/evidence/2026-10-19-pipeline-validation.json` e `2026-10-19-analysis-vulkan-runtime.json`; artefatos reais em `.tooling/vendor/pipeline-validation/`.
