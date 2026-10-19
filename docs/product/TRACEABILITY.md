# CutNicePro — Traceability

> Conexões explícitas Jornada ↔ Regra ↔ Requisito ↔ História ↔ Aceite ↔ Validação.
> Registros só apontam para elementos existentes (auditado por script — §Auditoria).
> Referência não resolvida = pendência declarada, nunca preenchida com invenção.

## 1. Matriz por jornada

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
