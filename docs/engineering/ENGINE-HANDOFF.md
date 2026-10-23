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
