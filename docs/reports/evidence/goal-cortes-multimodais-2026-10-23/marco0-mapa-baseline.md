# MARCO 0 — Mapa, contratos e baseline (2026-10-23)

Fonte: objetivo goal-cortes-multimodais-2026-10-23. Revalidação na tree atual
(working tree 0.19.0 + timeline concluída, sem commit).

## 1. Caminho REAL executado (arquivos/funções verificados no código)

| Etapa | Arquivo:função | Estado | Lacuna p/ objetivo |
|---|---|---|---|
| Importação | `media_import.rs` + `import_media` (lib.rs:56) | OK (dedupe por conteúdo) | — |
| Análise de mídia | `media_analyze.rs` (ffprobe dims/duração) | OK | sem cenas/eventos |
| ASR | `transcription/*` (whisper local; `transcription/store.rs` por projeto) | OK; UX PORTFÓLIO: 568 segs reais | — |
| Geração de cortes | `clips/commands.rs:generate_clips` → `generation.rs:run` | OK: jobs, progress, cancel, incremental, dedupe | só TEXTO |
| Seleção | `selection.rs` (discover-prompt.txt, unidades de fala) | OK | sem evidência visual/sonora |
| Motor | `text_engine.rs` (Qwen std / Gemma 4 12B via `llama-completion.exe`, prompt_gemma canônico nothink) | OK texto | SEM mmproj/imagem/áudio |
| Cenas | `scene_regions.rs` (transições FFmpeg nos limites) | OK como ajuste fino | não é interpretação de cena |
| Análise por corte | `semantic.rs` + `evidence.rs` (quotes grounded) + `analyze_clip` | OK | textual |
| Ranking | `ranking.rs`, score 0–100 com razões | OK | sem dimensões multimodais |
| Armazenamento | `clips/store.rs` (clips/{project}.json, migração, proveniência, dedupe) | OK | — |
| Biblioteca UI | cards + ações diretas (editar/baixar/excluir/restaurar) | OK (upd 19/20) | — |
| Workspace de corte | `clip-workspace.ts` (`clipEdits[clipId]` = EditorSettings) | OK | **trimStart/trimEnd ÚNICO** |
| Timeline/preview | `VideoEditor.tsx` + `EditorTimeline`/`TimelineSurface` + FrameSeeker (APROVADO 23/10) | OK fluido | prévia = 1 intervalo só |
| Export | `render/commands.rs:export_video` → `pipeline.rs:arguments` (UM `-ss/-to` + filtros + ass) | OK sem gate | **1 segmento só** |
| Export resultado | `useclips-export-result`, `clip-download` (6/6), ffprobe ~10 s | OK | — |

## 2. Capacidades confirmadas (NÃO reimplementar)
Geração incremental com 2ª passada delimitada; análise somente de novos; merge preserva
excluídos/editados; export sem "aprovado"; jobs com cancelamento/progresso/eventos;
ProcessingGate (1 job pesado por vez); FrameSeeker/Mediabunny + arbitragem de tempo
(APROVADO pelo mantenedor — qualquer toque exige regressão específica do lab).

## 3. Decisões de arquitetura da fatia (menor mudança por mecanismo)

**D1 — EditPlan v1 (M2):** plano de edição versionado POR CORTE dentro do workspace
(`clipEdits[clipId].editPlan { version:1, segments:[{sourceStart,sourceEnd}] }`), segundos
f64, segmentos ordenados/não-sobrepostos; PROJETOS ANTIGOS sem plano = 1 segmento derivado
de trimStart/trimEnd (compatível, sem migração destrutiva). Três consumidores do MESMO plano:
prévia composta (mapa outputTime↔sourceTime com salto automático nos limites), timeline
(blocos do plano) e export (FFmpeg por segmento + concat demuxer). Modelo gera DADOS
validados (segmentos/focos), nunca comandos FFmpeg.

**D2 — Adaptador multimodal (M1→integração):** `llama-server` b11829 + mmproj oficial do
Gemma 4 (provado no MARCO 1) gerenciado como processo filho do app (adaptador Rust, porta
local aleatória, `/v1/chat/completions` com `reasoning_effort:"none"` ou `/completion` com
template canônico + `audio_data`/`image_data`). Motor textual existente (`llama-completion`)
permanece para os caminhos atuais; o experimental passa a usar o server quando multimodal.
Falha do mmproj → degrada para textual com aviso explícito (nunca silencioso).

