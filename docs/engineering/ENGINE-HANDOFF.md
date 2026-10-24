# CutNicePro — handoff para o motor

Estado: 03N, revisão documental de 2026-10-19 sobre o código após 03M. Interface, importação, ASR, clipes e render possuem implementação; qualidade de conteúdo e parte do fluxo continuam em revisão. Os defeitos relatados pelo mantenedor não foram corrigidos por esta atualização de documentação. Home aprovada; demais telas PENDING HUMAN APPROVAL. Nenhuma instalação, alteração de modelo ou envio a provedor é autorizado por este documento.

## Fluxo vigente

1. Home/Meus Projetos → Novo projeto → arquivo local → importação gerenciada e visão do projeto. YouTube continua apenas referência/iframe.
2. A visão do projeto reproduz o vídeo de entrada, sem aplicar as edições. Ferramentas abrem editor, legenda/enquadramento, transcrição e geração/exportação.
3. Transcrever abre escolha contextual de modelo/processamento e job real. Turbo é padrão; Large completo ainda consta na UI/backend, com retirada decidida e implementação pendente.
4. Gerar cortes pede quantidade, duração máxima e formato (9:16 inicial). A coleção salva aparece em Clipes de todos os projetos ou Cortes do projeto individual.
5. Abrir um clipe salvo não inicia processamento. A inspeção reproduz seu intervalo, transcrição e análise salva; Analisar trecho é explícito. Rejeitar persiste e sai dos ativos; consultar Rejeitados permite reavaliar.
6. Editor separa configurações do vídeo completo e de cada clipe. Salvar mantém ajustes; exportação do clipe exige aprovação. Exportar vídeo renderiza MP4 real, diferente de copiar o original ou baixar TXT/SRT.

Falhas/cancelamento preservam o resultado publicado anterior. Há gate global exclusivo, não fila persistente completa. Retomada implementada especificamente para blocos ASR; não prometer retomada de qualquer estágio ou execução concorrente de modelos.

## Implementado e limites atuais

| Capacidade | Fonte do código | Funcionamento e limite |
|---|---|---|
| Importação/projetos | `App.tsx`, `media_import.rs`, `media_store.rs`, `storage.rs` | Cópia, SHA-256, deduplicação/referências, metadados ffprobe, cancelamento/reconciliação; não é só arquivo da sessão |
| Workspace/edição | `workspace-types.ts`, `workspace-store.ts`, `useWorkspaceData.ts`, `clip-workspace.ts` | Workspace v2/localStorage; mídia gerenciada reconecta por mediaId; settings/videoSettings/clipEdits separados; histórico completo de versões não existe |
| Transcrição | `transcription/runner.rs`, `profiles.rs`, `checkpoints.rs`, `chunk_text.rs` | whisper.cpp pt/DTW, CPU ou CUDA descoberto; 180 s centrais + 2 s de contexto, checkpoints validados e tempos absolutos |
| Busca/legenda | `TranscriptPanel.tsx`, `captions.ts`, `CaptionPresetsDialog.tsx` | Texto real, busca/seek/edição, estilos e efeitos; não são apenas amostras estáticas. Precisão e sincronia dependem do resultado e da avaliação humana |
| Timeline | `media_preview/`, `VideoEditor.tsx` | Miniaturas e waveform extraídas da mídia; transporte, limites e zoom; sem editor multitrack completo |
| Seleção/nota | `clips/selection.rs`, `generation.rs`, `analysis_types.rs` | Qwen3-4B textual lê janelas sobrepostas e escolhe intervalos sem sobreposição; nota Gancho/Desenvolvimento/Fechamento 40/30/30; não previsão de viralização |
| Análise | `clips/semantic.rs`, `evidence.rs`, `ClipDetails.tsx` | Resumo e três critérios com citações montadas da fala; validação de citações não garante interpretação natural/correta. Relato do mantenedor confirma linguagem técnica/metalinguística inadequada |
| Enquadramento | `clips.ts:isolatedClipSettings`, `ClipFormatPicker.tsx`, `VideoPreview.tsx` | Formato persistido não implica preenchimento: padrão de novos clipes é contain. Cover e ponto focal manuais existem; rastreamento/reenquadramento automático não |
| Inferência textual | `clips/text_engine.rs` | llama.cpp/Qwen3-4B Q4_K_M, GPU Vulkan detectada e ajuste de memória; uma tentativa CPU após falha/cancel check; diferente de Qwen3-ASR |
| Cenas | `clips/scene_regions.rs` | FFmpeg detecta transições perto dos limites dos candidatos, com cache; não interpreta imagens/ações/emoções |
| Render/export | `render/pipeline.rs`, `encoder.rs`, `ass.rs` | Trim, proporção/fit/foco, áudio/texto e legendas ASS; NVENC sondado ou libx264; ffprobe valida duração/dimensões/áudio antes de publicar |
| Persistência nativa | `transcription/store.rs`, `clips/store.rs` | Transcrição, formato/intervalos/análise/revisão dos clipes em app-data; ajustes finos do editor continuam no localStorage |

Stack concreta: React/TypeScript/Vite, Tauri/Rust, CSS/tokens e Phosphor; dependências em package.json/Cargo.toml. Supabase, BYOK, colaboração, credenciais, download YouTube, exportação em lote e distribuição instalável dos motores não estão implementados.

## Prioridades confirmadas pelo mantenedor — implementação ainda pendente

1. Estudar o funcionamento dos projetos open-source indicados antes de adaptar capacidades. Usar a lista existente em OPEN-SOURCE-ENGINE-RESEARCH.md; registrar arquivos/funções/revisão, contratos, dependências/licença, escolhas de adaptação e testes. Pesquisa de README não substitui esse estudo.
2. Análise voltada ao conteúdo: descrever acontecimentos concretos, contexto, reação e desfecho em português natural. Evitar explicações como “a fala inicial introduz o tema central” no resumo destinado ao usuário. O print do Opus orienta a experiência desejada; não comprova nossa equivalência ou autoriza inventar fatos.
3. Clipes 9:16 devem preencher o quadro conforme o objetivo de publicação, com sujeito e legenda preservados. Resolver a composição/preenchimento e testar prévia, miniatura, editor e render; só persistir aspect ratio não atende ao aceite. Não aplicar o crop à visão original do projeto.
4. Manter Whisper Large v3 Turbo e retirar Large v3 completo da escolha/execução do produto. Preferência qualitativa do mantenedor no vídeo testado, não benchmark universal de precisão. Preservar transcrições/projetos e histórico das comparações; não apagar pesos por consequência desta atualização documental.
5. Validar novamente os defeitos quando forem implementados; testes anteriores permanecem evidência histórica de contratos, não aprovação destes resultados. Demais itens de lote/YouTube/BYOK seguem o backlog e exigem escopo próprio.

## Critérios para considerar a primeira fatia funcional

- Importar um vídeo real, reiniciar o app e reabrir sem reenviar o arquivo quando a política de armazenamento permitir.
- Transcrever fala verificável; persistir resultado real e posições em segundos; buscar e navegar ao ponto correspondente.
- Cancelar/falhar sem deixar job preso ou projeto sem recuperação; nenhum falso sucesso.
- Exportar trecho curto com duração/proporção/áudio/legendas corretos; reproduzir o arquivo resultante.
- Validar no Tauri real as permissões, IPC, arquivos e processos. Testes de navegador com IPC simulado não substituem esse aceite.
- Testes proporcionais: uma rodada inicial e uma repetição justificada; preservar aprovados e respeitar VALIDATION-POLICY.md. Estética aprovada exclusivamente pelo mantenedor.

## Evidências e limites — separar estado atual de histórico

03M registrou 247 casos únicos aprovados, incluindo processamento nativo delimitado de geração, retomada ASR e NVENC; aplicativo completo não foi automatizado. Isso comprova os contratos exercitados, não qualidade editorial, preenchimento 9:16 ou precisão ASR. O relato seguinte do mantenedor reabre os dois primeiros como defeitos e define retirada do Large completo. REVIEW/SPEC existentes de confiabilidade e isolamento detalham limites; a 03N altera somente documentação.

03E: build, 30 unitários e 12 runtime únicos com IPC simulado. 03F: build e quatro casos runtime focados em modal, escolha salva, cursor/teclado, responsividade e console. Nenhuma destas evidências comprova IA ou exportação. Ver docs/reports/evidence/03e e 03f e relatórios de histórico.

O plano antigo de começar pela mídia persistente já foi executado; próximas tarefas são as prioridades acima. Não redesenhar a Home nem reabrir decisões visuais aprovadas por consequência desta revisão.

## Histórico — pesquisa de ferramentas de 2026-10-19

Comparação de 10 candidatos e ordem proposta em ../references/OPEN-SOURCE-ENGINE-RESEARCH.md. Manter stack atual; proposta inicial FFmpeg + avaliação whisper.cpp, com yt-dlp em etapa própria para links. Nenhum motor adicional instalado nesta pesquisa. Antes de copiar código, verificar licença e versão, inclusive modelos e dependências. Correções de UI M2A em evidence/m2a-fix têm validação runtime parcial por falha do harness e orçamento esgotado; não promovê-las a integração nativa aprovada.


## Histórico — continuidade M3A inicial (2026-10-19)

Transcrição local inicial implementada em módulos próprios, com whisper.cpp CPU/Base no desenvolvimento, cancelamento e persistência por projeto. Contrato: M3A-TRANSCRIPTION-SPEC.md; roteiro humano: M3A-MANUAL-CHECK.md; decisões e hashes: ENGINE-DECISIONS.md §5. Mantenedor restringiu validação a código, sem navegador/abertura do app. Não tratar ASR, qualidade ou M3 completo como aprovados: runtime e benchmark pendentes; exportação/YouTube/BYOK continuam fora desta entrega.

## Histórico — continuidade 03I (2026-10-19)

Large v3 Turbo/DTW preservados após relato positivo do mantenedor. Editor possui CaptionStyle opcional validado/persistido, visual de legendas compartilhado com predefinições/fonte/efeitos e transporte com Espaço. Menu de contexto nos cards exporta cópia da origem e TXT/SRT reais com seletor nativo; não é render MP4 com cortes/efeitos. Contratos/limites: EDITOR-CONTROLS-SPEC.md; testes somente em código, runtime reservado ao mantenedor. Compartilhamento explicitamente adiado. Não reintroduzir avisos internos na interface.

## Histórico — modo experimental de qualidade Gemma 4 (2026-10-20, atualização 8)

Backend experimental integrado ao app sem trocar a produção: `Options.quality` (ausente = padrão) seleciona o motor em `text_engine::Engine` (Standard = Qwen3-4B ChatML/temp 0, EXATAMENTE como antes; ExperimentalGemma = Gemma-4-12B-IT QAT Q4_0, template canônico do GGUF, temp 1,0/top_k 64/top_p 0,95/min_p 0/seed 42, sem `--fit`, sem fallback de modelo). Janelas do experimental com orçamento REAL de tokens (`llama-tokenize`, `windows_budgeted`, subdivisão com sobreposição na costura). Prompt de descoberta do experimental = `discover-prompt.txt` (unidades narrativas da atualização 7 do experimento). Coleções carregam `engine` (metadado técnico); análise antiga só é reaproveitada entre coleções do MESMO backend (`merge_previous`); reanálise usa o motor de origem. Config local preparada: `.tooling/vendor/analysis/engine-gemma.json` → artefato verificado em experiments (home-e). Reversão: usar "Padrão" na UI; para desativar, remover engine-gemma.json. Limites conhecidos: geração ~3,4 tok/s (perfil Vulkan 12B) + recarga por chamada; variabilidade de resultado entre amostras (temp 1,0 documentada) — detalhes e medições em experiments/clip-selection-ab/reports/integration-comparison.md. Adoção como padrão depende do mantenedor.

## Histórico — modo automático por conteúdo e avaliação por natureza (2026-10-20, atualização 9)

Diálogo "Gerar cortes" ganhou modos: Automática (recomendada; UI não envia duração/quantidade — `GenerateOptions::resolve` aplica limites técnicos 10–180 s e teto 12) e Personalizada (mínima TÉCNICA 10 s, desassociada da máxima). Prompt próprio `discover-auto-prompt.txt` (duração pelo conteúdo, sem quantidade fixa). Avaliação reescrita: `nature` (relato/humor/explicação/opinião/demonstração) identificada ANTES do fechamento, `advertising` marcado, nota = julgamento editorial (não validade técnica nem viralização); schema `-jf` EXIGE os dois campos (grammar sem eles devolveria defaults — corrigido antes da execução real). Políticas do automático (registradas em log, nunca silenciosas; revisão bench-11 + atualização 16): piso editorial 50 na seleção; publicidade como PRIORIDADE SECUNDÁRIA (entra marcada, depois dos editoriais — o texto antigo "fora das sugestões" está obsoleto); invariável global de não-sobreposição entre todos os cortes finais; personalizado mantém tudo com marcação. Análise reescrita: título específico do acontecimento, resumo natural sem "o falante analisa", justificativa separada. Comparação real em experiments/clip-selection-ab/reports/mode-comparison.md; critérios em docs/engineering/AUTOMATIC-MODE.md. Achados para o mantenedor: nota publicada vem da análise final (piso atua na seleção); DP por soma pode aprovar unidades adjacentes do mesmo assunto. Preservado: motor padrão/experimental, revisão humana, IDs, mesclagem por backend; sem mudanças em Whisper/9:16/render/hooks/config global.


## Atualização 16 — integridade, seleção sem sobreposição e CI (2026-10-21)

- **Persistência**: o validador do workspace aceita agora volume 0–2
  (contrato do render; antes volume>1 invalidava o projeto INTEIRO na
  reabertura) e valida zoom/effects/captionStyle.y/wordsPerCaption quando
  presentes. `readWorkspace` recupera em camadas: campos corrompidos são
  corrigidos isoladamente (clamp/padrão), segmentos/edições irrecuperáveis
  são descartados individualmente, e registros sem recuperação são
  preservados intactos + copiados para `cnp.workspace.backup.<id>`
  (nunca substituídos por vazio silenciosamente). Testes:
  app/src/test/workspace-integrity.test.ts.
- **Seleção**: promocionais só disputam intervalos LIVRES após a DP
  editorial (invariável global sem interseção temporal); log de resultado
  com contagens exatas (editoriais/promocionais escolhidos, piso,
  conflitos). Testes adversariais em src/clips/selection.rs.
- **CI**: .github/workflows/ci.yml (typecheck+build+vitest+lint orçado;
  cargo fmt/check/test --lib). Testes com mídia real continuam locais
  (cargo --ignored, e2e Tauri por CDP). Validação no GitHub Actions
  PENDENTE de execução efetiva (exige push).


## Atualização 19 — análises granulares, biblioteca cumulativa e ações diretas (2026-10-21)

- **Causa raiz das análises "perdidas" (comprovada nos dados reais)**:
  a transcrição foi reescrita às 12:39 DEPOIS da geração das 11:46; o
  `transcript_hash` da coleção divergiu e a apresentação antiga apagava
  TODAS as análises em memória a cada `get_clips` (e `review_clip`/
  `analyze_clip` PERSISTIAM o apagamento). Correção: invalidação GRANULAR —
  cada clipe carrega `analysisSignature` (sha256 dos segmentos da sua janela,
  mesma janela de `semantic::source`); editar um trecho invalida somente os
  clipes cuja janela tocou os segmentos alterados; carregar/salvar sem
  edição não invalida nada. Coleções legadas migram CONFIANDO UMA VEZ nas
  análises persistidas (a análise salva aparece; sem baseline não há como
  saber o que mudou — apagar tudo "por segurança" era o defeito). A
  assinatura é atualizada em `semantic::run`; `ClipCollection::
  refresh_analysis_state` substitui `invalidate_analysis`.
- **Geração incremental**: `generation::run` não substitui a biblioteca —
  os cortes existentes permanecem íntegros (id, título, revisão, análise,
  assinatura, exclusão, motor) e apenas candidatos NOVOS entram após
  deduplicação (`generation::duplicate_of`): id idêntico = duplicata exata;
  mesma interseção ≥ 75% da união no mesmo formato = quase duplicata;
  sobreposição menor = variação editorial legítima e ENTRA. Excluídos e
  rejeitados participam da verificação: geração não ressuscita clipe
  descartado. Sem momentos novos a biblioteca é preservada (a UI informa
  "Nenhum corte novo encontrado"). O teto de 12 passou a ser POR EXECUÇÃO
  (`Options::validate`/`AUTOMATIC_MAX_CLIPS`); o total armazenado é
  cumulativo (`store::validate` e `parseClips` aceitam >12). Proveniência:
  `Clip.engine` (por clipe) + `ClipCollection.engine` (última execução);
  reanálise usa o motor do PRÓPRIO clipe. `merge_previous` foi substituído
  por `merge_incremental`.
- **Editar/Baixar/Excluir sem aprovação**: `export_video` não exige mais
  `Review::Approved` (valida apenas existência e não-exclusão do clipe);
  Aprovar/Rejeitar saíram da experiência (os registros históricos
  Pending/Approved/Rejected continuam válidos e consultáveis nos filtros).
  Cards e inspeção têm Editar/Baixar/Excluir. Exclusão é PERSISTENTE e
  RECUPERÁVEL (`delete_clip`/`restore_clip` marcam `deleted`; nada é
  apagado — mídia, transcrição, análise e demais clipes permanecem); a UI
  oferece Desfazer imediato e filtro "Excluídos".
