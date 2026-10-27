# CutNicePro — Traceability

## Usabilidade em revisão — 2026-10-25

JRN-004/009/010, FR-005/011/013/014 e os aceites AC-016..022/050..055 citados no BACKLOG: UploadScreen → import-project → import_media/workspace-store; VideoEditor → EditorTimeline/TimelineSurface/useTimelineTrim → EditPlan/clips → inspeção/export; SplitScreenControls → split-framing → worker/split_worker → SplitScreenSettings.shots → SplitPreview e render::composition_windows/geometry_at. Plano/aceites da fatia em USABILITY-IMPLEMENTATION-PLAN.md; estado/evidências em ENGINE-HANDOFF.

BR-USAB-01: a duração original limita a ampliação manual, sem usar a fronteira da IA como teto. BR-USAB-02: um gesto confirma uma edição; cancelamento não salva o draft. BR-USAB-03: split aplica somente pares confirmados da cena/área visível, sem repetir um participante nos closes. AC-USAB-01: ampliar/desfazer/refazer/salvar/reabrir mantém os mesmos intervalos no download. AC-USAB-02: a seleção coincide com miniaturas/áudio em larguras distintas e ambas as alças permanecem acessíveis. AC-USAB-03: par → close → par produz a mesma composição na prévia e MP4, com áudio/ASS/vãos preservados. Testes automatizados e worker real registrados; interação/estética na sessão normal continuam PENDING HUMAN APPROVAL.

> Conexões explícitas Jornada ↔ Regra ↔ Requisito ↔ História ↔ Aceite ↔ Validação.
> Registros só apontam para elementos existentes (auditado por script — §Auditoria).
> Referência não resolvida = pendência declarada, nunca preenchida com invenção.

## 1. Matriz por jornada

Versões sobrepostas autorizadas em 2026-10-25: JRN-002/008/009 → FR-010/013/014 → BR-019/020/023 → AC-041/042. Seleção/ranking, dedupe, reparo, cenas e bordas permitem versões independentes parcialmente sobrepostas/contidas; contrato automático e campo personalizado aceitam até 16, 17 é recusado. Worker/consumidor facial recebem até 16 cortes sem alterar as 12 amostras por corte. Testes: selection, semantic_tests, generation, editorial_repair, borders, scene_regions, face_framing, test_worker.py e clip-flow.test.tsx. Persistência/exportação no teste nativo integral, distinto da validação humana. Regras de qualidade e segmentos internos do EditPlan permanecem; estado efetivo no ENGINE-HANDOFF.

Correção pelo feedback manual de 2026-10-25: JRN-008/009 → FR-010/013/014 → BR-019/020/023 → AC-041/042/053/054/057. `isolatedClipSettings` preserva cover explícito e edições salvas; `ClipInspection` limita a legenda ao trim. Regressões em face-framing e clip-inspection-boundaries. `editorial::enforce_ending` impede fechar em anúncio de continuação; `assessment`/`semantic` distinguem contexto integral de fala incluída; `editorial_repair` usa fonte integral/citações localizadas. `generation_rounds` limita a uma busca adicional automática, com histórico só do job e preservação no erro; `source_anchors` admite até dois pequenos erros de cópia, com unicidade/extremos e avaliação posterior. Suítes determinísticas e ensaios locais da fonte inteira em `feedback_runtime_tests`; aprovação humana e lacunas editoriais no handoff, sem promover contagens a aceite.

Regeneração independente e localização literal, pedido posterior de 2026-10-24: JRN-008 → FR-010 → BR-019/020/023 → US-014/015 → AC-041/042. A biblioteca anterior deixa de alimentar descoberta/vetos; `generation_batch.rs` publica identidade/data por execução e preserva os registros anteriores. `source_anchors.rs`/`discovery_reply.rs` localizam abertura/fechamento únicos na transcrição completa no modo automático, sem aceitar citações inventadas, ambíguas ou invertidas; personalizado mantém referências de linhas. Os limites técnicos e o avaliador não foram reduzidos. Testes determinísticos de persistência/grounding e ensaio nativo `comparison_runtime_tests.rs` cobrem geração integral, regeneração de conteúdo excluído com ID/data novos, preservação de título/revisão/exclusão, salvar/reabrir e export. Comparação das referências e limites editoriais no ENGINE-HANDOFF e no manifesto pipelines-comparados-2026-10-24.json. Este registro revoga o bloqueio de repetição entre execuções descrito nos históricos abaixo.

Refino local e comparação Qwen3.5, 2026-10-24: JRN-008 → FR-010 → BR-019/020/023 → US-014/015 → AC-041/042. `novelty.rs`/`selection.rs` retiram duplicatas antes das vagas; `assessment.rs` unifica o julgamento fundamentado e traduz categorias internas; `editorial_repair.rs` recupera intervalos e preenche só vagas livres; `generation.rs` preserva a coleção e tenta uma nova descoberta após as recusas. Fonte inteira e orçamento 32K em `text_engine.rs`/`engine_tools.rs`; migração legada em `qwen35_contract_tests.rs`. Os ensaios reais e falhas editoriais estão no ENGINE-HANDOFF. O aceite do parâmetro do assistente não aprova saídas do Qwen; 9B autorizado apenas para comparação, sem promoção após o teste.

