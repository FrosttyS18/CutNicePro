# MARCO 2 — Fatia vertical: plano de edição único atravessando app e MP4 (2026-10-23)

## O que foi implementado (lista finita, escopo M2)
- **Contrato do plano** (`EditPlan v1`): `app/src/lib/workspace-types.ts`
  (`EditSegment{sourceStart,sourceEnd}` em segundos da FONTE, `version:1`),
  campo opcional `editPlan` em `EditorSettings` — projetos antigos abrem sem
  plano (intervalo único do trim; sem migração destrutiva).
- **Funções puras** `app/src/lib/edit-plan.ts`: normalização, validação
  (ordenado, não-sobreposto, ≥0,05 s, dentro da mídia), mapas
  outputTime↔sourceTime (convenção end-exclusive em junções), snapSeek,
  nextBoundary, splitAt, removeAt — os MESMOS usados pelos 3 consumidores.
- **Contrato Rust**: `render/settings.rs` `RenderSegment` +
  `RenderSettings::effective_segments` (mesma semântica da prévia;
  `deny_unknown_fields` preservado — `renderSettings` (clips.ts) extrai o
  plano para `segments` e não envia `editPlan`).
- **Export multi-segmento**: `render/pipeline.rs` — por janela: `-ss/-t` +
  filtros/legendas próprios (`ass::build` já re-basa cues por janela) →
  concat demuxer `-c copy` (janelas com parâmetros idênticos); fallback
  NVENC→CPU re-renderiza TODAS as janelas (paridade de params do concat);
  verificação final duração==soma.
- **Prévia composta** (`VideoEditor.tsx`): eixo da timeline no tempo da
  FONTE; seek faz snap para o próximo segmento; na reprodução, ao atingir o
  fim do segmento salta para o próximo (vão fora da composição) e pausa no
  fim do último; retomada coerente no togglePlay. FrameSeeker/overlay e
  arbitragem de tempo (timeline aprovada) INTACTOS — seek continua em tempo
  da fonte.
- **Timeline** (`EditorTimeline.tsx`/`TimelineSurface.tsx`): vãos do plano
  sombreados com a MESMA linguagem visual do trim (sem novos contornos);
  controles "Dividir no playhead", "Remover trecho do playhead", "Corte
  simples" (modo corte); Início/Fim editam primeiro/início e último/fim.
  Undo/redo pelo histórico existente (commit de workspace).

## Provas (sem mocks no percurso do corte)
1. **Unit TS** — `src/test/edit-plan.test.ts` 13/13 (mapas, validação,
   split/remove/snap, junção end-exclusive — bug de ambiguidade de fronteira
   achado pelo teste e corrigido).
2. **Unit/integração Rust** — `render::tests` 11/11 (+2 novos:
   effective_segments rejeita sobreposição/fora/curto; window_arguments usa
   janelas e legendas próprias) e `render::integration` com FFmpeg REAL:
   fixture CFR 4 s@10 fps com vão AZUL 2–3 s; plano {0,5–1,5}{2,5–3,5} →
   MP4 20±1 frames, duração 2000±120 ms, frame do meio SEM o azul (vão
   comprovadamente removido por conteúdo, não só duração).
3. **App real (Tauri, vídeo de 24 min do mantenedor, dedupe)** —
   `tools/e2e/multimodal-m2-lab.mjs` + `mm-export-probe.mjs`:
   - corte semeado no store (id sha256 próprio; geração por IA fica no lab
     consolidado M3/M5 — declarado);
   - plano construído PELA UI: dividir em 190/196/204 + remover o trecho
     interno → plano persistido após Salvar+REABRIR exatamente
     [{180,190.000023},{190.000023,196.000025},{204.000027,210}]
     (ε de pixel do clique, ~23 µs);
   - **undo/redo pela UI** OK (Desfazer → plano único; Refazer → volta);
   - **prévia composta real**: play iniciado em 195 s saltou o vão
     196–204 (t=205,50 s reproduzindo);
   - **export pelo comando real do app** (`export_video` IPC, diálogo
     nativo): `Ok(true)`, MP4 publicado — 22,045 s vs plano 22,000 s
     (Δ≈1 frame @23,976 fps), 526 frames, 21,3 MB
     (`mm-m2-corte-app-real.mp4`).
   - Suítes completas após tudo: Rust 141 PASS (+2), vitest 227 PASS
     (+13), tsc/eslint OK nos tocados.

## Limitações e correções de registro
- **Diálogo nativo de destino**: SendKeys só digitou com a janela do app em
  foco (clique real antes); no sucesso final, apenas o ENTER caiu → arquivo
  publicado com o NOME PADRÃO na pasta padrão (Downloads) — equivalente em
  conteúdo; limitação conhecida do harness (memória upd-20) e não é defeito
  do produto.
- **CORREÇÃO de registro da meta anterior (timeline)**: descobriu-se durante
  o M2 que PointerEvents SINTÉTICOS não disparam o seek do app
  (`setPointerCapture` falha com pointerId inativo em evento não-confiável).
  Portanto a medição "playhead p95 5 ms sem hop de harness" do lab v5 da
  meta timeline MEDIA rAF vazio (sem seeks) e é **INVÁLIDA**. Permanecem
  válidos: lab v4 (eventos reais via CDP: p50 11–13 ms, p95 64,8–67,6 ms,
  incluindo custo do harness) e o reteste manual aprovado do mantenedor
  ("perfeito", 23/10). O gate F da matriz final desta meta deve medir
  playhead com eventos REAIS (CDP) e declarar o custo do harness.
- Projetos de laboratório "MM Lab M2*" e perfil WebView do lab apagados ao
  final; mídia de 345 MB permanece por dedupe com o projeto do mantenedor.

## Estado dos marcos
M0 ✓ (mapa/baseline) · M1 ✓ (multimodalidade provada em runtime) ·
M2 ✓ (fatia vertical + MP4 == prévia). Próximo: M3 (índice temporal +
seleção multimodal + comparação na amostra reservada) — a geração por IA
com evidências de frames/áudio entra aí.