- **Regressão da transcrição (upd 18) com prova**: teste comportamental do
  hook (`app/src/test/workspace-save-regression.test.tsx`, 8 casos:
  mesmo ciclo, callback retido, save em andamento + nova edição, resposta
  antiga ignorada, autosave + save antes da geração, só enquadramento,
  falha sem falso sucesso, persistência na reabertura). Com a
  implementação antiga (`save()` lendo `data` do closure) 5 dos 8 FALHAM;
  com a correção 8/8 passam — demonstração executada e revertida.
- **Git**: `.tooling/_checks.json` (dump transitório da API de check runs
  do GitHub, sem credenciais) ganhou ignore específico e foi removido do
  rastreamento com `git rm --cached` (arquivo físico preservado), para o
  próximo conjunto de alterações; commit e22555b do mantenedor não foi
  reescrito.
- Limites: validação em runtime do app completo (Tauri UI por CDP) não
  executada nesta atualização — laboratório real via `cargo --ignored
  real_incremental_gemma` (base isolada `pipeline-validation-upd19`).
  Aprovação estética continua com o mantenedor.


## ENTREGA 0.19.0 — REGISTRO DE CONTINUIDADE (UPD-020, 2026-10-21)

> Registro canônico de versão e continuidade entre chats (regra permanente no
> AGENTS.md). Toda tarefa consulta e atualiza esta seção — inclusive PARTIAL
> ou BLOCKED. UPD-0XX = identificador de TAREFA; 0.Y.Z = versão de ENTREGA
> consolidada (não confundir; relatórios antigos não são renumerados).

- **Versão atual (manifestos):** 0.1.0 → ver campo "Versão efetiva" abaixo.
- **Versão de destino desta entrega:** 0.19.0 (consolida UPD-018/019/020).
- **Versão efetiva:** 0.19.0 — promovida ao fim da UPD-020 após os
  critérios técnicos (testes, provas de regressão e laboratório de UI);
  APROVAÇÃO HUMANA DO MANTENEDOR PENDENTE; nenhum commit/tag/release criado.
- **Tarefas incluídas:** UPD-018 (correção da reversão da transcrição +
  Git residual), UPD-019 (análises visíveis, geração incremental, ações
  diretas), UPD-020 (correções da auditoria externa: download preserva
  edição, resultado real do download, nota sem análise válida, migração
  legada durável, proveniência, dedupe por conteúdo, validação real de UI,
  versionamento).
- **Estado dos itens da entrega:**
  | Item | Estado | Critério de aceite | Evidência |
  |---|---|---|---|
  | Transcrição não reverte edição | FEITO (UPD-018/020) | save no mesmo ciclo persiste a edição | workspace-save-regression 9/9 (5/8 falham na impl. antiga) + UI lab |
  | Análises visíveis/coerentes | FEITO (UPD-019/020) | análise válida aparece; desatualizada/ausente/falha distinguidas | incremental_tests + clip-library/flow tests + UI lab |
  | Geração incremental | FEITO (UPD-019/020) | biblioteca cumulativa, dedupe por unidades de fala | cargo 138 PASS + laboratório real (3→7) + UI lab |
  | Editar/Baixar/Excluir sem aprovação | FEITO (UPD-019/020) | ações em card/inspeção; export sem gate; exclusão recuperável | tests + UI lab |
  | Download preserva intervalo/legendas | FEITO (UPD-020) | intervalo editado + captionModel 0 respeitados | clip-settings 6/6 (3/6 falham na impl. antiga) + UI lab (ffprobe ≈10 s) |
  | Resultado real do download | FEITO (UPD-020) | sucesso só com arquivo publicado; cancel/falha/bloqueio distintos | useclips-export-result 5/5 + clip-download 6/6 + UI lab |
  | Nota editorial sem análise válida | FEITO (UPD-020) | score só com análise válida; 4 estados na UI | clip-library/clip-flow tests + Rust stale tests |
  | Migração legada durável | FEITO (UPD-020) | sem renovação de confiança entre leituras; incerteza representada | legacy_migration_is_durable (disco, salvar/reabrir) |
  | Proveniência de motor | FEITO (UPD-020) | origem conhecida herdada; desconhecida honesta; reanálise registra produtor | merge_preserves_mixed_provenance |
  | Dedupe por conteúdo | FEITO (UPD-020) | sobreposição é sinal; unidades de fala decidem; 2ª passada delimitada | duplicates_use_speech_units_not_overlap_alone |
  | Validação real de UI | FEITO com limitações declaradas | fluxos executados no app (exe target-upd20 + working tree) | tools/e2e/upd20-ui-lab.mjs: 24/27 verificações (edição de transcrição persistente e visível na reabertura; análise coerente com nota 48–82/100; ações de card; inspeção com critérios; intervalo editado 21,13–31,13 s aplicado na prévia e persistente; cancelamento do diálogo sem falso sucesso; excluir/desfazer/restaurar; biblioteca preservada na 2ª geração; coleção real intacta). LIMITAÇÕES: publicação de arquivo pelo diálogo nativo de destino não automatizável pelo harness (comando/IPC/UI de início, cancelamento e resultado verificados; publicação em nível de comando comprovada no laboratório cargo da UPD-019 com ffprobe) e captura do aviso da 2ª geração falhou por timing (aviso da 1ª geração verificado na UI + lógica testada em TS) |
  | Git residual (.tooling/_checks.json) | FEITO (UPD-019) | ignorado + desrastreado, arquivo físico preservado | git status (D staged) |
- **Pendências herdadas** (fora do escopo UPD-020, ver backlog): qualidade
  editorial das análises (linguagem natural), preenchimento 9:16 p/ publicação,
  retirada do Whisper Large completo, estudo dos repositórios open-source
  indicados, lint pré-existente (19 erros em arquivos não tocados),
  CI no GitHub Actions pendente de push.
- **Validação humana:** APROVAÇÃO ESTÉTICA PENDENTE (mantenedor) — sempre.
- **Commit correspondente:** NENHUM até aqui (commits são do mantenedor;
  HEAD e22555b + alterações não commitadas UPD-019/020 no working tree,
  incluindo bump 0.19.0 em package.json/tauri.conf.json/Cargo.toml+lock).
- **Próximo passo:** mantenedor valida pelo guia do relatório UPD-020,
  decide commit da entrega 0.19.0 e as pendências do backlog.



### Revisão dos relatórios e direcionamento textual ao ZCode — 2026-10-23

- **Escopo desta tarefa:** leitura estática dos relatórios, artefatos M3 e código atual; explicação e prompt solicitado pelo mantenedor. Sem implementação, carga de modelo, teste runtime, alteração de versão/manifestos, criação de goal ou envio a outro chat. A versão informada nos manifestos permanece 0.19.0; nenhuma nova tarefa UPD/release criada.
- **Estado reconciliado:** os três relatórios fornecidos terminam com M5 pendente; o registro mais recente e ProjectWorkspace já incluem auto-geração após transcrição, ligada por padrão. A chamada pede Gemma experimental; Engine::discover prefere GemmaMultimodal quando encontra server/mmproj. Guarda useRef é local à montagem; persistência do cancelamento/recuperação não foi comprovada por esta revisão. Risco de carga ao reabrir projeto sem coleção deve ser testado, não anunciado como bug reproduzido.
- **Valor preservável:** M2 fornece plano multi-janela, revisão manual, persistência e exportação com prova delimitada no aplicativo; o corte inicial foi semeado para isolar essa fatia. O mantenedor ainda não testou estas funcionalidades. Isso não comprova geração automática de montagens por IA.
- **Limite M3 confirmado no código:** selection::select precede enrich_clip; semantic::run recebe quotes da transcrição. Descrições visuais são anexadas ao clipe, sem serem entrada da escolha inicial/resumo nesse caminho. Receber imagem é prova de modalidade, não de melhora editorial. Comparação: 674 s/9 cortes textuais contra 2276 s/10 com evidência (3,38× no ensaio); janela-alvo 360–720 s recebeu contexto 240–840 s. Executável/server e saídas diferem; não atribuir toda a diferença à visão nem extrapolar linearmente para vídeo inteiro. Artefato: m3-comparison.json; recorte em tools/e2e/multimodal-m3-lab.mjs:75.
- **Limite M4 confirmado:** smoothed_framing reduz trajetória a um centro cx/cy, aplicado como focalPoint estático. Não há, nesse contrato, câmera por tempo acompanhando falante, associação falante-pessoa ou rastreamento geral comprovado em vídeos reais. Demos controladas permanecem válidas no escopo relatado.
- **Direção proposta:** novo objetivo textual substitutivo, preservando M2/timeline e experimentos existentes; impedir multimodal incidental e auto-carga inesperada; medir Gemma textual antes de trocar modelo; calibrar prompts/contexto/exemplos com avaliação separada e três cortes reais exportados. Treinamento de pesos não executado nem autorizado por este direcionamento. Primeiro separar gargalo de inferência, qualidade editorial e custo de recursos.
- **Prompt entregue:** docs/reports/evidence/goal-cortes-multimodais-2026-10-23/direcionamento-textual-zcode.txt. Inclui orçamento NOVO PROPOSTO de 4 h ativas, válido somente se o mantenedor cadastrar/autorizar o objetivo; não renova automaticamente as ~8 h consumidas da meta multimodal. Nenhum goal foi criado nesta tarefa. Estudo/código externos adicionais não implementados.
- **Estado/pendências/aceite:** revisão e prompt concluídos; produto e objetivo multimodal continuam PARTIAL/replanejáveis. Desempenho, recursos, cancelamento durável, montagem automática e qualidade final precisam da execução proposta e aceite humano. Matriz antiga e mídia de 2 h não foram concluídas por alteração de escopo. Validação visual/editorial humana pendente.
- **Commit correspondente:** NENHUM; index, working tree e dados preexistentes preservados. Próximo passo: mantenedor decide encaminhar o prompt como novo objetivo, sem retomar silenciosamente M5 multimodal. Relatório desta análise em docs/reports/LATEST.txt e history; não confundir com testes de implementação anteriores.

### Revisão do encerramento do goal textual — 2026-10-23

- **Escopo:** conferência estática do relatório final, evidências, scripts e contratos; sem executar testes, carregar modelos, alterar o aplicativo, criar/renovar goal ou aprovar editorialmente os cortes. Relatório original do ZCode preservado em `docs/reports/history/2026-10-23_110727_goal-cortes-texto-gateF-completo.txt`. Meta/produto seguem PARTIAL; o encerramento da execução não satisfaz todos os aceites.
- **Avanços preservados:** geração textual padrão, auto-geração default OFF e marcador por projeto existem no código; artefatos do cancelamento/retry/persistência granular e quatro MP4s existem. Isso não equivale a reexecução dos testes nesta revisão. O opt-in multimodal usa `var_os(...).is_some()` em `clips/text_engine.rs:63`: presença com valor `0` também passa pela condição; não é comparação estrita com `1` como documentado.
- **Gate F com escopo menor que o relatado:** `texto-gatef2-lab.mjs` inicia/cancela/repete via IPC, configura `cnp.autoGenerate=0`, edita o JSON da transcrição diretamente e registra marcador durável `null`. Há processamento nativo real, porém isso não prova cliques de cancelar/retry, edição/salvamento pela UI nem a guarda de auto-geração com opt-in ligado. `texto-efail-probe.mjs` valida instalação ausente ANTES do job, não falha do processo durante inferência. Não declarar o gate interativo completo com base nesse conjunto.
- **Medições:** `texto-baseline-lab.mjs:42–46` soma todos os processos por nome, incluindo WebViews potencialmente alheios, sem árvore PID/identidade da sessão. `vramPeakUsedMiB` é uma leitura após a geração (linha 106), não pico amostrado; CPU/offload por etapa não estão comprovados pelos artefatos consultados. O registro de ~10,2 GB não demonstra um piso inevitável do app/modelo. Meta de 6 GB permanece não atendida pelo ensaio informado; medir corretamente antes de decidir elevar teto ou comparar modelo menor.
- **Qualidade e exportação:** rubrica pelo agente contra a transcrição, não aprovação humana nem fidelidade ao áudio; 7/9 cortes atingem >=8 e dois ficam em 6/5. Média 8,6 não elimina fronteiras ruins. O EDITADO usa plano/configuração construídos no teste Rust; não fecha o percurso editar -> salvar/reabrir -> exportar pela UI desta meta. Candidatas com conteúdo quase igual podem ser agrupadas como versões; não bloquear toda sobreposição nem apagar edições por mera coincidência temporal.
- **Incidente e integridade:** scripts de laboratório copiam e removem arquivos descobertos em Downloads; versões posteriores ainda removem por nome esperado. Nome não comprova propriedade. A listagem posterior não demonstra ausência de perda dos quatro arquivos alheios declaradamente removidos. Recomendar conter esse método e usar diretório exclusivo/rastreabilidade antes de novos labs. Nenhum arquivo de Downloads foi alterado por esta revisão.
- **Continuidade/budget:** LATEST/GUIA/handoff ainda têm trechos dizendo gate F pendente, divergindo de atualizações posteriores. Handoff registra ~1 h adicional para gate F depois das 4 h iniciais; reconciliar orçamento/autorização sem inventar duração exata. Próxima fatia recomendada: segurança/medição e aceites interativos faltantes; comparar 4B existente com a mesma avaliação se autorizado, sem aceitar 10 GB como inevitável. Aprovação editorial é do mantenedor; alterar IPC de produção para contornar diálogo não é necessidade demonstrada. Sem commit/bump; versão 0.19.0 preservada.

### Geração incremental, comparação de modelos e inventário — 2026-10-24

**ESTADO FINAL DESTE CHECKPOINT — PARTIAL, não entrega editorial estável:** comparação 9B autorizada e encerrada, sem promoção. Descoberta com a mesma fonte/32K/quantização Q4_K_M: 4B 36,51 s/3763,85 MiB de pico WorkingSet observado; 9B 57,86 s/6596,05 MiB. Não é RAM total do app nem consumo exclusivo de GPU. Ambos erraram fatos e intervalos. Ensaio adicional 9B thinking (orçamento 12288, contexto 32768) levou 173,34 s e propôs três: um próximo ao exemplo do PC, outro reuniu L063–L276 e excedeu 180 s, e houve atribuição indevida ao EAFC. Não usar benchmarks publicados para declarar esses resultados bons. Pesos 9B ficam só em experiments, sem seletor/default no app.

**Qualidade ainda não resolvida:** o avaliador mantido reconhece 5/6 referências aprovadas e passa 3/3 controles (mesma história completa/interrompida e final de outro assunto). A referência exige seis; portanto FAIL desse aceite. Títulos/resumos ainda inventam relações ou ficam genéricos. Uma nova instrução sobre silêncio/conclusão regrediu para 4/6 e 2/3 controles: rejeitada e removida; igualdade do prompt restaurado com o controle anterior conferida. Geração fresca 3 terminou sem cortes em 35,38 s; fresca 4 retornou um em 63,86 s, mas foi reprovado na auditoria do assistente por título/descrição/borda; fresca 5, na configuração mantida, terminou sem cortes em 58,92 s. Não afirmar que basta o mantenedor aprovar ou testar: o defeito editorial foi reproduzido. Evidências portáveis em `geracao-incremental-modelos-2026-10-24.json` e `qwen35-9b-comparacao-2026-10-24.json`.

**Correções comprovadas de funcionamento:** resultado único fundamentado por intervalo; referências L000 etc. reconstruídas da fonte; duplicatas retiradas antes das vagas; histórico inclui excluídos/rejeitados sem ressuscitá-los; reparos limitados a três/job preenchem vagas mesmo com cortes já aceitos, sem deslocá-los/sobrepor; nova descoberta limitada a uma repetição também atende coleção inicialmente vazia e recebe as falhas editoriais concretas. Os testes de vagas e feedback falharam antes e passaram depois. Piso 50/contexto/conclusão preservados. Categorias internas substituem booleans no retorno do modelo sem alterar as coleções públicas. Fonte completa na descoberta, avaliação restrita às falas realmente incluídas no corte. Não copiar os tempos/títulos da referência para produção.

**Pesquisa e controles:** releitura pertinente do AutoClip MIT na revisão 3d3b5ed mostrou o caminho rápido e o normal em etapas (mapa → intervalos → notas → títulos), além de feedback concreto no retry. SupoClip AGPL estudado sem portar código/prompt para produto. Protótipos próprios em etapas, por tópico, sem gramática, em inglês e com thinking não comprovaram a qualidade exigida; não integrados. CPU/Vulkan/CUDA ainda erraram, portanto não atribuir o descarte exclusivamente a backend. CUDA b11829 portátil executado só em laboratório, sem instalação global; dois ZIPs temporários próprios removidos após verificação de digest. Sem outra build do app.

**Validação e build atuais:** Rust 186 PASS/0 FAIL/18 opt-in; frontend 258 PASS/0 FAIL na execução após migração (desde então só comentário obsoleto removido no frontend). TypeScript/Vite/lint estrito PASS; cargo fmt/check --all-targets/build finais PASS, sem avisos do compilador. Único executável atualizado: `C:/CutNicePro/app/src-tauri/target/debug/cutnicepro.exe`, SHA-256 `F170AB89178747C81B44A5CEB5D11D4C56092CE6209FCF07906D43659EB7757D`. Sem abrir/controlar a interface, sem gravação no perfil real, sem commit/push/bump. Snapshot final sem processo próprio de inferência em execução. Graphify consultado antes/depois em 1de7f98; novas mudanças não indexadas, complementadas por leitura/diff/testes locais; busca de testes vinculados retornou zero, sem presumir ausência de testes.