Adaptação AutoClip 2026-10-24: JRN-008/009 → FR-010/013/014 → BR-019/020/023 → US-014/015/020/023 → AC-041/042/053/054/057. Novos contratos e testes: flags de autonomia/conclusão em selection.rs; bordas por frase através de linhas, pergunta retórica e início/fim corretos em borders.rs; nova avaliação dos intervalos alterados e recusa de abertura/fechamento fracos em editorial.rs; YuNet local e metadado opcional em face_framing.rs/types.rs/clips.ts; precedência manual e payload comum prévia/export em face-framing.test.ts. Registro do mantenedor: biblioteca mais leve e organizada após seus testes. Novos resultados editoriais/framing aguardam teste manual; não são aprovados por essa confirmação anterior. Ensaio nativo de fronteiras/rostos/export é técnico e não um corte selecionado pela IA para aceite editorial.

Atualização de implementação 2026-10-24: JRN-002/008 → FR-004/010 → BR-019/020 → US-003/014/015 → AC-006/041/044/045. Complementos aprovados no pedido: biblioteca em seções por projeto, miniaturas sem players persistentes e Novo por 60 min independentemente de abertura. Testes em clip-gallery-behavior, clip-poster, clip-thumbnails e clip-freshness; miniatura FFmpeg real em media_preview/thumbnail.rs. Validação manual da interface/scroll permanece com o mantenedor, conforme sua preferência. Detalhes no BACKLOG e no registro canônico do ENGINE-HANDOFF; não implica aprovação editorial dos cortes.

Leitura da revisão 03N: PROPOSED nas matrizes descreve estado de aprovação do produto/jornada, não ausência de código. Estado operacional em ENGINE-HANDOFF.md; evidências por entrega abaixo permanecem históricas. Relato atual do mantenedor reabre análise e preenchimento como defeitos, apesar dos testes da 03M.

| Mudança documentada na 03N | Jornada/requisito/regra | Fonte e critério pendente |
|---|---|---|
| Resumo natural e concreto, sem metalinguagem técnica | JRN-008, FR-010, BR-023, US-014/015 | ClipDetails.tsx, semantic.rs e analysis-prompt.txt; avaliar acontecimentos/contexto/reação/desfecho sem inventar conteúdo |
| Quadro 9:16 preenchido, sujeito/legenda preservados | JRN-008/009/010, FR-013/014, US-020/023 | ClipTools inicializa 9:16; isolatedClipSettings define contain; formato, composição e render devem ser validados separadamente |
| Retirada de Large completo; manter Turbo | JRN-006/007/013, FR-022, DEC-014 | profiles.rs/tools.rs, lib/transcription.ts e TranscriptionSetup; decisão aprovada, implementação/compatibilidade pendentes |
| Estudo verificável de referências antes de implementar | NFR-004/006, ENGINE-HANDOFF, AGENTS.md | OPEN-SOURCE-ENGINE-RESEARCH: revisão/arquivos/funções/contratos/licenças/testes; sem afirmar adaptação ainda não demonstrada |

Escopo executado na 03N: somente documentação existente e relatório obrigatório; nenhum destes defeitos foi corrigido no código por esta revisão.

| Jornada | FR cobertos | BR aplicados | Histórias (US) | ACs (amostra) | Validação planejada | Status |
|---|---|---|---|---|---|---|
| JRN-001 Primeira execução | FR-001, FR-002 | BR-001, BR-002 | US-001, US-002 | AC-001..005 | H1 (teste de usabilidade) | PROPOSED |
| JRN-002 Recorrente | FR-002, FR-004, FR-016 | BR-002, BR-004, BR-032, BR-033 | US-003, US-005 | AC-006..008, AC-012..013 | H7 | PROPOSED |
| JRN-003 Criação do projeto | FR-003 | BR-001, BR-002 | US-004 | AC-009..011 | H1 | PROPOSED |
| JRN-004 Importação | FR-005, FR-006 | BR-006..BR-011, BR-032 | US-007, US-008, US-009 | AC-016..024 | H2 | PROPOSED |
| JRN-005 Modo | FR-007 | BR-009, BR-012, BR-013 | US-010, US-016 | AC-025..027, AC-046 | H2 | PROPOSED |
| JRN-006 Configuração | FR-008 | BR-012, BR-024 | US-011 | AC-028..030 | H2 | PROPOSED |
| JRN-007 Processamento | FR-009 | BR-013..BR-018 | US-012 | AC-031..036 | H3 | PROPOSED |
| JRN-008 Resultados | FR-010 | BR-019..BR-023 | US-014, US-015 | AC-040..045 | H4 | PROPOSED |
| JRN-009 Edição avançada | FR-011, FR-012, FR-013 | BR-020, BR-022, BR-025, BR-026 | US-017..US-022 | AC-047..056 | H5 | PROPOSED |
| JRN-010 Exportação | FR-014, FR-015, FR-018 | BR-027..BR-031 | US-023..US-025 | AC-057..063 | H6 | PROPOSED |
| JRN-011 Continuidade | FR-016, FR-017 | BR-005, BR-015, BR-018, BR-032..BR-034 | US-003, US-005, US-006 | AC-012..015 | H7 | PROPOSED |
| JRN-012 Primeira ativação | FR-025 | BR-037, BR-048, BR-049 | US-033 | AC-081..083 | H8 (futura) | PROPOSED |
| JRN-013 Configuração do motor de IA | FR-022..FR-024, FR-026..FR-028 | BR-039..BR-047, BR-050 | US-029..US-032, US-037 | AC-067..080, AC-092..093 | H8 | PROPOSED |
| JRN-014 Exceções comerciais/motor | FR-025..FR-028 | BR-037, BR-041, BR-043..BR-049 | US-033..US-035, US-037 | AC-081..088, AC-092..093 | H7/H8 | PROPOSED |