**D3 — Índice temporal (M3):** índice por mídia em `analysis/` (falas vigentes EDITADAS +
pausas por gap de segmento + eventos sonoros por FFmpeg silencedetect/loudnorm stats +
frames amostrados por janela) com chaves de cache (mídia+transcrição+modelo+instruções).

**D4 — Tracking (M4):** sem YOLO pesado no MVP; caso controlado = rastreador por cor/template
(IoU+histograma) para objeto marcado; pessoa em movimento = detector leve a definir no
estudo do marco (candidato ByteTrack como associação sobre detector mínimo). Framing
suavizado (média móvel do centro, clamp nos limites) gravado no plano por segmento.

**D5 — Orquestração (M5):** sequência automática pós-import (opt-out) reutilizando
ClipJobs/ProcessingGate; nenhuma duplicação de job; recuperação por job snapshot existente.

## 4. Matriz de aceite (resumo; detalhe no objetivo §ACEITE FINAL A–I)
A fluxo 24 min Tauri real sem mocks · B ≥3 cortes revisáveis · C rubrica 0/1/2 ≥8/10 com
fidelidade 2/2 (avaliação separada do modelo) · D multimodal + tracking + montagem com
remoção interna + undo/redo persistente · E duração/sincronia MP4↔plano (CFR ≤1 frame;
VFR tolerância declarada) · F regressão timeline (p95 ≤50/≤250 ms com IA ativa) · G memória
estável em ciclos · H testes de erro/cancelamento/contratos · I 2 h separado.

## 5. Baseline de recursos e mídia (declarado ANTES das cargas)
- Hardware: Ryzen 7 5700X, 32 GB RAM, RTX 5070 12 GB (Vulkan, driver 610.88).
- Orçamentos: editor+WebView2 ≤ ~2,5 GB (lab aprovado ~2,1–2,2 GB com blob 345 MB);
  modelo 12B Q4_0 ≈ 7,5 GB VRAM (server), Whisper respeita ProcessingGate; concorrência
  IA = 1 job (gate existente); disco: render-temp limpo por job (existente).
- Mídia: fluxo = "UX PORTFÓLIO" (24,6 min, 345 MB, 1080p, 568 segs REAIS) — CÓPIA de
  trabalho em projeto de teste lab; original do mantenedor SOMENTE LEITURA (dados app-data
  do mantenedor nunca gravados). Amostras: trecho 2 pessoas/troca de cena + trecho objeto em
  movimento + 1 amostra EDITORIAL RESERVADA para comparação cega (não usada em calibração).
  Fixtures sintéticas (probes MARCO 1) identificadas como sintéticas.
- Baseline de fluidez: lab v4/v5 (playhead p95 5 ms sem harness; frame ≤179 ms) como
  referência de regressão F.

## 6. Lista FINITA de alterações previstas (escopo travado)
Rust: `clips/multimodal.rs` (novo: adaptador server+mmproj+probes), `text_engine.rs`
(integração experimental multimodal), `generation.rs`/`selection.rs` (evidências multimodais
na descoberta), `render/settings.rs`+`pipeline.rs` (segments no export), `clips/types.rs`
(fit/framing por segmento quando M4), `lib.rs` (commands). TS: `workspace-types.ts` (editPlan),
`clip-workspace.ts`/`isolatedClipSettings` (plano por corte), `VideoEditor.tsx`+
novo `useComposedPlayback.ts` + `EditorTimeline` (blocos), `useClips.ts`/`ipc.ts`
(consumers), UI mínima de geração (opt-out). Docs canônicos + rastreabilidade ao final.

## 7. Evidências novas e orçamento
- MARCO 1 CONCLUÍDO em runtime local (ver `marco1-multimodalidade.md`): visão provada
  (probes A/B/sequência + par controlado), áudio provado com ressalva experimental,
  crash do mtmd-cli documentado (3 builds), solução server b11829.
- Tempo consumido até aqui: ~50 min de execução ativa (limite da rodada: 8 h acumuladas).
- Candidatas de integração: 2 previstas para D2 (atualização de build falhou → server) —
  CONSUMIDAS ambas; ciclos de calibração editorial: 0/2 usados.