**Próximo passo editorial necessário:** demonstrar descoberta e localização corretas de uma unidade real em coleção vazia, com fidelidade de título e avaliação separada da própria nota do modelo; ampliar cobertura só depois desse acerto. Manter o ensaio de novidade separado dos 17 registros copiados (15 excluídos). Não pedir ao mantenedor que repita às cegas a avaliação dos mesmos defeitos nem prometer seis cortes pelo aumento de modelo. Os parágrafos seguintes preservam checkpoints históricos desta tarefa; seus estados pendentes não substituem o estado final acima.

Relatório deste checkpoint: `docs/reports/history/2026-10-24_171352_qwen35-comparacao-e-refino-parcial.txt`, idêntico ao LATEST.txt após releitura. Quarenta e cinco arquivos pendentes no Git, sem commit/push; pesos e runtimes ignorados. O objetivo editorial continua aberto e não deve ser marcado concluído por essa comparação.

**CONTINUIDADE MAIS RECENTE — trabalho ainda ativo:** o mantenedor aprovou como parâmetro editorial as seis propostas do assistente, feitas após leitura integral dos 334 segmentos, sem API de inferência externa. Referência em `docs/reports/evidence/criterio-editorial-assistente-2026-10-24.json`, estado APPROVED_AS_DELIVERY_REFERENCE; dois cortes dependem de manter imagens da fonte. É aprovação do parâmetro, não dos resultados do Qwen ou de MP4s ainda não vistos. Não fixar os seis tempos/títulos no código de produção. User pediu nova pesquisa web e releitura AutoClip/SupoClip para o Qwen alcançar esse nível.

**Checkpoint posterior:** comparação 9B instruct encerrada sem promoção (36,51 s/3763,85 MiB no 4B; 57,86 s/6596,05 MiB no 9B, mesmo prompt de descoberta). Ambos aprovam incorretamente o controle de mudança de assunto. 9B com chaves de fala também não resolveu. Dados em `qwen35-9b-comparacao-2026-10-24.json`; pesos 9B continuam só no laboratório. 4B thinking com orçamento 12288/contexto 32768 gastou 91,04 s e ainda propôs bordas erradas: não integrado.

Retirado do produto o experimento de copiar citações longas: `discovery_reply.rs` usa chaves canônicas L000 etc., reconstrói os limites pela fonte e rejeita referências inválidas/invertidas. Teste de regressão falhou no decodificador anterior e passou no novo; suíte 183 PASS/18 opt-in. Histórico agora representa também excluídos/rejeitados como chaves de fala, sem ressuscitar conteúdo. Geração fresca 1 (citações) produziu 1 em 23,58 s; fresca 2 (chaves) produziu 2 em 21,35 s, mas a auditoria do assistente REPROVOU bordas/fatos do segundo ensaio. Contagem não é aceite. Avaliador 4B passou apenas 2/3 controles reais; hipótese atual em teste muda somente a ordem do esquema para decidir standalone/complete antes de gerar as justificativas. Controle em `qwen35-decision-first.log`; caso passe, testar novamente positivos para evitar regressão de descarte. Não anunciar estabilização editorial nem build final ainda.

**Atualização da investigação:** avaliação real do Qwen3.5-4B reconheceu os seis intervalos aprovados (6/6 standalone+complete, 177,19 s), mas títulos/resumos ainda contêm afirmações incorretas; isso não comprova fidelidade. Geração incremental 6 terminou sem novos, com somente uma proposta literal localizável, repetida da coleção de teste. A coleção copiada tem 17 registros, 15 excluídos; qualidade em coleção vazia deve ser medida separadamente de novidade/dedupe. O harness agora usa base por rodada e admite `qwen35-fresh-1`, sem criar projeto no perfil real. Controles de recusa do 4B em execução neste checkpoint.

Laboratórios isolados: seleção por episódios com presence 1.5/0, texto em parágrafos, mapa cronológico, few-shot fictício, foco em um episódio e payoff primeiro não atingiram o parâmetro. Thinking também falhou nas bordas/fatos (73,64 s, 4096 tokens de orçamento interno; nenhum raciocínio interno publicado). Prompt original do SupoClip foi executado somente no laboratório, com a fonte completa: ainda produziu fragmentos, títulos em inglês e afirmações excessivas. Não foi incorporado ao produto; nenhum código AGPL portado. Controle factual GPU/CPU do mesmo trecho apresentou erros em ambos, sem evidência de GPU como causa exclusiva. Não acumular esses prompts experimentais na aplicação nem declarar que trocar o prompt resolveu.

**Comparação adicional autorizada pelo mantenedor:** Qwen3.5-9B, sem mudar o padrão antes de medir. Download único verificado em `experiments/clip-selection-ab/models/Qwen3.5-9B-Q4_K_M.gguf`: 5.680.522.464 bytes, SHA-256 `03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8`, Unsloth `3885219b6810b007914f3a7950a8d1b469d598a5`, base Qwen/Qwen3.5-9B, Apache-2.0. Próximo passo: mesmos prompts/fonte completa/critério no 4B e 9B, consumo do processo separado de RAM total/VRAM, antes de decidir integração. 4B continua sendo o default em fonte; executável canônico final segue pendente. Nenhuma inferência em nuvem, automação de tela, gravação no perfil real, commit/push/bump ou target extra.

Migração Qwen3.5 já implementada em fonte, ainda sem build final entregue: aliases legados de quality resolvem qwen35; UI manual/auto pede qwen35 e mostra esse nome; 32K fixos; Gemma 4/mmproj/config removidos com inventário; módulo Gemma multimodal removido. Tracking experimental ficou cfg(test), com testes mantidos; YuNet permanece em produção. Suite intermediária passou 177/0/17, frontend 258/258, build/lint frontend PASS. Ensaios nativos Qwen 1 e 2 acrescentaram dois cortes em 29,48/34,00 s, preservando os 17 registros copiados, porém a auditoria do assistente reprovou títulos genéricos/fatos e agregação de temas. Não são aceite editorial. Foi identificado e removido o recorte temporal artificial de propostas longas no modo automático; novas bordas por citações literais são um experimento ativo. Ensaios Qwen 3 e 4 falharam honestamente ao localizar as citações: o modelo acrescentou aspas e depois devolveu metadados numéricos, não as falas. Não publicar nem tratar esses FAIL como ausência de assunto.

Última hipótese em teste: fornecer quebras reais de linha na transcrição completa, em vez de uma string de linhas escapada dentro de outro JSON; guardar limites inequívocos e rejeitar palavras inventadas. Testes do formato/âncoras e da proibição de cortar histórias para caber passaram na suíte intermediária (182/0/17 antes do último teste de apresentação). Próximo passo imediato: terminar teste unitário da apresentação e executar `qwen35-incremental-5`; caso falhe, investigar em laboratório a entrada timestampada/extração fundamentada do SupoClip, sem acumular mais vetos ou fabricar cotas. Revisões relidas pelo GitHub MCP: AutoClip 3d3b5edf9ffa595a764b0919e6dbd4ce8acaca84 (clip_finder.py, quality.py, llm_providers.py) e SupoClip f68afc5b516703f7ed56fe220c55ff6c082af0a0 (ai.py: prompt, construção da entrada, snap, validação e orquestração). AutoClip também usa JSON compacto em seu provider; somente SupoClip foi confirmado inserindo a transcrição diretamente no prompt. Não atribuir a ambos uma diferença que a fonte não comprova. Nenhum código AGPL foi copiado nem runtime de terceiros executado. Sem commit/push/bump, operação de tela ou gravação no perfil real; somente testes isolados e fonte dentro do projeto. Executável canônico ainda corresponde ao estágio anterior a essa migração; recompilar antes de pedir teste manual.

**NOVA DIREÇÃO EXPRESSA DO MANTENEDOR, EM IMPLEMENTAÇÃO:** interromper testes com Qwen3 antigo e retirar Gemma 4; adotar exclusivamente Qwen3.5-4B textual, contexto 32768, sem divisão da transcrição. Essa decisão substitui a proposta anterior de comparar Instruct-2507 e manter Gemma. Download único concluído: `experiments/clip-selection-ab/models/Qwen3.5-4B-Q4_K_M.gguf`, 2.740.937.888 bytes, SHA-256 `00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4`, Unsloth `e87f176479d0855a907a41277aca2f8ee7a09523`, base oficial Qwen/Qwen3.5-4B, Apache-2.0. Removidos com autorização os pesos Gemma 4, seu mmproj e engine-gemma.json (6,6599 GiB lógicos), inventário em `docs/reports/evidence/gemma4-retirado-2026-10-24.json`; dados do mantenedor preservados. Módulo multimodal específico Gemma removido do runtime; contratos de evidências históricas preservados. Tracking controlado experimental permanece como laboratório testado; YuNet local segue ativo.

Prova inicial do Qwen3.5 em servidor local b11829, entrada integral de 334 segmentos: instruct 24,61 s/6 propostas/795 tokens de saída; thinking 40,90 s/4 propostas/4533 tokens de saída, com cache de entrada quente. Pico WorkingSet do processo servidor 3769,16 MiB (não RAM do app nem VRAM). Não comparar tempos como benchmark causal: thinking reutilizou o prompt, e seus parâmetros/orçamento diferem. Há títulos genéricos/finais ruins nos dois braços, portanto contagem não é aprovação. Produção está sendo migrada para modo instruct canônico, com ProcessControl/CLI existente, 32K fixos sem --fit reduzindo o contexto, máximo seis threads e proveniência qwen35. Pedidos legados standard/experimentalGemma resolvem para Qwen3.5, sem reativar pesos antigos; análises e edições antigas continuam legíveis. Se o texto exceder o orçamento, erro explícito em vez de truncagem/divisão. Segunda busca mantém fonte completa e usa histórico de propostas recusadas para evitar repetição. Teste unitário da migração reproduziu default Gemma antes da troca; suíte intermediária passou 177/177 (17 opt-in), sem warnings após isolar tracking experimental. Fluxo frontend 25/25 PASS. Ensaio real da migração e build canônico final ainda pendentes neste ponto; não anunciar a build anterior como Qwen3.5.

- **Escopo:** corrigir descarte/acrescentar sugestões sem substituir salvos; comparar AutoClip/SupoClip e modelos. Mantenedor liberou testes pertinentes além do limite inicial, sem operar sua tela; depois priorizou APIs com transcrição inteira antes de novos ensaios locais. Sem commit/push, bump, download ou novo target. Versão 0.19.0; HEAD `1de7f9812c01b4dd75982e35fc7ab723262e3a15`.
- **Diagnóstico/correção:** avaliação anterior ao refino, duplicatas ocupando vagas, excluídos bloqueando aproximadamente 93,2% da fala na segunda busca e avaliações contraditórias do mesmo intervalo. Agora: refino/dedupe antes da avaliação, resultado fundamentado único reutilizado com assinatura, reavaliação de bordas alteradas, busca adicional depois dos filtros e reparo limitado a três propostas/job. Excluídos não ressuscitam, mas não proíbem todos os outros momentos da região. Piso 50 preservado; reparo compartilha prioridade secundária dos promocionais. serde_json preserve_order corrige a ordem alfabética que fazia emitir closing antes de resumo/título; feature da dependência existente, sem nova versão.
- **Resultados reais:** três execuções intermediárias completas produziram zero novos (310/228/750 s), portanto FAIL. Ensaio após avaliação unificada acrescentou três em 281,37 s e preservou os 17 registros anteriores em cópia isolada (identidade/título/revisão/exclusão conferidos). Controle real de história completa/versão interrompida/final de outro assunto passou 3/3. Isso não aprova qualidade editorial universal; títulos e contexto visual dos três cortes ainda exigem revisão. Não foram inseridos na biblioteca do mantenedor. Testes finais: Rust 184 PASS/0 FAIL/17 ignored; frontend 258/258, build/lint estrito PASS nesta tarefa. Cargo fmt/check --all-targets/build finais PASS sem avisos do compilador; apenas target canônico, executável SHA-256 `1DCE6BD9ED09A535A4C131434A95DE17FA0101E835066B46311403FBBE1DF1FD`. App não foi reaberto automaticamente. Ajustes finais de classificação/reparo e proteção do opt-in multimodal cobertos por compilação/suítes; não houve outra inferência local depois da orientação de priorizar APIs, nem execução multimodal.
- **APIs autorizadas:** Z.ai GLM-4.7-Flash retornou 429/sobrecarga, sem saída. Groq GPT-OSS-120B respondeu: melhor ensaio exploratório integral propôs seis (cinco editoriais e anúncio), mas dois finais estavam incompletos; tentativa de reparo continuou errando. Protótipo de conferência por citações identificou falhas e não foi integrado ao app. Gemini 2.5 retornou 404; alternativa 3.8 explicitamente autorizada retornou 503/timeout, sem resultado editorial. Após orientação de contexto completo, cada chamada incluiu todos os 334 segmentos/599,08 s de fala, sem truncar palavras. Erro de API não conta como corte gerado nem prova baixa qualidade. Chaves só em memória dos processos próprios, depois encerrados; nenhum vídeo enviado e nenhum backend externo integrado.
- **Inventário Qwen:** cabeçalhos GGUF confirmam Qwen3-4B Q4_K_M (vendor, 2,33 GiB), Qwen3-4B-Instruct-2507 Q4_K_M (experiments, 2,33 GiB), Gemma 4 12B Q4_0 (6,50 GiB). Não encontrado Qwen3.5-4B; disco não equivale a RAM. Standard usa Qwen original; ClipTools ainda solicita Gemma nos dois modos. Instruct-2507 não está selecionável e exige template/amostragem próprios. Teste histórico de 2026-10-20 gerou mais propostas com Qwen, mas truncou a história principal e superestimou sua nota. Nenhum novo teste Qwen, download ou mudança de default neste inventário.
- **Impacto/continuidade:** Graphify remoto consultado antes/depois, índice no HEAD acima, build `a1f18b7b-1111-431b-8e70-459a9cc3bb35`, 2026-10-24T14:15:24Z. Fonte/diff complementam mudanças locais não publicadas. Estudo/licenças em OPEN-SOURCE-ENGINE-RESEARCH; modelos/runbook em TOOLING; logs/transcrições ignorados em `.tooling/test-output/geracao-incremental-2026-10-24`. Próxima fatia autorizada: seletor de modelos após entrega estável, com credencial protegida e procedência; ainda não entregue. Comparar Instruct instalado no mesmo pipeline antes de substituir Gemma. Aceite visual/editorial e teste manual da sessão normal pendentes; dados reais preservados.

### Resultado silencioso da geração — 2026-10-24

- **Relato e diagnóstico:** mantenedor descreveu modal fechando em 25% sem toast. O log fornecido mostra 13 propostas recusadas por contexto/conclusão, uma selecionada e essa última recusada na análise final. Com biblioteca anterior, generation::run preserva os cortes e retorna a coleção existente; não houve exceção demonstrada nesse log. O aviso de zero novos ficava no bloco de ferramentas, sem notificação persistente no espaço de trabalho. Não confundir ausência de aprovação editorial com falha do processo/modelo.
- **Correção delimitada:** ClipFeedback permanece no ProjectWorkspace fora das trocas overview/editor/clips; informa sucesso real, zero novos ou falha e permanece até Fechar aviso ou nova operação. O texto de zero novos explica repetição/critérios de contexto e conclusão, sem atribuir uma causa única que a API não fornece. Mensagens de abertura/fechamento e contrato inválido são específicas; erro desconhecido não recomenda espaço no disco sem evidência. Leitura, galeria, revisão e arquivos continuam com seus contratos existentes.
- **Falha adicional reproduzida:** useClips.catch aceitava snapshot completed mesmo quando a validação do retorno falhava, fechando o modal sem erro. Agora falha de consumo permanece failed na interface, cancelamento continua distinto, e evento tardio do mesmo job não apaga a falha. O estado nativo não é reescrito. Os critérios editoriais, prompts, modelos e pipeline Rust não foram alterados.
- **Impacto/aceite:** Graphify remoto antes/depois no mesmo HEAD 8a635b5c36b93a4a6f4ac0ddf0bb657510096be5, complementado pela fonte/diff local; novos arquivos não estão indexados. Teste React integrado ao ProjectWorkspace/useClips/ClipTools com IPC simulado reproduziu ausência de toast, mensagem indevida de disco e falha mascarada; teste adicional reproduziu sobrescrita por evento tardio antes do fix. Final: 258/258 em 40 arquivos, tsc/build Vite e ESLint estrito PASS sem warnings; diff check PASS. Cancelamento, retry após fechar aviso, preservação da coleção e contagem real de novos estão cobertos. Correções intermediárias no harness: esperar o progresso animado não é medir o estado do job; botão de ícone é acionado pelo nome acessível, não texto visível.
- **Limites/continuidade:** frontend corrigido e pronto para teste manual; sem controlar desktop, gerar cortes em teste, inferir modelos, alterar dados do mantenedor, compilar Rust novamente ou criar outro target. Perfil do app foi consultado somente para metadados de diagnóstico; causa desta tentativa foi confirmada pelo log do mantenedor. FUNCTIONAL STATUS: PASS no comportamento automatizado; REGRESSION STATUS: PASS no frontend executado; VISUAL STATUS: PENDING HUMAN APPROVAL. Qualidade editorial ainda depende da avaliação dos novos cortes pelo mantenedor; nenhum novo MP4 é prometido por esta correção. Próximo passo: repetir a geração e conferir o aviso de resultado, inclusive quando nenhum novo corte é aprovado.
- **Git:** caixa Incluir alterações não preparadas inclui trabalho unstaged no commit, inclusive alterações antigas. Não exige desmarcar para Graphify: código precisa estar no commit enviado ao GitHub e o índice precisa atualizar. Sem commit/push/bump autorizado nesta tarefa. Evidência: docs/reports/evidence/geracao-feedback-2026-10-24.json; relatório em LATEST/history.