## 2. Matriz por requisito (FR → histórias)

FR-001 US-001 · FR-002 US-001/002/003 · FR-003 US-004 · FR-004 US-003/005 · FR-005 US-007/008 ·
FR-006 US-009 · FR-007 US-010 · FR-008 US-011 · FR-009 US-012 · FR-010 US-014/015 ·
FR-011 US-019..022 · FR-012 US-013/017/018 · FR-013 US-020/021 · FR-014 US-023/024 ·
FR-015 US-023 · FR-016 US-005 · FR-017 US-006 (V1) · FR-018 US-025 ·
FR-019 US-036 (MVP-hipótese DEC-013) · FR-020 US-027 (V1) · FR-021 US-028 (V1) ·
FR-022 US-029 · FR-023 US-030 · FR-024 US-031 · FR-025 US-033..035 (comercial) ·
FR-026 US-030/032/035 · FR-027 US-037 · FR-028 US-032 · FR-029 US-036.

NFR-001 DEC-001 · NFR-002 PENDING alvos · NFR-003 US-005/AC-013 · NFR-004 US-012/AC-036 ·
NFR-005 diretrizes de design (docs/design/) · NFR-006 arquitetura em camadas (AGENTS.md) ·
NFR-007 BR-031/BR-036.

## 3. Matriz por regra (BR → aplicação)

Todas as BR-001..036 aparecem em ≥1 jornada/história (colunas acima; verificação por
script abaixo). Sem regra órfã detectada.

## 4. Auditoria de consistência (executada)

Método: script versionado **`tools/audit/id_audit.py`** (`--root` parametrizável;
comportamento preservado do protótipo de 2026-10-17 que vivia em `.tooling/`, área
ignorada). Testes executados em 02A.1: POSITIVO (repo real) e NEGATIVO (sandbox com
referências falsas de numeração inexistente — ambas detectadas; sandbox removido).

Resultados (2026-10-17, Fase 02A.1 — saída completa no relatório da tarefa):
- Referências a IDs inexistentes: **0** (conjuntos: FR 29, NFR 7, JRN 14, BR 50, EPIC 12,
  US 37, AC 93, DEC 13 — numeração contígua, 0 lacunas).
- Definições duplicadas reais: 0 (repetições = menções internas legítimas nos canônicos).
- Teste negativo do script: sandbox com duas referências falsas (numerações 999/099 dos
  prefixos FR/JRN) — ambas detectadas e o sandbox foi removido.

### Cobertura da implementação M1 (Fase 03, 2026-10-18)

Implementado e evidenciado: US-002 (AC-004 — CTA único e estado vazio), US-004 (AC-009
criação por modal com nome; AC-010 local padrão em app-data; AC-011 workspace vazio),
US-005 parcial (AC-012/AC-013 — persistência automática em JSON local, reabertura
restaura projetos; teste cargo test dedicado), US-003 parcial (AC-006 lista com metadados
básicos; AC-007 retomada básica por reabertura). AC-001..AC-003 (verificação de ambiente
na 1ª execução) e AC-008 (diagnóstico de item indisponível) seguem para M2+ — não
afirmados. Evidências: relatório Fase 03 (testes + execução desktop + screenshots).

### Lacunas conhecidas (declaradas, não mascaradas)

- Jornadas sem requisito: atualização do app; instalação de dependências locais; mídia
  parcialmente legível; FLUXO DE COMPRA/assinatura fora do app (DEC-010/011 — por decisão).
- Requisitos sem história: nenhum.
- Histórias sem AC: nenhuma (37/37).
- Regras sem aplicação: nenhuma; 7 PENDING TECHNICAL VALIDATION (BR-006/007/014/018/028/034/044).
- Estados sem tratamento: retomada de job (BR-018); política pós-expiração (BR-048) e
  offline (BR-049) PENDING USER DECISION.
- Funcionalidades duplicadas: nenhuma (Editor A × Revisão B papéis distintos; lote
  discriminado em importação múltipla/fila sequencial/paralelo/exportação — DEC-013).
- Dependências circulares: nenhuma (1→2→3/4→5→6→9→8→7→11→12/US-036→10).
- Decisões contraditórias: DEC-002 × DEC-010 resolvidas por DEC-011 (fases distintas do
  produto; histórico preservado, não apagado).
- Cobertura declarada ≠ 100%: hipóteses comerciais (preço/trial/dispositivos) e técnicas
  (modelos/segredos) permanecem PENDING — a ausência de IDs quebrados não é prova de
  cobertura completa (§16 da tarefa 02A.1).
