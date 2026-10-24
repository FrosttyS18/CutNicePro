# G1 + G3 — Graphify validado, export diagnosticado, biblioteca corrigida (2026-10-23)

## G1: Graphify remoto — CONEXÃO VALIDADA COM CHAMADA REAL
- `list_workspaces` → `wesley-s-workspace` (ativo, owner) ✓
- `list_repositories` → `FrosttyS18/CutNicePro` (281bc29a…), status ready,
  3.297 nós, indexado em `ab501e2` (= HEAD local) às 14:52 UTC ✓
- Consultas reais: `graphify_node` (effective_segments→Segment/content.rs,
  resolução semântica registrada), `query_graph` (fluxo export_video →
  destination_allowed → pipeline com corpos completos), `graphify_callers`
  (loadClipLibrary → useClipLibrary + clip-source.test.ts),
  `graphify_tests_for` (clip-source.test.ts, clip-library.test.tsx) ✓
- DEFASAGEM DECLARADA: índice cobre o commit ab501e2; os ~170 arquivos
  modificados/não rastreados do working tree NÃO estão no índice — leitura
  local complementar feita em cada fatia (arquivos conferidos por grep/Read
  antes de editar). AGENTS.md já contém a política permanente do Graphify
  remoto (3 menções; preservada — conformidade confirmada).

## G3A: export/baixar "Não foi possível processar o vídeo" — CAUSA RAIZ + CORRIGIDO
- Reproduzido pelo caminho REAL (invoke export_video + diálogo nativo
  completado com ENTER): erro bruto capturado antes do clipMessage.
- RODADA 1 (configurações mínimas): `"Revise as configurações do vídeo
  antes de exportar."` — ramo `(caption_model > 0 && caption_style.is_none())`
  do RenderSettings::validate. A UI real sempre envia captionStyle
  (renderSettings) — não é o caminho de produto.
- RODADA 2 (configurações FIÉIS à UI, captionStyle presente):
  **`{"ok":true}` nos DOIS projetos** — davyjones (94,3 s, 62,6 MB) e
  TXT Aceite Manual (17,14 s) — arquivos publicados pelo diálogo nativo,
  durações conferidas por ffprobe (cópias: g3a-*-corte.mp4).
- CAUSA RAIZ DO ERRO RELATADO: o `projects.json` corrompido pela semeadura
  manual do projeto de teste (datas ISO em vez de `created_at_ms`) fazia
  `Store::load` falhar INTEIRO → list_projects ("arquivos corrompidos"),
  biblioteca e export derrubados com erros não mapeados → fallback genérico
  "Não foi possível processar o vídeo…". Correções aplicadas ontem:
  formato do projects.json restaurado; vínculo de mídia do projeto manual
  refeito via `link_media` (conf. `manualMediaLinkedBefore=false → After=true`).
  O vínculo ausente era um segundo gatilho real (media() rejeita o projeto).
- EVIDÊNCIA: `g3a-diagnostico.json` (erro bruto + ok:true nos dois casos).

## G3B: biblioteca global zerada — CAUSA RAIZ + CORRIGIDO + REGRESSÃO
- Causa raiz (leitura de código + grafo): `get_project_clips` retorna Err
  quando a mídia do projeto falha (ex.: vínculo ausente) e
  `loadClipLibrary` NÃO isolava por projeto → uma rejeição zerava TODA a
  biblioteca (o caso real: davyjones 15 clipes ocultos pelo projeto manual
  quebrado). O teste antigo até EXIGIA esse comportamento (rejeição total).
- Correção (contrato novo): `loadClipLibrary` isola por projeto e devolve
  `{ entries, failed }`; falha TOTAL continua sendo exceção; `useClipLibrary`
  informa perda parcial ("Alguns projetos não puderam ser carregados (N)")
  via `partial`, exibido no aviso da galeria. Teste do contrato atualizado
  (um projeto falha → outro visível + failed informado; todos falham → erro).
- Regressão: clip-source 3/3 + clip-library 12/12; suíte integral TS 227/227.

## G3C: interface das ferramentas
- Checkbox "Gerar cortes automaticamente" REMOVIDO da barra (ficava solto
  entre botões) → agora é opção CONTEXTUAL no diálogo "Gerar cortes":
  "Gerar automaticamente quando a transcrição terminar" — distingue da
  geração por conteúdo (quantidade/duração ficam nos selects acima).
  Opt-in segue padrão DESLIGADO; guarda durável por projeto inalterada.
- Flag multimodal: `CNP_ENABLE_MULTIMODAL` agora exige valor `"1"`
  (presença com 0/vazio NÃO ativa) — text_engine.rs.
- Alinhamento de "Transcrever novamente"/botões colados: pendente de
  validação visual no app (próxima rodada UI com os prints do mantenedor).
- Suítes: tsc OK, vitest 227/227, cargo check/build OK (exe reconstruído).

## Orçamento
~1h10 consumida das 24 h. Próxima fatia: G3C validação visual + G4 (estudo
integral do AutoClip zhouxiaoka em revisão fixada).