### Build limpo e remoção de warnings — 2026-10-24

- **Escopo autorizado:** remover avisos antes do teste manual, preservando as adaptações AutoClip anteriores, a interface e os dados. Sem commit/push/bump, inferência de modelos, automação do desktop ou novo target. Graphify remoto consultado antes/depois: índice 8a635b5c36b93a4a6f4ac0ddf0bb657510096be5, workspace/repo corretos; fonte/diff local complementam as mudanças ainda não publicadas.
- **Correções:** seis causas de warnings Rust (helpers realmente sem consumidores removidos; funções dos cenários controlados compiladas somente em testes; guard de temporários mantido; nome de teste regularizado). As 19 ocorrências de erro e um aviso ESLint foram eliminados sem supressões: referências de callbacks são atualizadas após commit, resets são condicionados à identidade da entrada, expansão da transcrição e saída do splash não dependem de efeitos que iniciam renders em cascata. Carregamento inicial e retry explícito do App preservados.
- **Bundle e CI:** bibliotecas existentes separadas em chunks por responsabilidade, sem aumentar o limite de 500 kB: nove arquivos JavaScript, maior 416.769 bytes. O primeiro agrupamento também capturava @animate-ui/react como React e introduzia ciclo motion/React; o seletor foi corrigido para o nome exato do pacote e o build final não apresenta ciclo ou aviso. Nenhuma dependência adicionada. Orçamento de lint reduzido a zero erros/zero avisos e workflow identificado de acordo.
- **Validação:** tsc/build Vite, ESLint estrito e gate do CI, cargo check --all-targets, fmt e cargo build PASS sem warnings. Frontend 253/253 em 39 arquivos; Rust 172 PASS, 0 FAIL, 14 ignored (186 casos). Testes novos verificam troca de mídia/projeto, respostas antigas, recuperação de erro, revogação de URLs e callbacks atuais. Splash usa React montado, incluindo fade/cancelamento/movimento reduzido. O teste estático da transcrição mantém seções fechadas em tempo zero e também comprova abertura/destaque em reprodução; teste montado cobre recolhimento manual. Falhas intermediárias de temporizador/teardown do harness foram corrigidas, sem desabilitar testes.
- **Entrega:** executável padrão app/src-tauri/target/debug/cutnicepro.exe recompilado, SHA-256 8B1C6B8547AAD160B9E30D24168953E909736D12D947EE07181247387C41CA10. Só existe target. FUNCTIONAL STATUS: PASS para build/lint e comportamentos automatizados desta fatia; REGRESSION STATUS: PASS no escopo executado; VISUAL STATUS: PENDING HUMAN APPROVAL. O app não foi aberto/operado e a qualidade editorial anterior continua pendente. Próximo passo: mantenedor abrir pelo comando habitual e testar os novos cortes. Manifesto desta tarefa em docs/reports/evidence/build-limpo-2026-10-24.json; relatório em LATEST/history.

### Adaptação AutoClip — prompts, bordas e rostos locais — 2026-10-24

- **Pedido e aceite anterior:** mantenedor testou a biblioteca e relatou que ficou mais leve, melhor e organizada; confirmou atualização do Graphify. Autorizou implementar adaptações do estudo AutoClip, especialmente prompts e identificação de rostos. A consulta confirmou índice `8a635b5c36b93a4a6f4ac0ddf0bb657510096be5`, de 2026-10-24T12:11:03Z, workspace/repo corretos. Impacto de selection_system e isolatedClipSettings/consumidores consultado; testes ligados por nome foram complementados pela leitura/execução local. Alterações novas do working tree não estão no grafo.
- **Estudo e decisão:** revisões zhouxiaoka 3d3b5edf e artbyjazi 5d0eac36 reconferidas; clip_finder e framing do principal relidos integralmente, com trechos pertinentes de fronteiras/qualidade/testes e documentação oficial OpenCV. O pipeline local mantém tokenização real e arrays compactos já existentes, sem copiar os limites de contexto da nuvem. Não houve nova leitura integral dos dois repositórios. Fonte/adaptação/licenças registradas em OPEN-SOURCE-ENGINE-RESEARCH e TOOLING.
- **Prompts/contratos implementados:** seleção pede a apresentação/pergunta até a resposta concluída, sem usar título para fabricar gancho. Avaliação recebe o texto efetivamente incluído (word-level quando necessário), com até 30 s externos por lado, e exige standalone/complete explícitos. False impede disputa mesmo com nota alta. Intervalos alterados por cenas/bordas recebem nova avaliação em lote, só quando mudaram; pode acrescentar custo de inferência, ainda sem benchmark de vídeo inteiro. Análise final com Gancho ou Fechamento abaixo do piso existente 50 recusa a sugestão nova; falha de análise segue identificada para retry. Sem proposta completa em projeto novo, erro explícito, sem publicar clipe ruim para preencher quantidade. Título não deve prometer lista/contraste ausente.
- **Bugs determinísticos corrigidos:** fim recuava à frase anterior, retirando conclusão (teste 15→10 s em vez de 18 s); snap de início usava fins de frase e podia remover o gancho; palavras de uma frase eram separadas artificialmente em cada linha ASR; pergunta retórica respondida era tratada como próximo assunto; limite do vizinho usava seu início em vez do fim; vetor de operações era vazado por Box::leak. Agora operações são liberáveis e as bordas preservam unidades de fala através das linhas, sem exceder mídia/duração/vizinhos. Pergunta final sem resposta ainda é removida.
- **Rostos independentes do LLM:** modelo YuNet 2023mar de 232.589 bytes (MIT, hash 8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4) e worker próprio. OpenCV 4.12.0.88 + NumPy 2.2.6 instalados só em .tooling/venvs/face-framing (167,90 MiB). Executa após a análise de novos 9:16 em cover, com uma thread CPU e até 12 pares por corte; sem serviço, mmproj, processamento durante scroll ou envio a nuvem. Estima falante por movimento da boca e devolve centro estático seguro; ambiguidade recomenda contain, ausência mantém a escolha, falha é marcada unavailable. Não é identificação biométrica, diarização ou câmera animada. faceFraming opcional/validado em Rust/TS; edição salva vence; o mesmo focalPoint existente segue para prévia/editor/export. API de render/timeline não foi alterada.
- **Processo e recursos:** teste real em duas janelas do portfólio detectou uma estável e uma ambígua; 9,34 s, pico do worker 101,53 MiB (não RAM do app/LLM). Primeiro ensaio mediu só o launcher de Python e essa limitação foi corrigida/registrada. No Windows, launcher criou PID filho: a integração passou a executar o Python real com pacotes isolados, e teste nativo confirmou PID do worker igual ao processo possuído, permitindo cancelamento pelo controle existente. Nenhum processo alheio foi encerrado. Não houve novo teste de cancelamento interativo.
- **Validação final delimitada:** frontend 246/246; tsc/build Vite e eslint dos tocados PASS; lint orçado PASS (dívida 19 erros/1 aviso preservada). Rust 186 casos: 172 PASS, 0 FAIL, 14 ignored; PID real e regressão nativa executados separadamente PASS; Python 4/4. Fmt/diff checks PASS. Na regressão real, proposta 1194,42–1228,92 s antes terminava em 1220,88 s; após correção preserva fim 1228,92 s e início de frase 1186,56 s. YuNet/âncora segura/render nativo produziram 1080×1920, 42,376 s. Artefato referencia-TECNICA-bordas-YuNet.mp4 é somente evidência técnica, NÃO um novo corte selecionado pela IA nem substituto do aceite editorial.
- **Ensaios reais de IA, sem esconder falha:** primeira rodada intermediária gerou uma sugestão em 205,69 s após recusar duas bordas, mas análise final apontou Fechamento 30; export do teste falhou por captionStyle ausente na configuração construída pelo harness (corrigida). Segunda rodada intermediária em 77,26 s recusou a única proposta ajustada e encerrou sem corte completo. Esses ensaios permitiram identificar o recuo indevido por pergunta retórica; não comprovam sucesso editorial após as últimas correções. Não houve terceira rodada de inferência, respeitando o orçamento de validação. Uma falha de compilação no teste novo (helpers/assinatura do render) e fixture antiga do avaliador foram corrigidas; nenhuma suíte foi desabilitada ou critério enfraquecido.
- **Entrega e dados:** somente target canônico recompilado; mantenedor salvou/fechou o app quando solicitado, e não foi reaberto/operado automaticamente. Exe app/src-tauri/target/debug/cutnicepro.exe com SHA-256 B11A397E0460AFBED708A8FA6F96564A20053CF4F846924FD79DCAD72A166924. Nenhum projeto/corte/mídia/transcrição/edição foi alterado nos dados do mantenedor; sem seed de projetos, nova build, commit, push ou bump nesta tarefa. Roteiro: abrir pelo comando normal, gerar novos cortes em 9:16/Preencher, comparar contexto/conclusão e verificar centro/manual/export; a UI informa o estado inicial da detecção. Resultados antigos não são reprocessados.
- **Estado real/próximo passo:** código de prompts/gates/bordas/rostos compilado e regressões delimitadas PASS; eficácia editorial final, sessão real de geração e aprovação visual permanecem PENDING HUMAN APPROVAL. Referência técnica não pode ser apresentada como corte aprovado. Empacotamento do runtime Python para release e câmera por tempo não foram implementados. Evidências em docs/reports/evidence/autoclip-prompts-rostos-2026-10-24; logs temporários/caches em .tooling/test-output; relatório atual em LATEST/history.

### Publicação autorizada no GitHub — 2026-10-24

- Mantenedor autorizou expressamente o push nesta tarefa. `git push origin main` publicou os cinco commits da organização anterior, de ab501e2 até `8a635b5c36b93a4a6f4ac0ddf0bb657510096be5`, sem force, reescrita de histórico, tag ou release. Nenhum commit adicional foi criado nesta publicação; arquivos de auditoria locais não são enviados por push sem commit.
- GitHub confirmado por `git ls-remote`: main em `8a635b5c36b93a4a6f4ac0ddf0bb657510096be5`, com HEAD/origin/main sem divergência (0/0). O envio não comprova atualização do Graphify: consultas antes e depois da publicação ainda retornaram ab501e26634648a59e005238c2c50b3230b4cac0. Confirmar a revisão pelo serviço após a indexação. Testes da aplicação não foram repetidos para uma operação de Git, e os aceites manuais/editoriais anteriores continuam pendentes.

### Organização e commits autorizados — 2026-10-24

- **Escopo:** mantenedor autorizou organizar as alterações pendentes e comitar; não autorizou push, release ou bump. Inventário inicial: 548 caminhos pendentes, 437,43 MiB. Separação em recursos de compilação, integração do aplicativo, ferramentas de teste, design e documentação; nenhum projeto, mídia, modelo ou edição do mantenedor foi removido. A versão permanece 0.19.0.
- **Preservação:** 15 MP4s de evidência, três aplicadores de patch de uso único e quatro JSONs vazios ficam locais/ignorados (334,48 MiB), com manifesto de caminho/tamanho/SHA-256 em `docs/reports/evidence/organizacao-git-2026-10-24/artefatos-locais.json`. Não são backup: um clone novo não recupera os MP4s. A fixture pequena já versionada não foi retirada do Git. Fontes, testes, locks, ícones, posters, TTFs e artefatos de design passam a ficar no histórico. Modelos, runtimes e caches continuam ignorados pelas regras anteriores.
- **Higiene de compilação:** CI deixa de criar stand-ins e passa a consumir os recursos reais. PDF e WAV marcados como binários; 144 binários do commit de design comparados entre índice e disco, sem divergência. Rustfmt aplicado aos 23 fontes pendentes e às três asserções de `local_media_scheme.rs` que já falhavam em HEAD, sem mudança de lógica. Build único `app/src-tauri/target` preservado.
- **Correção necessária ao gate:** lint detectou `setState` síncrono em effect no ajuste anterior de entrada do editor, elevando `set-state-in-effect` a 10 contra teto 9. `ProjectWorkspace` agora ajusta somente a própria vista durante mudança real de `initialView`, antes de renderizar os filhos; voltar ao projeto não força retorno ao editor. Novo teste com hooks simulados cobre abrir/voltar/abrir. Sem remount do projeto ou alteração de persistência. Graphify consultado para chamador App e consumidores; fonte local complementa índice antigo. Orçamento de refs reduzido de 10 para 9 após a contagem menor; nenhum limite elevado ou regra desabilitada.
- **Verificação:** frontend completo 241/241 antes do ajuste de navegação; após ele, 32/32 testes relacionados (incluindo um novo), tsc e build Vite PASS. Rust completo após formatação: 162 PASS, 0 FAIL, 11 ignored preexistentes (173 casos). Fmt final PASS; lint orçado PASS (9 set-state-in-effect, 9 refs, 1 immutability, 1 aviso conhecidos); lint bruto ainda tem dívida. Sintaxe dos 32 novos laboratórios verificada sem executá-los. Busca delimitada por padrões de segredos não encontrou candidatos, sem constituir auditoria de segurança completa. Avisos Rust de código não usado e bundle Vite grande permanecem registrados, sem refatoração fora do escopo.
- **Commits de implementação já criados:** `49121e1` recursos reais/CI; `eb093ae` código e testes integrados; `61a3362` laboratórios/lint; `6fb90b0` design e histórico do case. Governança/evidências são registradas na mesma tarefa; consultar `git log` para o commit documental correspondente. Os contratos compartilhados entre TS/Rust foram mantidos juntos para evitar uma divisão artificial que quebrasse etapas intermediárias.
- **Graphify:** conexão remota e símbolo ClipGallery comprovados em wesley-s-workspace/FrosttyS18/CutNicePro; índice promovido ainda em `ab501e26634648a59e005238c2c50b3230b4cac0` (2026-10-23T14:52:12Z). Commit local não atualiza esse índice. Nenhuma ferramenta de reindexação exposta, nenhum upload, push ou atualização de índice executado. Próximo passo externo: publicação expressamente autorizada, atualização no serviço e confirmação por `graph_stats` da revisão publicada, sem presumir automatismo.
- **Aceite e continuidade:** organização/versionamento não aprovam qualidade editorial nem resolvem os goals anteriores por declaração. Scroll/memória na sessão real e aparência seguem para teste manual do mantenedor, conforme preferência de não controlar a tela. Relatório operacional desta execução é gerado após os commits; seus dois TXT, se pendentes, são listados explicitamente, conforme REPORTING-STANDARD, sem esconder ou ignorar relatórios.

### Correção da biblioteca — miniaturas, projetos e Novo — 2026-10-24

- **Pedido vigente:** após gerar novos cortes, mantenedor confirmou travamento no scroll, ausência de seções por projeto e Novo sumindo ao abrir. Escopo limitado a esses três itens; seleção editorial/modelos/reenquadramento não foram alterados. Mantenedor determinou que os testes da interface serão manuais, sem controle remoto da tela/PC; preferência registrada em AGENTS.md. A tarefa anterior havia aguardado Graphify por escolha explícita; a conexão foi configurada/autenticada com autorização para a configuração de usuário do Codex, sem alterar outros clientes nesta tarefa.
- **Graphify remoto comprovado:** workspace wesley-s-workspace e repo FrosttyS18/CutNicePro (281bc29a-456d-4f9d-acb2-c8e905916f25) confirmados; ClipPoster resolvido exatamente em app/src/components/clips/ClipPoster.tsx. Índice ab501e26634648a59e005238c2c50b3230b4cac0 = HEAD, de 2026-10-23T14:52:12Z. Impacto consultado em ClipGallery/ClipPoster/mediaUrl/timeline_preview, arquivos clips.ts/media_preview/generation e testes relacionados, com revisão pós-alteração. Fonte/diff local complementam mudanças não indexadas; isClipNew recebeu sugestão semântica de outro símbolo, rejeitada como resolução. Nenhum commit/push/upload para atualizar índice.
- **Causa demonstrada no código:** cada ClipPoster ativava um video do original ao entrar na área visível e desconectava o observer sem liberar o player quando saía; ao rolar, acumulava players/decodificadores. readWorkspace também era executado por card/render, repetindo leitura/parse/validação da transcrição. Isso demonstra pressão desnecessária de recursos; o fechamento específico da sessão do mantenedor não foi reproduzido/medido nesta tarefa.
- **Implementado:** cards passam a usar imagens JPEG de até 640 px, produzidas localmente pelo FFmpeg em fila de uma por vez (decoder/filtro com uma thread), sem áudio/ASR/LLM. Novo IPC clip_thumbnail valida mídia/tempo e usa MediaStore, cache em app-data/cutnicepro/thumbnails e recursos de PreviewJobs/Scratch existentes. Não altera timeline_preview, playback ou export. Frontend compartilha pendências, limita cache a 64 imagens, carrega próximo da viewport e reutiliza ao voltar; falha de um poster é isolada. Workspace lido uma vez por projeto e poster memoizado para o relógio não reler mídia.
- **Organização:** biblioteca global em seções verticais por ID de projeto, nome e contagem; padrão Por projeto, com Mais recentes adicional. Ordenações internas preservam as seções, filtros e ações. Tela individual mantém sua galeria. ClipCard extraído apenas para manter os módulos pequenos.
- **Novo/tempo:** badge calculado por createdAtMs e relógio, válido de 0 a menos de 60 min; abertura/edição não removem nem renovam. Flag antiga cnp.clipsOpened.v1 deixou de governar o badge, sem apagar dados antigos. Relógio atualiza em ociosidade/foco. Legados não ganham datas inventadas. Em futuras gerações, created_at_ms dos inéditos é atribuído após a análise, antes da publicação, sem consumir a hora durante a inferência; datas conhecidas/legadas são preservadas.
- **Verificação:** reprodução automatizada inicial: 6 falhas esperadas nos requisitos de Novo/grupos/ociosidade antes da correção. Frontend completo 241/241; tsc e eslint dos tocados PASS; após o ajuste final de validação JPEG/identidade do poster, 7 testes relacionados novamente PASS. Testes adicionais: 27 cards sem video no DOM, duas leituras de workspace para dois projetos, máximo uma leitura de miniatura ativa, cache/LRU/dedupe/erro isolado; novo teste FFmpeg real prova JPEG e leitura do cache sem reabrir vídeo. Rust completo final: 173 casos, 162 PASS, 0 FAIL, 11 ignored preexistentes; build canônica PASS, hash 74EE562276100273D3CA5397F4895A8638E4AD6E50456DAF56126B159CE33BE5. A primeira compilação do teste de data encontrou import faltante no módulo de teste, corrigido. Nenhum teste desabilitado ou critério enfraquecido.
- **Dados/entrega:** nenhum projeto, clipe, vídeo, transcrição corrigida ou edição existente foi excluído, reanalisado ou substituído. Sem nova build de laboratório, dependência, versão, commit ou push; somente app/src-tauri/target. Evidências em docs/reports/evidence/biblioteca-estavel-2026-10-24/diagnostico.json, relatório integral em LATEST/history.
- **Pendente manual por decisão do mantenedor:** reabrir pelo comando normal após compilar, percorrer biblioteca para baixo/cima duas vezes, conferir seções por projeto e abrir/fechar corte recente sem perder Novo. Expiração de 1 h já testada com relógio controlado, sem exigir espera real. Funcionamento do scroll na sessão real, consumo de memória e aprovação visual ainda não foram comprovados pelo agente; não declarar ausência total de regressões nem concluir o goal editorial anterior.