- IDs definidos sem qualquer referência cruzada: nenhum essencial (FR-019..021 e US-026..028
  são V1/Won't-now por decisão de escopo, não lacuna).
- Duplicações integrais de conteúdo entre documentos: nenhuma (Brain é índice).

## Fluxo de mídia e editor — 2026-10-19

- Home aprovada pelo mantenedor; nova entrada pelo CTA e item independente Enviar vídeo (não marca Todos).
- Fonte própria consultada via MCP FigCraft attached: frames 2262, 2440 e 2391; dumps em `docs/reports/evidence/03c/`. Prints do OpusClip enviados depois orientam apenas fluxo e responsabilidades, preservando identidade CutNicePro.
- Jornadas JRN-003/004/006/008/009; FR-003/004/005/006/007/008/011/012/013 e NFR-005; BR-001/006/007/012/022. Contrato detalhado em `UPLOAD-SCREEN.md`; implementação de interface não conclui os requisitos de processamento correspondentes.
- Fluxo autorizado: referência/arquivo → preparação demonstrativa → projeto persistido → editor; reabertura pelo catálogo/recentes mostra resumo e transcrição identificada como exemplo. Renomeação persiste no storage Rust; ajustes da UI são versionados por projeto.
- Mídia binária apenas na sessão; reconexão após reinício. YouTube apenas referência; exportação/IA Local/BYOK pendentes por escopo explícito do mantenedor.
- Testes: `workspace.test.ts`, `video-source.test.ts`, `video-inspection.test.ts`, teste Rust de renomeação e runtime isolado 03D. Aprovação visual continua humana.

## Splash animado autorizado — 2026-10-18

- Solicitação do mantenedor: formar o logo do splash antes de revelar a Home, mesmo quando o boot termina rapidamente.
- Referência técnica: `storytold/artcraft-services`, commit `e57ee3d63ac478a24149384bf1473ef97aa067f8`, `frontend/apps/artcraft-website-next/src/components/landing/hero-wordmark.tsx` (consultado via GitHub).
- Adaptação revisada pelo mantenedor: apenas C centralizado desliza para a posição original; utNicePro surge como superfície única por trás da borda do C. Path Cut separado em C e ut sem alterar os comandos vetoriais, cores ou geometria final. Sequência ampliada de 1,5 s para 3 s: formação até 2,5 s e pausa final de 0,5 s; fade existente de 270 ms.
- Aceite: saída exige boot concluído e callback real de conclusão da animação; gate da Home liberado após fade; reduced-motion sem animação; cleanup cancela tween e timeout.
- Impacto: splash existente e coordenação do boot; nenhuma tela nova. Testes: `splash-motion.test.ts`, `splash-phase.test.ts`. Visual: PENDING HUMAN APPROVAL.

## Ajuste autorizado da Home — 2026-10-18

- Solicitação do mantenedor: repetir a entrada completa ao voltar de outra aba para a Home, substituindo a política de uma apresentação por sessão da 03B.11.
- Impacto: navegação existente para a Home; `IntroConductor` reinicia em cada montagem. Gate do splash, relógio compartilhado e movimento reduzido preservados. Nenhuma tela ou jornada nova.
- Aceite: retorno com sessão já marcada reinicia texto e clock; abertura aguarda o gate; movimento reduzido permanece assentado. Cobertura automatizada: `app/src/test/intro-conductor.test.ts`.
- Sidebar: continuidade da divisória na titlebar, com a mesma largura e cor do rail; aprovação visual pelo mantenedor.

## 5. READINESS GATE — PRODUCT MODEL & UX FLOW (02A.1)

**Status: PARTIAL** — estrutura válida e consistente (auditoria limpa; modelo comercial
APPROVED), mas decisões comerciais (mecanismo de acesso DEC-011, preço/trial, política
pós-expiração BR-048, offline BR-049, fila sequencial DEC-013) e técnicas (7 BRs +
modelos de IA + armazenamento de segredos) permanecem pendentes.

- Evidência: auditoria de IDs (0 quebradas/0 lacunas) + testes +/- do script versionado +
  baseline full (relatório da tarefa) + mapas visuais no FigCraft (página `roadmap`).
- Decisões aprovadas: DEC-010 (assinatura sem créditos — mantenedor); DEC-007/008/009
  (históricas). Reavaliada sem apagar: DEC-002 via DEC-011.
- Pronto para wireframes: CONDICIONAL — estruturas de fluxo/jornadas suportam wireframes
  de baixo risco; UI definitiva exige aprovação das pendências (PRODUCT DESIGN GATE).

### Correção 03E (2026-10-19)

JRN-003/004/006/008/009; FR-003/004/005/006/007/008/011/012/013: Novo projeto direciona ao envio; importação abre visão do vídeo; coleções organizam projetos. Aceites de navegação, player limitado por viewport, timeline visível, seleção controlada e caneta em UPLOAD-SCREEN.md §Correção 03E. Preparação 03D com timers e texto demonstrativo não é mais contrato vigente. Motor continua pendente.

03F — JRN-006/008/009 e FR-007/008/011/012: seleção visual de estilos em modal e navegação temporal por mouse/teclado. Contrato em UPLOAD-SCREEN.md; dependências do motor no ENGINE-HANDOFF.md, sem alegar conclusão das funcionalidades de IA/export.

### M2A — Importação persistente + análise (2026-10-19)

- **US-007/008 (parcial)/009**: import_media (cópia persistente com
  validação, detecção de áudio via ffprobe, progresso real por evento,
  cancelamento) → `app/src-tauri/src/{media_import,media_analyze,media_store}.rs`;
  UI conectada: `SourceForm` (dialog nativo + drop com paths),
  `PreparationDialog` (progresso/cancelar reais), `App.handleImportFromPath`
  (transacional — projeto preservado em falha). Duplicatas: deduplicação por
  hash com referências explícitas project_ids (remove_project_media testado).
- **Diagnóstico técnico**: analyze_media persiste duração/resolução/codec/
  has_audio na entrada do índice; mídia ausente → entrada `unavailable`
  (AC-008 parcial: causa "arquivo de mídia ausente" na UI de reabertura).
- **Validação**: cargo 30/30 + vitest 69/69 + TAURI REAL 16/16
  (evidence/m2a/results-runtime.json; AC-R1..R5 da M2A-IMPORT-SPEC.md).
  NÃO cobre: download de atualização de mídia movida (hash revalidação em
  reabertura futura), UI de exclusão de projeto (comando pronto, gatilho de
  UI pendente).

Correção M2A pós-entrega (2026-10-19): JRN-003/004 e FR de importação existentes — nome limpo para seleção/drop, indicação explícita de YouTube indisponível, preservação das referências antigas e apresentação de erro/progresso. M2A-IMPORT-SPEC.md registra o contrato corrigido; evidências m2a-fix (runtime parcial, sem nova aprovação do motor).

M3A inicial (2026-10-19): JRN-006/009; FR-007..009/012 e FR-027; BR-009/013/015/024/025/043/045. ASR local em português, estágios reais, cancelamento e persistência por projeto em `app/src-tauri/src/transcription/`; integração em `useTranscription`, `TranscriptionControls` e painéis existentes. AC-031/032/033/037/038 cobertos parcialmente por contratos/testes, sem declarar aceite ponta a ponta. AC-035/036 (fila durável/registro consultável) e AC-039 (export) não concluídos. Runtime e qualidade humana reservados ao mantenedor por instrução explícita. SPEC e roteiro em `docs/engineering/M3A-*`.

Correção M3A (2026-10-19): mesmos JRN/FR/BR/AC. Callback de progresso oficial do whisper.cpp → eventos tipados → modal acessível com porcentagem; feedback de importação por bytes; microcopy conforme skill UX Writing; adaptação de segmentos externos antes da validação estrita dos dados salvos. Aceite do vídeo que falhou continua humano, sem JSON original disponível. Contrato detalhado em M3A-TRANSCRIPTION-SPEC.md §Correção.

Refinamento editor/transcrição (2026-10-19): JRN-006/009, FR-008/011/012, BR-020/025/026; painel limitado com texto contínuo, clique e destaque por palavra quando há offsets reais; edição invalida alinhamento; timeline com cursor capturado, teclado, imagens e picos locais reais. Contratos em EDITOR-TIMING-SPEC.md; testes editor-timing.test.tsx, transcription/words.rs e media_preview/{analysis,ffmpeg}.rs. 149 casos únicos aprovados em código (52 Rust e 97 frontend); marcação estática/ponteiro controlado não substituem Tauri real. Conferência de viewport, áudio, qualidade e prévias reservada ao mantenedor; sem aprovação visual.

03H (2026-10-19): JRN-006/009/011; FR-011/012/016/017; BR-005/020/025/026; AC-015 antecipado por pedido explícito do mantenedor. Seções recolhíveis, correção/seek por palavra preservando intervalos, Cancelar secundário e onda v2; exclusão confirmada com recuperação persistente e respeito às referências de mídia; eventos de contexto preservados, menu padrão bloqueado. EDITOR-USABILITY-SPEC.md e editor-usability.test.tsx; regressões de tokens/DTW em words.rs e exclusão/recuperação em project_delete.rs/media_store.rs. 164 casos únicos de código aprovados; não equivale a ASR real ou aceite visual. Duplicação de projeto e classificação semântica de ganchos continuam fora desta entrega.

03I (2026-10-19): JRN-003/006/009/011, FR-011/012/013/017, BR-005/020/025/026. Estilo opcional e validado → workspace-store → CaptionVisual no sample e vídeo; transporte/atalho guardado; menu contextual → coleção, exclusão, seletor/cópia e TXT/SRT. Testes editor-controls.test.tsx (11), file_output.rs, project_files.rs e transcription/export.rs (3). 178 casos únicos (117 frontend e 61 Rust), sem Tauri real. Compartilhamento adiado; render de vídeo com estilos continua pendente. Contrato EDITOR-CONTROLS-SPEC.md.

03J (2026-10-19): JRN-007/008/009/010, FR-010/011/012/013/014/016,
BR-019/020/021/023/026..031, AC-040..045 parcial. clips/{ranking,scenes,store,commands}
→ useClips/ClipTools/ClipResults; render/{settings,ass,pipeline,commands} → MP4
H.264/AAC com legenda gravada. Revisão e ID vinculados à mídia persistidos;
aprovação verificada também no backend para exportar cortes identificados.
Janela móvel/progresso/cancelamento têm contratos em progress-display/cancel-flow.
Testes novos editor-autocut (7), cancel-flow (2), workspace-clip (1), Rust (12)
mais regressões: 200 casos únicos aprovados, dos quais um usa FFmpeg/ffprobe reais
com vídeo/áudio sintéticos e verifica pixels das legendas. Não é Tauri real,
benchmark ASR, validação dos melhores ganchos ou aprovação estética. BR-022,
AC-045 e requisitos de lote continuam parciais. Referência EDITOR-AUTOCUT-SPEC.md.

03K (2026-10-19): JRN-003/006/007/008/009/010; FR-010/011/012/013/014/016/017;
BR-019..023/026..031; AC-040..045 parcial. get_project_clips → useClipLibrary →
ProjectsScreen/ClipGallery; ProjectWorkspace → galeria do projeto → ClipInspection;
clip-media → inspeção/edição recuperada; content → títulos representativos e
preservação de títulos personalizados. profiles/gpu → transcrição de um modelo
selecionado, CUDA/CPU, DTW correspondente. clip-source/clip-library, testes de
store/content/profiles/gpu e benchmark_contract cobrem contratos e persistência.
215 casos únicos de código aprovados; dez casos ASR reais separados dessa contagem.
Sem aprovação estética, WER ou teste completo da UI. Referências CLIP-LIBRARY-ASR-*
e ASR-BENCHMARK-2026-10-19.md. Compartilhamento continua adiado.

03L (2026-10-19): JRN-003/006/007/008/009/010; FR-008/009/010/011/012/013/014/016/017/022; BR-019..023/026..031, refinadas por BR-03L-01..05 e AC-03L-01..06 em SOURCE-CLIP-ISOLATION-SPEC.md. VideoPreview original → ProjectOverview; clip-workspace/workspace-store → isolamento por corte; Options.format → Clip.format/ID → ClipFormatPicker/ClipPoster/inspeção/editor/render. clip-transcript/ClipTranscript → parágrafos com seek por tempos existentes. semantic/analysis_types → geração/analyze_clip → ClipDetails; gate, esquema JSON, validação de citações e invalidação de aprovação/análise após mudança do texto. Testes novos source-clip-isolation (9), semantic_tests (3 contratos + 1 motor real), ranking (1), refinement_contract (1 sobre seis saídas ASR reais). Total único da entrega: 229 aprovados (145 frontend/84 Rust); sem execução da UI Tauri ou aprovação estética. ASR permanece PARTIAL, sem alegar WER contra referência humana ou qualidade de 98%.

03M (2026-10-19): JRN-003/006/007/008/009/010; FR-008..014/016/022; BR-019..023/026..031, com regras locais BR-03M-01..05 e AC-03M-01..08 em CLIP-PIPELINE-RELIABILITY-SPEC.md. ClipInspection/useClips/ClipTools → abertura/revisão e posse do job → sete casos clip-flow; JobSnapshot.operation → restauração explícita da operação; selection → cobertura semântica; evidence → citações e IDs; generation → tolerância a falha individual; text_engine → Vulkan/CPU sequenciais; scene_regions → decodificação delimitada; checkpoints/chunk_text/runner → retomada e tempos absolutos; encoder/pipeline → NVENC/libx264. 152 casos frontend e 95 nativos únicos aprovados; dois testes históricos ignorados não reexecutados. Relatório de limites/aceites: CLIP-PIPELINE-RELIABILITY-REVIEW.md; estética PENDING HUMAN APPROVAL.

## Rastreabilidade — editor básico completo (2026-10-26)

Plano aprovado: docs/engineering/EDITOR-BASIC-IMPLEMENTATION-PLAN.md. Estado IN PROGRESS; critérios abaixo não representam PASS executado.

| Aceite | Regra | Jornada e evidência exigida |
|---|---|---|
| AC-EDITOR-01 | BR-EDITOR-01 | JRN-009: editar sem autosave, Salvar, reabrir exatamente; falha mantém rascunho; recuperar/descartar sem sobrescrita. |
| AC-EDITOR-02 | BR-EDITOR-02 | JRN-009: trim além do corte da IA, dividir/copiar/duplicar/reordenar/inserir vídeo/imagem/áudio; prévia e fonte distintas. |
| AC-EDITOR-02/03, fonte e zoom2026-10-27 | BR-EDITOR-02/03 | JRN-009: seleção por miniaturas, arraste/alças e Enter; confirmação em camada nova, preservando principal/cursor/vínculos; botões+ não cobrem marcadores compactos; reveal/fit/resize/mudança de duração mantêm zoom finito e reversível. Testes composition-source-range/focus/target, composition-compact-items e composition-timeline-zoom; resultado da fatia no ENGINE-HANDOFF Complemento21. Aceite visual e gesto no app normal permanecem humanos. |
| AC-EDITOR-02, Ctrl+rolagem na fonte2026-10-27 | BR-EDITOR-02 | JRN-009: zoom ancorado no mouse, navegação horizontal, seleção/alças nos tempos corretos após rolar/redimensionar, bloqueio de zoom durante gesto e Enter preservado. Testes composition-source-zoom/range/focus/target/strict/ui e timeline-viewport;51casos distintos combinados, build/lint PASS. Teste funcional manual aprovado pelo mantenedor, que autorizou commit/push e pausa; registro no ENGINE-HANDOFF Complemento23. Isso não conclui o editor inteiro. |
| AC-EDITOR-02/03, extremidades2026-10-26 | BR-EDITOR-02/03 | JRN-009: botões+ usam início/fim da principal sem seek; importação e Fonte guardam intenção, cancelamento não contamina novo pedido, locks e modoR respeitados. composition-endpoint-add(6), composition-source-target(8) e composition-import(7); alças/movimento/junções51casos em repetição dirigida após atualizar fixtures de geometria. Runtime nativo/visual desta adição permanece humano. |
| AC-EDITOR-02, refinamento 2026-10-26 | BR-EDITOR-02 | JRN-009: painéis modulares, biblioteca de miniaturas, Fonte/Montagem alternadas na mesma área; áudio original integrado por padrão e pausa sincronizada durante carregamento/busca. Testes composition-editor-layout, composition-timeline-layout, composition-stage-lifecycle, composition-stage-ready, composition-buffering e composition-source-strict; aceite normal/visual permanece humano. |
| AC-EDITOR-02/03, feedback manual seguinte | BR-EDITOR-02/03 | JRN-009: snap ao religar ímã, largura contida, Ctrl+roda, tag CC vinculada, seleção de uma camada e Q/W no cursor. Testes composition-screen, composition-timeline-viewport, composition-item-links, composition-timeline-caption-fold, composition-trim-playhead e composition-commands-trim; sem inferir aceite visual dos testes. |
| AC-EDITOR-02/03/06, controles e abertura 2026-10-26 | BR-EDITOR-02/03/06 | JRN-009/010: ocultar não desdobra vínculos; mute visual atua no áudio pareado sem reescrever settings; preview e render preservam áudio independente. Testes composition-track-controls, composition-playback, composition-stage-reuse, composition-screen e render_plan_tests, incluindo PCM FFmpeg real. URLs incrementais e erros de abertura testados com fronteiras simuladas; não inferem latência real, MP4 pela UI ou ausência de crash externo. |
| AC-EDITOR-02/03, camadas e cursor 2026-10-26 | BR-EDITOR-02/03 | JRN-009: excluir conteúdo não acumula auxiliares vazias; cursor/régua permanecem na viewport; aparar/mover preserva cursor, inclusive pós-fim, sem alterar duração de saída. Espaço funciona após interação na timeline e não muda seleção durante gesto. Testes composition-track-pruning, composition-timeline-scroll-cursor, composition-trim-cursor, composition-playback-position, composition-move-cursor e composition-space-shortcut;907/908 na execução integral e50/50 afetados após corrigir IME, conforme Complemento14. Geometria controlada e RAF simulado não substituem hit-test/reprodução audiovisual no app. |
| AC-EDITOR-02/03, trim magnético 2026-10-26 | BR-EDITOR-02/03 | JRN-009: aparar não remove/divide camadas independentes; ímã reencaixa somente blocos posteriores da principal e acompanhantes por grupo explícito. composition-trim-ripple-layers cobre ambas as alças/deltas com/sem ímã, vídeo/imagem/áudio/CC, locks, bloco fixo, Undo/Redo e parser; integração922/922 TS, lint/build PASS. Não é nova prova de IPC/exportação ou da direção humana não reproduzida; reteste manual pendente no Complemento16. |
| AC-EDITOR-03 | BR-EDITOR-03 | JRN-009: remoção interna com/sem ripple; sincronismo, interseções, fixos, bloqueados, Undo/Redo e um commit por gesto. |
| AC-EDITOR-04 | BR-EDITOR-04 | JRN-008/009: mesmo clipe atualizado sem ranking; novo manual no projeto correto; biblioteca atualiza duração/miniatura sem trocar IDs. |
| AC-EDITOR-04, recolhimento individual2026-10-26 | BR-EDITOR-04 | JRN-008: cada projeto expande/recolhe seus cards com botão acessível/tooltip próprio; nome/contagem e demais grupos preservados. clip-project-collapse cobre independência, atualização da coleção e galeria individual sem controle extra. |
| AC-EDITOR-01/04, confirmação e biblioteca2026-10-26 | BR-EDITOR-01/04 | JRN-008/009: criar mantém editor/rascunho; Ir para clipes abre a coleção atual após a decisão de saída, sem duplicar publicação; validação de vídeo/imagem ocorre antes de vincular mídia. Cards usam ícones/tooltip próprio, tag Editado no espaço da nota e título de até duas linhas com texto completo acessível. Testes composition-created-navigation, project-workspace-navigation, manual-clip-visual-contract, clip-card-actions/metadata/título e worker/store nativos; aparência e percurso normal continuam no aceite humano. |
| AC-EDITOR-05 | BR-EDITOR-05 | JRN-003/004/007: nome→importação→ASR→visão geral; erro/cancelamento/não há fala; chegada de ASR não substitui rascunho. |
| AC-EDITOR-06 | BR-EDITOR-06 | JRN-010: botão real→destino→render da revisão salva→MP4 equivalente; cancelamento/falha/sem espaço sem saída falsa. |
| AC-EDITOR-07 | BR-EDITOR-07 | JRN-004/009/010, M7A: importar por referência sem cópia; compatibilidade das mídias gerenciadas; salvar/reabrir/resolver/ler/ASR/render; fonte movida religada somente com conteúdo coincidente; arquivo alterado indisponível; cancelamento, exclusão e exportação preservam originais, inclusive aliases/hardlinks. Testes de contrato/fixtures e FFmpeg reais não substituem o fluxo normal do mantenedor. |
| AC-EDITOR-09 | BR-EDITOR-09; BR-EDITOR-01/02/03 | JRN-009, FR-011/013, EPIC-008: marcadores absolutos M/segundo M/duplo clique, metadados das faixas e organização da timeline. Direção APPROVED; implementação IN REVIEW, meta ACTIVE/PARTIAL. Aceites e limites no detalhamento abaixo e no EDITOR-BASIC-IMPLEMENTATION-PLAN. |

| AC-EDITOR-02/04, fila2026-10-26 | BR-EDITOR-02/05/06/08 | JRN-008/009: imagem com preview; marcador curto amplia sem editar tempo/cursor; edição salva renova Novo/tempo; Ativos/Todos/Lixeira, restauração, exclusão permanente e TTL7dias com migração segura. Importar é separado de inserir; arraste interno e Windows resolvem destino, cancelamento, locks e história. Contratos automatizados não substituem o reteste manual de arraste Windows/DPI e aparência. |

### Detalhamento de AC-EDITOR-09 — direção aprovada em 2026-10-27

1. M cria uma anotação única no frame atual; segundo M no mesmo frame e duplo clique abrem o mesmo ID. Nome/posição/cor e exclusão funcionam no popover; edição e exclusão são reversíveis, com Salvar/reabrir explícito. Escape/clique externo cancelam; tempo inválido mantém formulário/erro e documento anterior. Repetição, IME, modificadores e M em inputs não criam marcadores. Após duplo clique → Excluir, o foco volta à timeline e M funciona sem clique adicional; o caso reportado pelo mantenedor foi reproduzido em RED e corrigido com regressão automatizada, ainda aguardando reteste humano.
2. Nomes de marcador/faixa têm contador visível e entrada limitada a 120 caracteres Unicode, com validação TypeScript/Rust e rejeição de nome vazio após trim. Colagem/entrada longa mantém no máximo120 pontos Unicode, sem dividir um par Unicode; marcação digitada é texto JSX literal, sem interpretação de HTML. Nome/cor de faixa usam identidade estável, confirmação/cancelamento, Undo/Redo e persistência compatível, preservando cor ausente e dados legados válidos.
3. Marcadores conservam frames absolutos após trim/ripple e continuam acessíveis pós-fim sem aumentar duração/render. Extração filtra `[início, fim)` e rebasa frames; duplicação/colagem de mídia não replica anotações; exclusão do último persiste lista vazia. Mídia, áudio, ordem de composição e propriedades dos itens permanecem intactos.
4. Timeline inicia maior, poucas faixas ficam centralizadas e a principal permanece na base com separação de 1px. Muitas camadas, áudio/CC independentes, locks, scroll X/Y, régua, cursor, zoom e gestos preservam seus contratos; hit-test de drop interno/externo nunca atravessa a principal visível para alcançar faixa encoberta.

Evidências do checkpoint técnico desta fatia: suíte integral com 1.160 testes TypeScript aprovados; 359 Rust aprovados e 33 opt-in ignorados; build/lint aprovados. A correção posterior de foco passou 34/34 testes afetados em quatro arquivos, incluindo um caso novo, totalizando 1.161 casos únicos cobertos ao combinar as evidências; não foi uma nova execução integral de 1.161 testes. `EditorNameField` compartilhado fornece contador/clamp Unicode aos dois popovers; testes da UI cobrem o limite. Cobertura relacionada: `composition-markers`, `composition-marker-flow`, `composition-track-details`, `composition-track-presentation`, `composition-drop-geometry`, `composition-spatial-gesture`, `composition-timeline-zoom`, `composition-timeline-scroll-cursor`, `editor-popover` e `composition-space-shortcut`, além dos contratos nativos do editor. As três passagens delimitadas do GPT-6.1 Terra examinaram fixtures e a comparação final não encontrou colisões no escopo das capturas; isso não valida o aplicativo normal nem concede aprovação estética. Código da fatia implementado/testado, com reteste humano pendente; estado global ACTIVE/PARTIAL. Jornada normal, medições do vídeo de 797MB, recursos/desempenho e gates M0/M5/M6/M7 seguem abertos. Continuidade canônica no ENGINE-HANDOFF; visual PENDING HUMAN APPROVAL.

Desempenho transversal: vídeo real de 796.580.866 bytes/1080p59,94; primeiro envio/reabertura, 200 navegações e dez trocas; p95 cursor≤50ms/frame preparado≤250ms. Medições reais pendentes; testes de unidade não comprovam esses limites. Aprovação visual exclusiva do mantenedor.