### Manutenção — build única e espaço em disco — 2026-10-24

- **Pedido:** mantenedor interrompeu a execução do ZCode e pediu resolver múltiplas builds, desconhecimento da versão correta e consumo de disco. Esta tarefa não retoma inferência/calibração nem cria outro goal.
- **Diagnóstico:** quatro caches Cargo em app/src-tauri somavam 37,91 GiB lógicos: target 16,51, target-f2c 6,45, target-refino 5,70, target-upd20 9,25. Nenhum arquivo versionado ou reparse point nos quatro; todos com CACHEDIR.TAG Cargo. O exe padrão era de 2026-10-23, enquanto a correção relatada estava no f2c. target-f2c/refino não eram ignorados pelo Git: contribuíam para 8.598 caminhos pendentes; contagem de arquivos não equivale a linhas novas de código do produto.
- **Entrega operacional:** cargo test --offline --locked ui_caption_style_payload_with_words_percaption_deserializes em target: 1 PASS, 0 FAIL, 170 filtrados. cargo build --offline --locked em target: PASS, sem alterar fonte ou dependência. Exe canônico recompilado: app/src-tauri/target/debug/cutnicepro.exe, SHA-256 16F56F000A3253EDC069A492C9A9B8369C65981E72D0C69FCA292584AF9C1F30. A correção de legendas já estava na fonte; não foi reimplementada aqui. Comando normal: npm run tauri dev em C:/CutNicePro/app, sem profile/target de laboratório.
- **Limpeza autorizada:** mantenedor respondeu “Remover as três builds duplicadas” à pergunta que nomeava target-f2c/refino/upd20 e preservava target/fontes/dados/modelos. Após verificar limites absolutos, marker, Git, links e ausência de cutnicepro/cargo/rustc ativos, cargo clean com --target-dir exato removeu somente os três caches (16.302 arquivos). target foi preservado e seu hash permaneceu igual. Tamanho lógico removido 21,40 GiB; espaço livre medido 81.579.360.256 → 98.100.158.464 bytes (+15,386 GiB). Não confundir soma de Length com espaço efetivamente liberado.
- **Prevenção:** AGENTS/TOOLING passam a exigir build única, entrega na instância normal e autorização específica para cache paralelo. .tooling/experiments e dados runtime não foram limpos. Nenhuma cópia de fontes, alteração no app, modelo, mídia, projeto, versão, commit ou push.
- **Limites do relatório ZCode:** o prompt do goal filho consultado reduz execução/aceite a F1–F4 e 8 h próprias; isso não comprova que biblioteca/Novo por 1 h, marcas Qwen/Gemma e correção editorial do prompt completo foram entregues. Não ratificar “só falta aceite humano”. Graphify não exposto nesta sessão; nenhuma mudança funcional/estrutural/refatoração foi feita. Consulta CIM de processos foi negada; verificação de processos usou Get-Process. Os defeitos de produto e aceite editorial continuam pendentes.
- **Abertura normal:** tentativa inicial encontrou Vite antigo na porta 1420; consulta de processos inicialmente negada no sandbox foi concluída com aprovação de leitura fora dele. Confirmados cmdline/caminho do servidor deste repositório (PID 51908) e processo da tentativa própria (50564). Stop-Process retornou erro interno; taskkill dos dois PIDs previamente revalidados concluiu. Nenhum processo de outro projeto foi encerrado. Segunda abertura pelo comando canônico: Vite pronto, Tauri executando target/debug/cutnicepro.exe, janela CutNicePro responsiva (PID 45356), frontend HTTP 200 em localhost:1420, hash canônico mantido. Sessão de dev 36093 mantida aberta para teste, sem perfil de laboratório. Espaço livre posterior: 91,26 GiB (varia com outros processos).
- **Evidências e próximo passo:** docs/reports/evidence/build-unico-2026-10-24/diagnostico.json; relatório desta manutenção em LATEST/history. Utilizar apenas a build canônica já aberta para testar as correções existentes; não retomar laboratórios pesados ou aceitar novos cortes automaticamente. Não houve novo teste de export pela UI ou aceite editorial.

### Goal revisado após reprovação editorial — 2026-10-24

- **Escopo desta preparação:** prompt completo ao ZCode, sem implementar o aplicativo, executar modelos/labs ou criar uma meta no Codex. Arquivo canônico atualizado no mesmo caminho: docs/reports/evidence/goal-recuperacao-autoclip-2026-10-23/prompt-goal-zcode.txt; conteúdo integral deve ser idêntico ao enviado no chat.
- **Veredito do mantenedor:** os três G8 foram REJECTED editorialmente: ~48 s termina durante a explicação; ~40 s começa na enumeração sem apresentar o assunto, embora o fim tenha sido aprovado; ~45 s começa sem contexto e não sustenta o título sobre qualidade. O EDITADO anterior continua reprovado. Preservar originais e avaliações antigas como histórico; rubrica automática não representa aceite.
- **Diagnóstico ainda necessário:** priorização de duração é hipótese, não causa comprovada. O goal exige rastrear fronteiras/contexto/título em cada transformação, corrigir regras gerais e vetar início incompreensível, promessa ausente e conclusão interrompida, sem cortes arbitrários ou hardcode das amostras.
- **Ordem e entrega:** primeiro verificar comando/build/origem/perfil/dados da instância normal e corrigir vínculos/projetos vazios; depois biblioteca por projeto/geração, Novo por 60 min independentemente da abertura e tempo relativo; concluir lacunas reais do estudo AutoClip; corrigir conteúdo e comparar Qwen3-4B/Gemma-4-12B localmente com medição de pico válida. Pelo menos três cortes qualificados por modelo, sem preencher quota com falhas; cada MP4 de comparação deve queimar Qwen 4B ou Gemma 12B nos frames, com proveniência real. Exportações comuns preservam saída sem marca obrigatória.
- **Continuidade/budget:** prompt nomeia goal-refino-editorial-fluxo-local-2026-10-24 e vincula ao anterior; teto de 24 h acumuladas entre recuperação e refinamento, deduzindo consumo real anterior (~4 h relatadas, a reconciliar), sem outras 24 h automáticas. Reaproveitar o identificador se já existir. Aprovação humana só após resultados acessíveis no app normal, com editar/salvar/reabrir/exportar validados.
- **Proteções/estado:** Graphify remoto obrigatório para a execução funcional futura; nenhuma ferramenta Graphify exposta nesta sessão, nenhuma consulta/conexão/configuração realizada aqui. Só leitura/documentação autorizadas nesta preparação; sem commit/push/bump, modelos, dados ou fontes do app alterados. Versão 0.19.0 e trabalho preexistente preservados. PASS apenas da preparação, produto permanece com falhas relatadas; próximo passo é encaminhar este prompt ao ZCode.

### Análise do retorno humano — biblioteca, modelos e AutoClip — 2026-10-24

- **Escopo desta tarefa:** revisão estática de relatório, imagens, implementação e scripts/artefatos G4–G8; nenhuma correção do app, execução de modelo, nova meta ou prompt criado. Graphify não exposto nesta sessão; nenhuma chamada remota realizada. Leitura do diretório runtime AppData foi negada, portanto não houve inspeção direta da sessão normal/coleções persistidas do mantenedor.
- **Retorno/novo requisito:** mantenedor relata ausência de badge/tempo, mistura confusa de projetos/notas e TXT Aceite Manual abrindo sem vídeo. Regra solicitada agora: Novo durante 1 h após criação/publicação na biblioteca, independentemente de abrir; o estado de visto não controla esse badge. O critério anterior de sumir ao abrir vinha do prompt anterior e é substituído por este requisito. Data/tempo relativo continuam após expirar Novo; legados não recebem datas inventadas. Filtro/agrupamento por projeto e acesso inequívoco à geração testada são necessários para o aceite.
- **Galeria confirmada no código:** ClipGallery só rende badge/tempo com createdAtMs, usa cnp.clipsOpened.v1 para Novo e recalcula tempo apenas no render. Não há relógio/timer dedicado nem filtro explícito por projeto/última geração. Padrão score mistura fontes; opção time ordena também pelo nome do projeto, mas se apresenta como Ordem do vídeo. Isso comprova problema de apresentação/identificação; não comprova troca de notas entre registros de projetos distintos.
- **Conjuntos de teste divergentes:** G8 cria G8 Entrega em perfil webview-g8 e registra 8/8 datas/badges; os novos top-3 são notas 91/85/83. O guia aponta TXT Aceite Manual com 12 cortes, cujos títulos/notas antigos 95/95/92 aparecem no print. O script G3C grava o workspace de TXT manual apenas no perfil webview-g3c; readWorkspace devolve vazio sem localStorage e useWorkspaceData só reconecta mídia se já houver mediaId. É forte hipótese para clipes nativos visíveis globalmente e projeto vazio na sessão normal; a ligação exata dessa sessão não foi confirmada diretamente.
- **4B vs 12B:** g5-comparison registra Qwen3-4B 93 s/12 cortes e Gemma-4-12B 286 s/4 cortes na janela 1200–1476 s, não vídeo inteiro. São perfis/famílias diferentes, com templates/amostragem próprios e saídas distintas; não concluir superioridade geral por quantidade/notas. Checagem editorial de poucos exemplos contra texto não é avaliação robusta pelo áudio. RAM/VRAM do g5-matrix-lab são capturadas antes e depois de await gen (Math.max de dois pontos); não picos de inferência. Invalidadas as conclusões de RAM equivalente/inevitável com essa medição. Chamadas por braço = 0 no artefato por ausência do scratch; a janela também se sobrepõe à avaliação anterior 1000–1300 s e não deve ser chamada inédita.
- **Estudo AutoClip:** G4 declara leitura parcial/cabeças/superfícies, lista frontend/desktop/API/prompts/testes pendentes e nenhum código externo executado. Não satisfaz estudo integral nem benchmark de pipeline externo exigidos. Referência estática útil: fronteiras por frase/silêncio, payload compacto e reutilização do modelo. Só o refine Rust de fronteiras foi integrado; no texto puro pausas de áudio multimodal não são calculadas, usa gaps/pontuação das palavras. Payload/reuso ficaram propostos, sem A/B. Servidor em 127.0.0.1 é processo local, não serviço de vídeo pago; inferência continuará local conforme decisão reiterada do mantenedor.
- **Próxima ordem proposta (ainda sem execução):** unificar vínculo projeto/mídia/coleção/workspace e entregar no perfil normal; corrigir identificação Novo/tempo/projeto/geração; concluir estudo faltante e avaliação 4B/12B com picos por processos próprios e julgamento comparável; testar incrementalmente payload/reuso locais; gerar/editar/reabrir/exportar os mesmos clipes identificáveis no app. Não iniciar novo orçamento sem reconciliar as ~4 h relatadas das 24 h. Produto permanece PARTIAL também por lacunas técnicas, não apenas aceite visual/editorial.
- **Continuidade:** relatório ZCode original preservado em docs/reports/history/2026-10-23_213019_goal-recuperacao-autoclip-final.txt. Versão/arquitetura e dados não alterados; sem commit/push. Aprovação do mantenedor não registrada; próximo passo é consolidar o goal de refinamento após esta explicação.

### Revisão do goal — Graphify remoto obrigatório — 2026-10-23

- **Pedido:** substituir a exigência de cópias de fontes por análise de dependências/impacto via Graphify remoto e atualizar AGENTS.md; reenviar o goal completo sem divergência do TXT. A versão anterior do prompt permanece como histórico da conversa; o arquivo canônico foi atualizado no mesmo caminho, sem novo goal nem orçamento renovado.
- **Regra implementada:** AGENTS.md exige MCP remoto `https://api.graphify.com/mcp` (Streamable HTTP/OAuth), workspace `wesley-s-workspace` e repo `FrosttyS18/CutNicePro`; consulta real antes de alterações funcionais/estruturais, consumidores/testes, revisão indexada versus HEAD/working tree, complementar lacunas locais e registrar bloqueios. Instruções locais da skill/venv passam a legado, sem fallback silencioso.
- **Estado real:** documentação oficial de setup/limites consultada; nenhuma ferramenta Graphify está exposta neste chat, nenhuma conexão foi executada e nenhuma configuração MCP/credencial foi alterada. O ZCode deverá configurar a entrada remota compatível com seu cliente, concluir OAuth e provar consulta de símbolo no alvo correto. TOOLING atualizado sem apagar histórico do servidor local.
- **Precisão técnica:** grafo não executa testes, não versiona/restaura arquivos e pode não incluir alterações não publicadas. O fluxo conserva leitura pertinente, diff e testes reais; remove cópias em lote como substituto de prevenção de regressão. Não há autorização de commit/push para atualizar índice.
- **Escopo preservado:** recuperação de exportação/biblioteca/UI, estudo completo AutoClip, comparação 4B/12B, cortes identificáveis e aceites; acrescentado critério específico de Graphify. Goal existente deve ser retomado com consumo já registrado, teto total de 24 h, sem duplicação.
- **Entrega:** `docs/reports/evidence/goal-recuperacao-autoclip-2026-10-23/prompt-goal-zcode.txt`, integral no chat com o mesmo conteúdo. Aplicativo, modelos, mídias e dados do mantenedor não alterados; sem cópias de fontes, commit/push/bump ou execução de laboratório.
- **Estado/próximo passo:** PASS apenas para revisão documental/prompt; conexão Graphify e correções do produto não validadas por esta tarefa. Mantenedor encaminha o goal revisado ao ZCode; OAuth só requer intervenção se o cliente solicitar autorização no navegador. Aprovação editorial/visual continua humana.

### Goal proposto — recuperação funcional e estudo AutoClip — 2026-10-23

- **Pedido/limite desta preparação:** produzir prompt completo ao ZCode; nenhum goal foi criado/iniciado pelo Codex, nenhum aplicativo/IA foi executado e nenhuma correção do produto foi implementada. O prompt autoriza a futura execução quando encaminhado pelo mantenedor, com teto novo de 24 h acumuladas incluindo processamento; não renova metas antigas.
- **Novo retorno humano:** o mantenedor rejeitou editorialmente o exemplo EDITADO anterior (remoção arbitrária), relata falha real ao baixar/exportar, biblioteca global em erro/zero apesar de 15 clipes no projeto davyjones, controles de ferramentas desalinhados, ações coladas no projeto vazio e ausência de identificação temporal dos cortes novos. Não usar evidências mecânicas anteriores como aprovação editorial ou prova de que esses fluxos estão íntegros.
- **Inspeção estática limitada:** `clipMessage` usa a mensagem de espaço como fallback genérico; não há diagnóstico de disco comprovado. Agregação em `services/clip-library.ts` interrompe por rejeição e `useClipLibrary` limpa a lista no catch; falta reproduzir qual projeto/contrato falha. O controle automático é um checkbox inserido diretamente em ClipTools. Nenhum desses achados constitui correção ou teste runtime.
- **Fontes:** confirmados os repositórios públicos zhouxiaoka/autoclip (principal) e artbyjazi/autoclip (complementar). A leitura nesta preparação NÃO é estudo completo; resumo do outro ChatGPT, versões/modelos e superioridade ficam como hipóteses. Endpoint público de commits não acessível pelo navegador; revisão fixa deverá ser obtida no estudo. Registro incremental em OPEN-SOURCE-ENGINE-RESEARCH.md.
- **Escopo do prompt:** preservar trabalho local/dados e conter labs inseguros; recuperar exportação/biblioteca/UI; ler todo o código autoral principal com cobertura por arquivo e revisão fixa; usar fontes/MCP pertinentes; comparação local 4B/12B e de pipelines; proposta medida e melhorias incrementais; badge Novo, criação/tempo relativo/última geração; regressões reais pela UI e aceites humanos separados.
- **Entrega canônica:** `docs/reports/evidence/goal-recuperacao-autoclip-2026-10-23/prompt-goal-zcode.txt`. Texto colado no chat deve ser EXATAMENTE o conteúdo desse arquivo, sem reformulação posterior. Plano e evidências futuras permanecem nos documentos canônicos existentes; nenhum plano concorrente foi aberto aqui.
- **Estado/continuidade:** PASS apenas para preparação; defeitos do produto permanecem relatados e não corrigidos. Aprovação visual/editorial pendente. HEAD observado ab501e26634648a59e005238c2c50b3230b4cac0; versão 0.19.0 preservada, nenhum commit/push/bump. Próximo passo: mantenedor encaminhar o prompt e avaliar a futura entrega funcional identificável.

### Preparação de Goal — cortes multimodais e pré-edição (2026-10-23)

- **Escopo desta tarefa:** pesquisa, leitura estática e prompt para execução pelo ZCode; nenhuma implementação do aplicativo ou meta iniciada pelo Codex.
- **Entrega:** `docs/reports/evidence/goal-cortes-multimodais-2026-10-23/objetivo-zcode.txt`, com roadmap de seis marcos, critérios de ponta a ponta, orçamento acumulado de até 6 h ativas e limites de tentativas/validação. Fontes e limites em `sources.json` e `analysis.txt` na mesma pasta.
- **Constatações:** caminho consultado do Gemma recebe prompt textual; modalidade nativa precisa de prova no runtime. Estruturas consultadas representam intervalos simples; montagem de vários intervalos e tracking não foram demonstrados nessa leitura. O ZCode deverá revalidar toda a cadeia antes de alterar contratos.
- **Resultado solicitado para a implementação futura:** importação automática até MP4, seleção multimodal, plano de edição compartilhado entre prévia/editor/render, ajustes manuais, reenquadramento e tracking em casos delimitados, persistência, recuperação e regressão da timeline.
- **Proteção:** timeline aprovada pelo mantenedor permanece baseline; nenhum novo teste de desempenho nesta preparação. Fine-tuning, publicação e equivalência ao OpusClip ficam fora do escopo. Qualidade editorial exige amostras e aceite humano.
- **Estado:** PASS apenas para preparação do prompt; implementação NOT STARTED nesta tarefa. Versão 0.19.0 e pendências herdadas preservadas; nenhum commit/push, alteração em app ou index.
- **Próximo passo:** mantenedor encaminhar o arquivo como objetivo no ZCode. Nenhuma comprovação de suporte multimodal do binário instalado, qualidade editorial ou tracking foi obtida pelo Codex nesta tarefa.

## TAREFA 2026-10-22 — TIMELINE LAG/TRAVAMENTO (goal-timeline-2026-10-22)

> Tarefa não-versionada (sem bump; working tree da 0.19.0 preservado e
> estendido). Fonte: `docs/reports/evidence/goal-timeline-2026-10-22/objetivo-zcode.txt`.

- **Objetivo:** eliminar atraso/travamento do scrub com vídeo de 24 min
  (1476 s / 345 MB / H.264 1080p), com causa demonstrada e validação no app
  real. Metas propostas: playhead p95 ≤50 ms; alvo→frame p95 ≤250 ms.
- **Diagnóstico (medido):** laboratório CDP no Tauri real (exe target-upd20
  reconstruído com a correção de Range; dev server 1420 = working tree;
  `tools/e2e/timeline-lab-24min.mjs`), editor completo com transcrição
  SINTÉTICA de 296 segmentos (custo de render real identificado como
  sintético). O ATRASO DE 1–3 s RELATADO NÃO FOI REPRODUZIDO: braço OFF
  (baseline = Blob URL + Range por intervalo + seek coalescido + rAF throttle
  + debounce da transcrição, SEM overlay) já atinge alvo→frame p95 59,5 ms,
  0 long tasks, memória estável (~2,17 GB de processo incl. Blob de 345 MB;
  heap JS ≤58 MB), snapback ausente em 12/12 drags (tempo final == alvo).
  A reclamação pode depender de condições não reproduzidas no lab (sessão
  longa do mantenedor, estado da máquina); hipótese anterior "IPC era o
  gargalo" segue NÃO comprovada como causa única.
- **Correção (candidata 2 — implementada):** FrameSeeker WebCodecs
  (`app/src/lib/frame-seeker.ts`, mediabunny ^1.62.1 MIT) adaptado do
  VideoCache do OpenCut Classic (cf5e79e; registro em
  OPEN-SOURCE-ENGINE-RESEARCH §2). Overlay de canvas na prévia durante scrub
  pausado; sai no seeked final/play/troca de mídia (com guarda contra
  resolução tardia). Blob registrado por mediaId em workspace-store
  (`registerMediaBlob`). Candidata 1 (anterior, já na tree) = Blob URL +
  Range + coalescência.
- **Medições A/B (mesma sequência/sessão):** ON: overlay p95 ~103–110 ms
  após alvo; frame do <video> p95 ~150–179 ms; heap ≤89 MB; 0 long tasks;
  snapback 12/12. Playhead p95 via CDP: OFF 64,8 ms / ON 65,3–67,6 ms.
- **Rodada v5 (condições reais, lacunas de revisão fechadas):** transcrição
  REAL do projeto do mantenedor (568 segs / ~5,5 mil palavras) lida em
  SOMENTE LEITURA de app-data e semeada como cópia no workspace do lab;
  playhead medido SEM hop de harness (PointerEvents sintéticos no mundo
  principal + double-rAF): **p50 4,7 ms / p95 5,0 ms / max 8,2 ms com
  overlay ATIVO** → meta playhead p95 ≤50 ms ATENDIDA pelo caminho do app;
  os 64,8–70 ms das medições via CDP são custo de despacho do harness
  (Playwright/CDP). <video> apresentou 134–135 frames na sequência; 0 long
  tasks; heap 85–91 MB; mem 1844→2175 MB estável. CORREÇÃO: na v5 os
  "braços OFF/ON" não são A/B válido (instrumentação de produção já
  removida → overlay ativo nas duas passadas, log scrub vazio); A/B de
  frame = v4. Evidências:
  `docs/reports/evidence/goal-timeline-2026-10-22/lab-scrub-24min-results{,-v5-real-transcript}.json`.
- **Validação:** tsc OK; eslint OK nos arquivos tocados (2 erros
  pré-existentes em VideoPreview.tsx linhas 39/55); vitest 214/214; Rust
  binário reconstruído (cargo build 26 s incremental; suíte Rust 138 PASS
  inalterada desde a validação anterior — nenhum arquivo Rust modificado
  depois dela); playback pós-scrub OK no app real (overlay some, tempo
  avança). Exportação não tocada (coberta por suítes existentes).
- **Limpeza:** instrumentação temporária removida do código; projetos e
  perfil WebView2 do lab apagados (app-data volta a conter somente os
  projetos do mantenedor; mídia de 345 MB compartilhada por dedupe com o
  projeto "UX PORTFÓLIO" permanece, correta).
- **Resolução (2026-10-23, mensagem do mantenedor no chat):** reteste
  manual na sessão real dele (projeto "UX PORTFÓLIO") **POSITIVO — "fiz o
  teste e agora tá perfeito"**. O teste ocorreu com o overlay FrameSeeker
  ATIVO (configuração da working tree); a configuração validada por ele é
  a que permanece (overlay ativo). Com os critérios quantitativos já
  demonstrados (labs v4/v5) + reteste real positivo, a TAREFA TIMELINE
  está CONCLUÍDA. Sem commit/push/bump; decisão de commit da working tree
  (0.19.0 + timeline) segue com o mantenedor.
  Limitação declarada (cláusula do objetivo): experimento A (OpenCut no
  navegador) NÃO executado — estudo de código-fonte apenas; sem afirmação
  de equivalência; critérios avaliados como absolutos do CutNicePro.
  Sem commit/push/bump nesta tarefa.



## TAREFA 2026-10-23 — CORTES MULTIMODAIS (goal-cortes-multimodais-2026-10-23)

> Fatia: importar → transcrever → analisar texto/imagem/áudio → cortes
> pré-editados → revisar na timeline → salvar/reabrir → exportar MP4 ==
> prévia. Sem commit/push/bump. Orçamento: 8 h ativas acumuladas;
> 2 candidatas por decisão de integração; 2 ciclos de calibração editorial.

- **M0 CONCLUÍDO** — mapa do caminho real + matriz de aceite + baseline
  (`docs/reports/evidence/goal-cortes-multimodais-2026-10-23/marco0-mapa-baseline.md`).
  Decisões: D1 EditPlan v1 por corte; D2 adaptador multimodal via llama-server;
  D3 índice temporal por mídia; D4 tracking controlado (sem YOLO no MVP);
  D5 orquestração reusando ClipJobs/ProcessingGate.
- **M1 CONCLUÍDO** — multimodalidade PROVADA no runtime local
  (`marco1-multimodalidade.md`): Gemma 4 12B QAT + mmproj OFICIAL (Apache-2.0,
  sha cb018338…) via `llama-server` b11829 (win-vulkan oficial, MIT) na porta
  local; visão comprovada por probes A/B/sequência + par controlado (detalhes
  só existentes na imagem); áudio comprovado (3 bipes, contagem correta;
  ordem fina 440×880 trocada — experimental declarado). LIMITAÇÃO: `llama-mtmd-cli`
  crasha (0xC0000409) nos 3 builds testados → server é o caminho. Thinking OFF
  obrigatório (`reasoning_effort:"none"` no /v1/chat OU template canônico
  nothink no /completion). Tempos: 12–26 s por pergunta com imagem.
- **M2 CONCLUÍDO** — EditPlan v1 ponta a ponta
  (`marco2-fatia-vertical.md`): contrato TS+Rust (segments), export
  multi-janela + concat `-c copy`, prévia composta (salto de vãos), timeline
  com vãos sombreados + dividir/remover/corte simples + undo/redo; provas:
  TS 227 PASS (+13 edit-plan), Rust 141 PASS (+2), integração FFmpeg real
  (20±1 frames, vão removido por CONTEÚDO), APP REAL com vídeo 24 min
  (plano pela UI, undo/redo, salvar/reabrir exato, prévia saltando vão,
  export `Ok(true)` → MP4 22,045 s vs plano 22,000 s, 526 frames @23,976).
  Artefatos: `mm-m2-corte-app-real.mp4`, `multimodal-m2-lab.mjs`,
  `mm-export-probe.mjs`.
- **CORREÇÃO DE REGISTRO (meta timeline anterior)**: eventos sintéticos não
  disparam seek (`setPointerCapture` rejeita pointerId inativo) → a medição
  "playhead p95 5 ms sem hop de harness" do lab v5 é INVÁLIDA (mediu rAF
  vazio). Válidos: v4 via CDP (p50 11–13 ms; p95 64,8–67,6 ms com custo de
  harness declarado) + reteste manual aprovado. Gate F desta meta deve usar
  eventos REAIS (CDP).
- **Consumido**: ~3 h ativas de 8 h. Candidatas de integração D2: 2/2 usadas
  (build novo = mesmo crash; server = solução). Calibração editorial: 0/2.
- **M3 CONCLUÍDO** (`marco3-multimodal.md`): `clips/multimodal.rs` (server
  gerenciado: porta efêmera, /health, kill no Drop; completion com prompt
  canônico+schema; vision com reasoning_effort none; kill-switch
  CNP_DISABLE_MULTIMODAL), Engine::GemmaMultimodal (degradação textual
  declarada), índice temporal real (silencedetect 1×/geração + frames JPEG
  por timestamp + snap de borda por pausa), gate de honestidade (multimodal
  sem NENHUMA evidência real = erro), evidência por clipe no store +
  "Evidências recebidas" na inspeção. COMPARAÇÃO delimitada na amostra
  RESERVADA (360–720 s declarada antes): A textual 674 s/9 cortes/0
  evidências × B multimodal 2276 s/10 cortes/10 com evidência REAL (frames
  + visual consistente com o vídeo: homem de óculos, microfone, estante).
  Bugs corrigidos: sinal do snap de borda (achado por teste); exe stale no
  lab (detectado pelo backend record, reexecutado). Rust 146/146, TS 227/227.
- **M4 CONCLUÍDO no núcleo** (`marco4-tracking.md` + `m4-demos/`): ByteTrack
  d1bf019 lido na íntegra (ADOPTADA a associação 2-estágios IoU + oclusão;
  REJEITADOS YOLOX/Kalman); `clips/tracking.rs` — detector por diferença de
  FUNDO (câmera estática; corte rebate fundo e ARQUIVA trilhas do plano),
  objeto controlado por COR (categoria+seleção registradas), framing
  suavizado (média móvel, clamp, fantasmas sem framing), integração
  enrich→framing→focalPoint (prévia/export; manual vence = desativa).
  3 demos obrigatórias com FFmpeg real + trajetórias JSON; Rust 152/152,
  TS 227/227. PENDÊNCIA declarada: demo ponta a ponta num corte REAL da IA
  (fica para o lab do aceite A, junto com M5).
- **DECISÃO DO MANTENEDOR (2026-10-23 ~10h20, chat)**: cancelou a geração
  multimodal em execução ("muito demorado, consome muita RAM e CPU vai
  fritar o pc dos usuários") e definiu o rumo: **GERAÇÃO POR TEXTO +
  refino da própria IA** (calibração de prompts/instruções; fine-tuning
  segue exigindo autorização própria). Registrado: os dados sustentam a
  decisão (janela de 6 min: textual 674 s × multimodal 2.276 s; vídeo
  inteiro multimodal estimado ~100 min — cancelado por ele após ~30 min).
- **Estado na pausa**: M0–M4 implementados; M5 implementado (auto-geração
  pós-transcrição com opt-out `cnp.autoGenerate`, sem duplicar jobs —
  disparo automático COMPROVADO no lab antes do cancelamento); gate F
  executado COM IA ativa (playhead p95 96,6 ms via CDP vs 64,8 baseline —
  inclui harness; vídeo final exato, sem snapback: `gatef-ia-ativa.json`);
  gate A multimodal CANCELADO pelo mantenedor (`gateA-tentativa-canceliada.log`).
  ATENÇÃO: `Engine::discover` ainda PREFERE multimodal quando acha server+
  mmproj — o default textual é mudança pendente de autorização (1 linha em
  text_engine.rs: inverter a preferência ou exigir opt-in).
- **PRÓXIMO PASSO (após decisão do mantenedor)**: (1) default textual;
  (2) refino/calibração dos prompts de seleção/análise no caminho textual
  usando a amostra reservada (M3 deixa a comparação pronta); (3) reexecutar
  a matriz A–I no caminho TEXTO (rápido: ~30 min no vídeo inteiro) com os
  3 cortes exportados para aceite editorial; M4/tracking e multimodal
  ficam como capacidade opt-in documentada, não default.
- (histórico) PRÓXIMO PASSO (M5 + aceite) original: geração automática pós-import (opt-out,
  sem jobs duplicados), recuperação/estados/cancelamento, cache por mídia;
  lab final no vídeo de 24 min INTEIRO (gate A com multimodal+framing),
  exportar ≥3 cortes, rubrica C, regressão F com IA ativa, memória G, e
  APRESENTAR as amostras para o aceite EDITORIAL do mantenedor.
- (histórico) PRÓXIMO PASSO (M4) original: tracking controlado (pessoa em movimento, 2 pessoas
  + troca de plano, objeto em caso controlado) sobre as evidências já
  coletadas + framing suavizado persistido no plano; depois M5 (auto
  pós-import + orquestração/recuperação) e matriz A–I + aceite editorial.
  Orçamento: ~7,5 h de 8 h consumidas.
- (histórico) PRÓXIMO PASSO (M3) original: adaptador Rust `clips/multimodal.rs` gerenciando o
  llama-server (porta local, ciclo de vida, degradação textual declarada);
  índice temporal (falas EDITADAS + pausas + eventos FFmpeg + frames
  amostrados); descoberta multimodal em janelas com cobertura; comparação
  delimitada na amostra reservada; depois M4 (tracking) e M5 (auto pós-import).
- Limpeza feita: projetos "MM Lab M2*" + perfil do lab apagados; mídia
  compartilhada (dedupe) preservada; vite de laboratório encerrado ao final.

## TAREFA 2026-10-23 — CORTES POR TEXTO (goal-cortes-texto, ~4 h próprias)

> Direção do mantenedor: geração TEXTUAL (multimodal cancelado; ver seção
> anterior). Evidências multimodais preservadas; nada apagado.

- **F1 CONTENÇÃO ✓**: Engine::discover estritamente textual (multimodal só
  com CNP_ENABLE_MULTIMODAL=1); auto-geração agora OPT-IN (default OFF,
  `cnp.autoGenerate`) com guarda DURÁVEL por projeto
  (`cnp.autoGenerated.{id}` — cancelado não refire ao reabrir; repetir =
  botão). Suítes: Rust 152/152, TS 227/227, exe reconstruído.
- **F2 BASELINE ✓** (metas ANTES em `00-metas-checkpoint.md`): vídeo inteiro
  568 segs reais → **19,7 min (meta ≤20 ✓)**, 12 chamadas (6 selection,
  5 evaluate, 1 analysis; recarga do modelo por chamada ~2-3 min no total),
  RAM pico grupo **10,2 GB (meta 6 GB FALHOU — piso do 12B Q4_0/Vulkan
  ~7 GB host + editor 2,2 GB; trade-off com o mantenedor)**. 12 cortes,
  backend experimentalGemma, ZERO multimodal.
- **F3 OTIMIZAÇÃO: 0/2 usadas** — baseline atendeu tempo; server sem mmproj
  ganharia ~2-3 min (reservado se o mantenedor pedir RAM/tempo menor).
- **F4 RUBRICA ✓**: amostra RESERVADA inédita (1000–1300 s; M3 usou
  360–720 declarada como calibração exposta) → 9 cortes, **média 8,6/10,
  fidelidade 2/2 em 9/9** (verificação verbatim contra transcrição real;
  "Daily UI sem contexto" confirmado). Ciclos de calibração: 0/2 usados.
  Fracos: fronteiras (2 cortes 5–6/10, fim abrupto).
- **F5 ACEITE (PARCIAL)**: A ✓ (binário reconstruído, backend comprovado);
  B ✓-pipeline (3 MP4s reais + 1 EDITADO via render::pipeline do app com
  FFmpeg/transcrição/legendas reais — `corte-real-*.mp4`, durações ±0,1 s;
  o clique no diálogo nativo fica no GUIA); C ✓-rubrica (aceite HUMANO
  pendente); D PARCIAL (edição UI+persistência comprovadas no M2; nesta
  rodada o harness falhou no diálogo nativo — 2 abordagens testadas,
  caminho digitado e ENTER/nome padrão, instáveis sem foco de janela;
  incidente registrado: 4 deleções de arquivo ALHEIO recriado na Downloads
  durante espera — corrigido para nome padrão do app); E ✓ (p95 84 ms via
  CDP com geração ativa; baseline 64,8 ms mesmo método; v5-5ms não usada);
  F NÃO EXECUTADO (tempo esgotado no diálogo); G tempo ✓ RAM ✗ (declarado);
  H lacunas explícitas.
- **Entregáveis**: `evidence/goal-cortes-texto-2026-10-23/` — 4 MP4s,
  GUIA-DO-MANTENEDOR.md, rubrica, baseline/chamadas, gateE, checkpoint.
- **GATE F EXECUTADO NA UI (rodada seguinte, ~1h)**: cancel durante
  inferência ✓ (motor encerrou, SEM publicação parcial); reabrir sem
  reinício ✓ (job=cancelled, motor=0, guarda durável `cnp.autoGenerated.*`
  sem refire); retry explícito ✓ (389 s → 5 cortes; motor encerra e RAM
  volta a ~1 GB); invalidação granular provada NOS DOIS SENTIDOS (editar
  segmento FORA das janelas → 0 stale [correto]; DENTRO da janela do
  corte → 1/7 stale, exatamente o consumidor — `gateF-ui.json`); regenerar
  sem duplicatas de ids ✓, MAS achado de produto: 2 pares de cortes
  ANINHADOS com o MESMO fim (474,0 s e 613,7 s) pós-regeneração — o dedupe
  por unidades de fala (upd 20) os permite porque os conjuntos de conteúdo
  diferem; DECISÃO DO MANTENEDOR: aceitar aninhados ou apertar o dedupe.
  GOTCHA: page.reload() derruba o WebView2 com frequência nestes labs —
  navegar por UI (Voltar → Meus Projetos) no lugar de reload.
- **Gate F "falha do motor" ✓** (`gateF-ui.json → engineFailure`):
  CNP_ANALYSIS_HOME vazio → generate_clips falha em 16 ms com erro limpo
  ("O recurso de análise está indisponível…"), job NEM abre, nada
  publicado, zero processos órfãos, app permanece utilizável.
- **GATE D: BLOCKED-BY-HARNESS (definitivo nesta meta)**: export pela UI
  exige o diálogo nativo de destino; 4 abordagens tentadas (caminho
  digitado, ENTER nome padrão, AppActivate+ENTER, diagnóstico de janela
  #32770) — o arquivo não é publicado de forma estável pelo harness.
  PRÓXIMO PASSO EXATO: (a) mantenedor executa os 3 cliques do GUIA (o
  pipeline pós-diálogo é o mesmo dos MP4s já entregues e validados), OU
  (b) nova decisão de produto: parâmetro de destino no comando
  export_video (elimina o diálogo para automação; exige autorização
  própria pois muda superfície IPC).
- **PRÓXIMO PASSO (decisão do mantenedor)**: (1) aceite editorial dos 4
  MP4s + guia; (2) RAM: aceitar 10 GB ou comparar Qwen3-4B instalado
  (2 tentativas de otimização reservadas); (3) gate F (cancel/retry/cache
  na UI) + percurso completo de export pelo app; (4) ligar auto-geração.

## TAREFA 2026-10-23 — RECUPERAÇÃO + AUTOCLIP (goal-recuperacao-autoclip, 24 h próprias)

> Fonte: `goal-recuperacao-autoclip-2026-10-23/prompt-goal-zcode.txt`.
> Rejeição EDITORIAL registrada do "EDITADO" anterior (remoção arbitrária) —
> não reutilizar como evidência. Orçamento: ~2 h consumidas das 24 h.

- **G1 ✓**: Graphify remoto validado COM CHAMADA REAL (list_workspaces →
  wesley-s-workspace; list_repositories → FrosttyS18/CutNicePro 281bc29a,
  3.297 nós, commit ab501e2 = HEAD; graphify_node/query_graph/callers/
  tests_for). Defasagem: working tree não commitado fora do índice —
  leitura local complementar por fatia. AGENTS.md já tinha a regra
  (preservada).
- **G3A ✓ (export/baixar)**: erro do mantenedor reproduzido pelo caminho
  REAL; causa raiz = projects.json corrompido pela semeadura manual do
  projeto de teste (createdAt ISO vs created_at_ms) + mídia desvinculada
  (sem link_media). Corrigidos; export_video ok:true nos DOIS projetos
  (davyjones 94,3 s; TXT Aceite Manual 17,1 s) com diálogo nativo real.
  Evidência: `g3a-diagnostico.json` + 2 MP4s.
- **G3B ✓ (biblioteca zerada)**: `loadClipLibrary` derrubava TODA a lista
  quando UM projeto falhava (get_project_clips Err). Contrato novo:
  isolamento por projeto → `{entries, failed}`; falha total continua
  exceção; `useClipLibrary` informa parcial ("Alguns projetos não puderam
  ser carregados (N)"). Teste atualizado p/ novo contrato; 227/227 TS.
- **G3C (parcial)**: checkbox auto-geração MOVIDO da barra p/ diálogo
  "Gerar cortes" ("Gerar automaticamente quando a transcrição terminar" —
  distinto da geração por conteúdo); CNP_ENABLE_MULTIMODAL agora exige
  "1". PENDENTE: validação visual (alinhamento Transcrever novamente,
  botões colados estado vazio) — próxima rodada com prints.
- **G4 CONCLUÍDO (núcleo autoral integral + complementar)**: clone @3d3b5edf clone isolado em
  `.tooling/vendor/refs-autoclip/autoclip-main` @ `3d3b5edf` (2026-10-22,
  tag mcp-v1.5.7, MIT). Lidos por inteiro: clip_finder.py (one-pass com
  janelas LOCAIS 20min/12k chars), framing.py (YuNet+boca-que-se-move,
  crop POR PLANO, fit sem rosto), quality.py (refine_timeline por código
  em cues + DurationProfile tiers + select_clips/align_scores), steps 1-6,
  simple_pipeline_adapter (orquestrador: preflight/precheck/checkpoint/
  falhas honestas), boundaries.py (fronteiras por FRASE+PAUSA com drop de
  pergunta final), intelligence.py (visão cloud opcional 2-pass),
  video_encoder, llm_client, whisper_runtime/speech_recognizer. Rodada 2:
  simple_pipeline_adapter (orquestrador), boundaries.py (frase+pausa+drop
  pergunta), intelligence.py (visão 2-pass cloud), ASR. Rodada 3:
  models/repositories (LenientEnum!), tasks/processing (dedupe por projeto),
  project_cancellation (bind/checkpoint + limpeza pós-delete), prompts por
  categoria (speech integral; padrão idêntico nas 7), studio render/store/
  burned_subtitles (máscara de legenda queimada SEM OCR); COMPLEMENTAR
  artbyjazi @5d0eac3 (MIT): boundaries 3-passos com mapa de silêncio,
  janelas 8min/60s + concorrência LOCAL=1, reframe landmarks+tracks+
  diarização ("never jarring"). Cobertura por arquivo e lacunas declaradas
  em `g4-estudo-autoclip.md`. NÃO EXECUTADO: código de nenhum repo
  (estático; nenhum instalador/script rodado).
- **G5 CONCLUÍDO**: matriz controlada 12B×4B na janela INÉDITA 1200–1476 s
  (135 segs reais; mesmo pipeline/options; efeito modelo isolado):
  Qwen3-4B **93 s / 12 cortes / RAM 1,25 GB / VRAM 3,2 GiB** ×
  Gemma-12B **286 s / 4 cortes / RAM 1,22 GB / VRAM 3,1 GiB**; fidelidade
  verbatim OK em ambos; títulos do 4B mais genéricos ("o falante
  apresenta…"), 12B mais seletivo e específico. 1 falha de infra no braço
  12B (crash WebView2 — retry sem reload OK). Extrapol. honesta vídeo
  inteiro: 12B 19,7 min medidos; 4B ~6-7 min ESTIMADO (medir antes de
  afirmar). RAM de pico do grupo NÃO difere na janela (recarga por chamada
  domina) — reaproveitamento do modelo é a alavanca, não o tamanho do
  modelo. Matriz por capacidade ×AutoClip em `g5-matriz-comparacao.md` +
  OPEN-SOURCE-ENGINE-RESEARCH §2b (adapt: payload compacto, refine
  determinístico de fronteiras frase+pausa, reuso via server sem mmproj).
- **G6 CONCLUÍDO**: proposta (`g6-proposta-ia-local.md`: manter Whisper
  Turbo + Gemma 12B default; 4B como observação, não substituição — RAM de
  pico não difere, recarga domina; 3 melhorias: fronteiras determinísticas,
  payload compacto, reuso server sem mmproj) + **refine de fronteiras
  IMPLEMENTADO** (`clips/borders.rs` novo: frase/pausa/pergunta final/snap
  áudio; conservador sem words; 6 testes; hook em generation.rs pós-cenas,
  IDs recalculados; Rust 159/159). Nº1 e nº3 ficam como proposta (A/B
  próprio exigido).
- **G3C CONCLUÍDO**: validação visual real (screenshots g3c-*.png +
  geometria medida): checkbox CONTEXTUAL no diálogo "Gerar cortes" (não
  mais solto); botões colados do estado vazio ERAM defeito real
  (sobreposição 1px medida) → CORRIGIDO com flex-column gap 16px (medido
  16px após); "Transcrever novamente" alinhado na coluna (x único, gaps
  10px ≥8px). Flag CNP_ENABLE_MULTIMODAL exige "1". VISUAL: PENDING.
- **G7 CONCLUÍDO**: `Clip.created_at_ms` (serde opcional; legados sem data
  nunca inventada/novos) setado UMA vez na 1ª publicação em generation;
  badge "Novo" no poster (abrir = Ver clipe → persiste em
  cnp.clipsOpened.v1); tempo relativo ("Agora/há N min/h/d", now
  injetável) + title com data exata; nome de arquivo de export de clip =
  "{projeto}-{título≤40}"; TS 233/233 (+6 clip-freshness).
- **G8 CONCLUÍDO (entrega)**: geração REAL pelo pipeline novo (com refine):
  603 s, 8 cortes, 8/8 com createdAtMs, badge 8 "Novo" + "há 10 minutos"
  visíveis na galeria (screenshot g8-galeria-badge-novo.png); 3 cortes
  exportados pelo pipeline real com nomes identificáveis
  (g8-corte-{1,2,3}-{título}.mp4; Δ duração 0,00–0,03 s; fidelidade
  verbatim OK nos 4 checados). UI-dialog export comprovado no G3A
  (ok:true); nesta rodada a automação do clique falhou por timeout do
  locator (sem erro de produto) — registrado honesto em g8-entrega.json.
  Rejeitados listados (8 com notas 41–91; gate B sem cherry-pick).
- **PRÓXIMO PASSO**: G9 relatório didático + GUIA + AGENTS/TOOLING
  conformidade + rubrica final dos 3 cortes → apresentar ao mantenedor
  (aceite EDITORIAL pendente por definição).
  validação visual → G7 UI (Novo/tempo relativo) → G8/G9 aceite.
  Gemma 12B × Qwen3-4B (mesma transcrição/amostra/critérios; custos por
  etapa) → G6 proposta IA local → G3C validação visual → G7 UI → G8/G9.
- **PRÓXIMO PASSO**: concluir leitura dirigida (storage/tasks-celery,
  prompts por categoria, render/captions do Studio) + comparação
  artbyjazi dirigida → G5 comparação por capacidade + matriz 4B×12B →
  G6 proposta → G7 UI (Novo/tempo relativo) → G8/G9 aceite e entrega.

### Case Product Design v1 — apresentação (2026-10-21)

- **Escopo:** apresentação solicitada para entrevista de Product Designer Pleno, autorizada por `/start`. Sem alteração de código, manifestos, motores, requisitos ou commits; versão do aplicativo permanece 0.19.0.
- **Documento:** `design/case-study-v1/CutNicePro-Product-Design-Case-Study-v1.figcraft`, criado no FigCraft 0.8.0 via MCP attached, em documento separado: 12 frames 1920×1080 + página de biblioteca. PDF rasterizado de apoio no mesmo diretório.
- **Fontes/artefatos:** documentação obrigatória, estado UPD-020 e código consultado; cinco imagens reais incorporadas (Home, dois estados históricos do editor e propostas A/B REFERENCE); benchmark secundário em fontes oficiais. Inventário com hashes em `design/case-study-v1/sources.json`. Wireframes retrospectivos e timeline de processo identificados como explicativos.
- **Validação:** dimensões/limites/tipografia/variáveis/componentes e conteúdo inspecionados; 12 renders revistos. Sem nova execução de testes do aplicativo. Dados 24/27 da UPD-020 permanecem evidência histórica com três verificações não concluídas declaradas. Prévia teve exibição inconsistente; comparação binária confirmou dois renders idênticos, sem causa isolada (export-method.txt).
- **Estado:** apresentação IN REVIEW; FUNCTIONAL STATUS PASS no escopo de autoria; REGRESSION STATUS NOT TESTED (aplicativo não alterado); VISUAL STATUS PENDING HUMAN APPROVAL.
- **Commit:** NENHUM. Alterações preexistentes UPD-019/020 e assets preservados.
- **Pendências herdadas:** todas as pendências de engenharia/validação humana acima permanecem. Próximo passo desta apresentação: avaliação estética e narrativa pelo mantenedor; não é uma nova especificação de UI para implementação.


### Case Product Design v2 — apresentação (2026-10-21)

- **Escopo autorizado:** executar o plano aprovado de 8 frames principais + 4 de apoio. Sem alterações no aplicativo, dependências, manifestos, versão 0.19.0 ou Git.
- **Documento:** design/case-study-v2/CutNicePro-Product-Design-Case-Study-v2.figcraft, FigCraft 0.8.0 via MCP attached. Página 01: 12 frames 1920×1080, em 3 linhas de 4. Página 02: biblioteca. Página 03: referências, fora do PDF. PDF nativo com exatamente 12 páginas e texto selecionável; roteiro de fala no mesmo diretório.
- **Fontes:** capturas reais históricas da Home/editor, explorações Creative Studio/AI Clip Workspace e 3 telas do Social Team extraídas do miniportfólio atualizado. Novos relatos do mantenedor registrados com limites no CASE-STUDY-LOG; não são pesquisa executada pelo agente nem métricas auditadas.
- **Preservação:** original v1 com miniportfólio intacto, SHA-256 41b71141e2123f1a7d246b9eb6df1dd2921b099d8d242f3d832bd1c5949232ea. Sessão antiga não gravada sobre ele.
- **Verificação:** 12 frames inspecionados incrementalmente, bounds/camadas/componentes/tokens conferidos e uma rodada delimitada de correção de geometria. PDF relido/renderizado; evidências em validation.json e document-inspection.json. FUNCTIONAL STATUS PASS no escopo da apresentação; REGRESSION STATUS NOT TESTED (aplicativo fora do escopo); VISUAL STATUS PENDING HUMAN APPROVAL.
- **Commit:** NENHUM. Pendências preexistentes UPD-019/020 preservadas.
- **Próximo passo:** mantenedor avalia narrativa/estética e ensaia a rota 1, 2, 5, 8 para o recrutador; apoios 9–12 para aprofundamento. Não é especificação visual aprovada para implementação.


### Revisão de voz do case v2 — 2026-10-22

- Correção autorizada pelo mantenedor: revisão em primeira pessoa, concisa, removendo linguagem interna dos slides e do roteiro. Mesmo arquivo FigCraft v2, sem criar outra apresentação.
- Antes da edição, foi detectada divergência entre sessão antiga e arquivo atualizado pelo mantenedor. A versão salva foi recarregada antes das alterações, preservando fundos brancos, imagens, posições, fontes e o frame adicional 390. O texto 175 removido pelo mantenedor não foi recriado.
- 60 camadas de texto revisadas em 61 operações, incluindo uma correção de rótulo para evitar colisão. Nenhuma camada criada/removida pelo agente. PDF do mesmo nome atualizado com os 12 frames da apresentação; frame adicional preservado no documento. Roteiro atualizado no mesmo caminho.
- Verificação: 12 critérios objetivos PASS; nenhuma diferença nos estilos/posições inspecionados e nenhum overflow/colisão textual final. Evidência: design/case-study-v2/validation-revisao-textual.json. FUNCTIONAL STATUS PASS; REGRESSION STATUS NOT TESTED; VISUAL STATUS PENDING HUMAN APPROVAL. Sem mudança de aplicativo, versão ou commits. Próximo passo: revisão narrativa pelo mantenedor.


### Case Product Design v3 — nova página no mesmo FigCraft (2026-10-22)

- **Escopo:** nova versão solicitada com revisão narrativa e slides adicionais. Mesmo arquivo design/case-study-v2/CutNicePro-Product-Design-Case-Study-v2.figcraft, nova página 04 (id 427), 16 frames em grade 4×4. As três páginas preexistentes permanecem estruturalmente idênticas à fonte carregada.
- **Mudanças:** abertura com contexto imediato; descoberta e roadmap separados; cinco semanas com foco maior em Discovery/Define/Ideate; avaliação comercial em slide próprio, 10 usuários divididos 5/5 conforme resposta do mantenedor; user flow nativo com ramificação e retorno; biblioteca contextualizada; problema e solução de transcrição em dois slides; alternância Dark/Light com variáveis próprias.
- **Entregas:** PDF de 16 páginas, roteiro e inventários em design/case-study-v3/. Sem novo arquivo FigCraft. Página V3 aberta na aplicação.
- **Validação:** 63 verificações objetivas PASS, 0 FAIL finais; 16 frames inspecionados, uma rodada delimitada de correção e PDF renderizado. Páginas anteriores preservadas. FUNCTIONAL STATUS PASS; REGRESSION STATUS NOT TESTED (aplicativo fora do escopo); VISUAL STATUS PENDING HUMAN APPROVAL.
- **Fontes/limites:** novos relatos registrados no CASE-STUDY-LOG e em sources.json. Distribuição semanal aproximada conforme orientação do mantenedor; avaliação comercial qualitativa, sem inferir pagamento ou conversão. Não altera decisões comerciais canônicas, requisitos ou versão do aplicativo.
- **Git:** nenhum commit/push; pendências preexistentes mantidas. Próximo passo: revisão humana da V3 e ensaio com o roteiro.


### Case Product Design v4 — narrativa final com placeholders (2026-10-22)

- **Escopo autorizado:** executar o roteiro final de 12 slides do mantenedor, com áreas de imagens substituídas por placeholders. Sem mudança de código, dependências, manifestos, versão 0.19.0 ou Git.
- **Documento:** mesmo design/case-study-v2/CutNicePro-Product-Design-Case-Study-v2.figcraft, nova página 05 (id 867), identificada V4 IN REVIEW; 12 frames 1920×1080 em grade 4×3. As quatro páginas preexistentes foram comparadas e preservadas estruturalmente. Nenhum novo arquivo FigCraft.
- **Implementação:** narrativa de contexto a aprendizado, user flow nativo com retorno de ajuste, temas Dark/Light, Poppins, tokens vinculados, quatro instâncias de variantes do botão e 12 placeholders editáveis com instruções. Nenhum print novo incorporado.
- **Entregas:** PDF de exatamente 12 páginas, Guia-de-imagens-v4.txt, sources.json, validation.json e renders em design/case-study-v4/. PDF atual contém as áreas reservadas, conforme solicitado.
- **Validação:** 64 critérios de artefato PASS, 0 FAIL; inspeção incremental dos 12 frames e do PDF renderizado; limites/textos/camadas sem achados; uma rodada inicial, nenhuma correção adicional. FUNCTIONAL STATUS PASS; REGRESSION STATUS NOT TESTED (aplicativo fora do escopo); VISUAL STATUS PENDING HUMAN APPROVAL.
- **Continuidade:** nenhum commit/push. Pendências de engenharia anteriores mantidas. A V4 é apresentação de portfólio e não especificação de produto aprovada. Próximo passo: mantenedor insere as imagens indicadas, revisa estética/narrativa e reexporta somente a página V4.


### Revisão isolada do UI Kit por screenshots — 2026-10-22

- **Escopo:** somente UI Kit (frame 1072, último slide conforme ordem ajustada pelo mantenedor) no mesmo arquivo FigCraft v2 / página 05. Fonte: quatro screenshots fornecidos; código do aplicativo não consultado nem alterado. Os outros 11 slides e 49 objetos preexistentes fora do alvo foram preservados.
- **Entrega:** paleta interpretada dos prints, Poppins Regular/Bold, escala de 4 px, grid real 12×128 px com gutter 16 e margens 104, quatro estilos tipográficos, 23 variáveis próprias. Sete famílias de UI: botões, abas, busca, seletor, switch, slider e presets. 22 componentes principais, cinco conjuntos, 13 variantes e 16 instâncias no slide. Biblioteca de apoio adicionada à página 02 sem modificar seus objetos anteriores.
- **Validação:** 66 critérios PASS, 0 FAIL finais; um gap padrão 10 em dois chips corrigido para 8 na repetição delimitada. Troca de estados, rótulo e ícone verificada nativamente; geometria e z-order sem achados. PDF atualizado com 12 páginas e UI Kit em último; página renderizada e inspecionada. FUNCTIONAL STATUS PASS (artefato); REGRESSION STATUS NOT TESTED; VISUAL STATUS PENDING HUMAN APPROVAL. Evidências em design/case-study-v4/ui-kit/.
- **Continuidade:** sem commit, push, mudança de versão ou aprovação de UI do aplicativo. Próximo passo: revisão estética do mantenedor no FigCraft; estados de hover são variantes de design, não protótipo interativo.

### Análise estática da timeline para direcionamento do ZCode — 2026-10-22

- Escopo autorizado: leitura do código e pesquisa oficial; nenhuma implementação ou execução do aplicativo. O mantenedor relata picos de cerca de 3 GB e playhead retornando antes de alcançar o alvo, com 2–3 segundos de atraso. Esses valores não foram medidos pelo agente.
- Constatações: `local_media_scheme.rs:105` lê o arquivo inteiro por requisição antes de copiar Range em `:118`; alvo de seek e eventos do vídeo escrevem no mesmo `time` (`VideoEditor.tsx:214/317`, `VideoPreview.tsx:73`); debounce de 150 ms não impede renderização do TranscriptPanel sem memo; rAF da timeline captura a primeira coordenada agendada, sem atualizar as posteriores do mesmo frame.
- Evidência e limites: `docs/reports/evidence/timeline-static-2026-10-22/analysis.txt` e hashes dos seis arquivos centrais. Defeitos estruturais identificados; contribuição aos picos e ordem exata dos eventos exigem runtime. Não há aceite de correção, nem confirmação da redução de custo de 8,5x.
- Próximo passo sugerido ao ZCode: leitura parcial limitada, arbitragem de tempo solicitado/confirmado, isolamento medido de renderização; avaliar proxy de edição após corrigir esses pontos. Código, dependências, versão, index e commits preservados. FUNCTIONAL STATUS PARTIAL (bug sem correção nesta análise); REGRESSION STATUS NOT TESTED; VISUAL STATUS PENDING HUMAN APPROVAL.


### Pesquisa externa da timeline e prompt de correção — 2026-10-22

- Escopo autorizado: estudar implementações e documentação externa, cruzar com a análise estática anterior e preparar prompt para o ZCode. Nenhuma correção de código aplicada; versão 0.19.0, manifestos, dependências e index preservados.
- Estudo delimitado de 17 arquivos, quatro repositórios, com revisões fixadas: Tauri (I/O parcial), OpenCut Classic (playhead/playback/cache), Kdenlive (proxy/cache) e Remotion (estado do Player/licença). Módulos, contratos, licenças, testes observados e limites acrescentados ao documento canônico `docs/references/OPEN-SOURCE-ENGINE-RESEARCH.md`.
- Entrega: `docs/reports/evidence/timeline-research-2026-10-22/prompt-zcode.txt`, inventário de URLs/SHAs/hashes em `sources.json`. Ordem proposta: Range realmente parcial e limitado; arbitragem solicitado/confirmado; isolamento medido de render; proxy FFmpeg se o custo residual exigir.
- Estado: pesquisa e prompt concluídos; problema do aplicativo permanece aberto, sem novo runtime, teste de performance ou confirmação de causa única. Nenhum aplicativo externo foi instalado/testado. Não há comprovação da arquitetura interna do editor OpusClip.
- Próximo passo: mantenedor encaminha o prompt ao ZCode. Implementação deve medir vídeos reais, registrar critérios antes do build e manter PARTIAL/BLOCKED sem scrub validado. Pendências herdadas UPD-019/020 e aprovação humana permanecem. Sem novo identificador de release/UPD ou commit.


### Prompt para estudo completo do editor OpenCut — 2026-10-22

- Escopo: reformular o direcionamento ao ZCode após persistência da lentidão. Nenhuma implementação solicitada ao Codex nesta tarefa.
- Entrega: `docs/reports/evidence/opencut-fluxo-completo-2026-10-22/prompt-zcode.txt`. Exige rastrear integralmente o caminho relevante do editor, desde importação/ponteiro até leitura/decode/composição/apresentação/cleanup, incluindo dependências efetivamente usadas, e comparar com CutNicePro.
- Conferência oficial: README OpenCut e668010778568641babef2cc40be4703ae6916d6 informa opencut.app em Classic; reescrita Rust em new.opencut.app. Deploy exato não confirmado. Auditoria completa ainda é trabalho a executar pelo ZCode, não resultado desta entrega.
- Estado: PASS no escopo do prompt; aplicativo continua sem aceite de timeline. Fonte da observação de desempenho: mantenedor; nenhum novo teste runtime. Sem commit/push, mudança de versão ou index; pendências herdadas preservadas. Próximo passo: encaminhar prompt e exigir medição de playhead e prévia separadamente.


### Revisão estática após Blob URL e novo direcionamento — 2026-10-22

- Escopo: conferir o relatório ZCode 1530 e código atual; preparar prompt, sem implementar correções. A demora/travamento continua conforme relato do mantenedor; nenhum runtime executado nesta tarefa.
- Evidência: `docs/reports/evidence/revisao-blob-timeline-2026-10-22/analysis.txt`, hashes de sete arquivos e prompt-zcode.txt. Confirmados fetch→blob integral na reconexão, ramo Rust sem Range integral, intervalo aberto sem teto, múltiplos ranges caindo em 200 completo, debounce/estado no pai e componentes sem memo explícito. Isso não quantifica contribuição à latência.
- Referência OpenCut: VideoCache utiliza BlobSource/CanvasSink e controle de pedidos, além da existência de object URLs. Consumidor até a apresentação ainda precisa ser rastreado pelo ZCode. Não afirmar mesma arquitetura ou IPC como gargalo comprovado.
- Próximo passo: comparar OpenCut, vídeo mínimo no mesmo WebView2 e editor completo com a mesma fonte, separando tempo do playhead e frame. Escolher/implementar correção pelos dados, sem outra alteração especulativa.
- Estado: PASS para revisão/prompt; defeito do aplicativo aberto. Sem alteração de app, index, dependências ou versão. Sem commit/push; pendências herdadas mantidas. Aprovação humana pendente.


### Objetivo delimitado para execução no ZCode — 2026-10-22

- Pedido: adaptar o prompt técnico para /goal, com prevenção de loops e regressões. Nenhuma meta foi iniciada pelo Codex; entrega é texto para o mantenedor encaminhar ao ZCode.
- Arquivo: `docs/reports/evidence/goal-timeline-2026-10-22/objetivo-zcode.txt`. Preserva especificação anterior; acrescenta checkpoints diagnóstico/correção/validação, critérios mensuráveis, limite de 120 min ativos e duas candidatas, orçamento global de testes e parada com continuidade quando não houver aceite.
- Estado: PASS no escopo de redação/verificação; capacidade ou sintaxe operacional de /goal no ZCode não foi confirmada nos documentos locais consultados (busca sem correspondências). Nenhuma promessa de persistência/limite automático do aplicativo foi feita.
- Próximo passo: mantenedor cadastrar o texto como objetivo no ZCode, usando controles de orçamento do próprio produto se disponíveis. Não confundir encerrar a rodada com concluir a meta. Sem alteração de app, index, dependências, versão, commits ou push; problema da timeline permanece aberto.


## TAREFA 2026-10-24 — REFINO EDITORIAL + FLUXO LOCAL (goal-refino-editorial-fluxo-local-2026-10-24)

> Fonte: `docs/reports/evidence/goal-refino-editorial-fluxo-local-2026-10-24/prompt-goal-zcode.txt`
> (herda as regras do goal-recuperacao-autoclip-2026-10-23). Relatório:
> `docs/reports/history/2026-10-24_043324_goal-refino-editorial-fluxo-local-final.txt`.

- **F1 (reuso do motor):** `Engine::GemmaTextServer` implementado (llama-server
  sem mmproj, opt-in `CNP_TEXT_SERVER=1`) com queda automática por chamada para
  o executável. A/B medido na janela inédita 600–900 s (transcrição real):
  exec 120 s × server 843 s (7× mais lento); RAM 10,2 × 17,9 GB; VRAM 8,6 ×
  2,8 GiB. **REJEITADO como padrão** (sem cache KV/batch entre requests o
  server soma latência); permanece opt-in experimental. Reuso só faz sentido
  com cache de prefixo/batch — fora do escopo autorizado.
- **F2 (gate D):** bug REAL corrigido — "Editar clipe" interno não entrava no
  modo corte (`ProjectWorkspace` não remonta com a mesma key; `useEffect` agora
  sincroniza `initialView==="editor"`). Edição (dividir 33%/80% + remover o
  meio → 2 segmentos = 9,07 s), persistência na reabertura e preservação dos
  12 cortes antigos COMPROVADAS na UI (run 9). MP4 real pelo pipeline do app:
  9,157 s (Δ 0,05 s).
- **F2c (2026-10-24 ~08h20, FECHA o critério "MP4 pelo botão real"):** o
  bloqueio "clique+ENTER não publicou" de todas as goals era BUG DE PRODUTO —
  contrato divergente: `effectiveCaptionStyle` (lib/captions.ts) envia
  `wordsPerCaption`; `CaptionStyle` Rust (`deny_unknown_fields`) só aceita
  `wordsPerLine` → serde rejeitava TODO export pela UI com legendas ativas
  ANTES de abrir o diálogo (causa do erro "Não foi possível processar o
  vídeo" que o mantenedor viu; os harnesses de ENTER falhavam porque não
  havia diálogo). CORREÇÃO: `#[serde(alias = "wordsPerCaption")]` em
  `words_per_line` (render/settings.rs); teste de regressão com o payload
  exato da UI: FAIL antes → ok depois; suíte 171: 160/0/11. GATE D COMPLETO
  em lab (perfil próprio): clique REAL (computer-use/UIA) no Baixar do card →
  diálogo nativo "Exportar vídeo" ABRIU (nome G7 projeto-título) → Salvar →
  "Vídeo exportado." → MP4 publicado 17,142 s vs 17,12 (Δ 0,02 s), sha256
  617ee2ca…, evidência f2c-corte-BOTAO-dialogo-nativo.mp4. **App do
  mantenedor (PID 56308) segue em build target-refino SEM este fix — precisa
  reabrir com target-f2c quando ele avisar.**
- **F3 (rubrica por corte dos 8 do G8):** 6/8 ≥8/10 com fidelidade 2/2;
  1085,7–1127,6 = 7/10 e 900,9–938,2 = 6/10 (fid 8/8, sem vetos da rubrica).
  **Divergência registrada: os 3 exportados foram REPROVADOS pelo mantenedor
  apesar de rubrica 10/9/10** — rubrica 0–2 não capturou a severidade. Causa
  diagnosticada: prompt de seleção/título (janela corta a ideia), NÃO os
  thresholds do `borders.rs`; calibração de prompt + re-geração da amostra
  reprovada ficou PENDENTE de autorização (não executada).
- **F4 (entrega avaliável):** `f4-tabela-de-videos.md` (4 MP4s + 8 do G8 com
  estados, durações ffprobe medidas e diferenças verificáveis) e
  `GUIA-DO-MANTENEDOR.md` próprio deste goal (sem misturar labs). App do
  mantenedor reaberto com a build nova (target-refino, PID 56308) — a sessão
  anterior rodava build antiga sem o fix.
- **Validação:** Rust 159/159; TS 233/233; tsc/eslint OK; build isolado em
  `CARGO_TARGET_DIR=target-refino` (o app antigo não foi fechado). Graphify
  remoto consultado (impact `ProjectWorkspace` → único chamador externo é
  `App()` L368; `text_server_tools` UNRESOLVED no índice = defasagem local
  declarada e provada; índice em ab501e2 = HEAD). Dados do mantenedor
  preservados (labs em perfil WebView próprio; plano de edição persiste em
  localStorage do perfil, não no arquivo de clipes).
- **Estado/pendências (atualizado após F2c):** FUNCTIONAL PASS das frentes
  técnicas (F1 por números; F2 gate D COMPLETO incluindo botão+diálogo
  nativo; F3 documentada; F4 entregue); REGRESSION PASS (Rust 171: 160/0/11;
  TS 233/233 inalterado); VISUAL/EDITORIAL PENDING HUMAN APPROVAL — sem
  aceite do mantenedor o goal permanece PARTIAL por definição. Sem
  commit/push/bump. Orçamento: ~5 h de 8 h próprias. Relatório v2:
  history/2026-10-24_052648_goal-refino-editorial-fluxo-local-final-v2.txt.
  **Próximo passo: (0) mantenedor fecha/avisa para reabrir o app com a build
  corrigida (target-f2c); (1) decisões do GUIA — aceite editorial dos vídeos
  (f2c-corte-BOTAO + EDITADO); autorização da calibração de prompt +
  re-geração da amostra reprovada; ratificação da rejeição do server e do
  piso de RAM ~10,2 GB; Qwen 4B como modo rápido.**
