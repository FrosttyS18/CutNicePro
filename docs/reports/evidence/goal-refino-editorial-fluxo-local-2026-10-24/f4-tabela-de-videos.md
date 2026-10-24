# F4 — Tabela dos vídeos entregues (goal-refino, 2026-10-24)

Projeto-fonte de TODOS: **"TXT Aceite Manual"** (mídia real 1476,79 s / 24:36,
transcrição Whisper local já existente — nenhuma inferência nova exigida para
assistir). Geração de referência: **Gemma-3-12B textual** (executável, Vulkan)
+ refine de fronteiras frase+pausa (`borders.rs`), geração G8 de 2026-10-23.

## A. Arquivos MP4 entregues (reproduzíveis, duração medida com ffprobe)

| # | Geração/Modelo | Título | Intervalo-fonte (duração esperada → medida) | Arquivo | Estado | Diferenças verificáveis |
|---|---|---|---|---|---|---|
| 1 | Gemma-3-12B texto + borders (G8) | Melhores plataformas para criar um portfólio profissional | 1239,38–1287,58 (48,20 s → 48,21 s) | `../goal-recuperacao-autoclip-2026-10-23/g8-corte-1-Melhores-plataformas-para-criar-um-portfolio.mp4` | NOVO AUTOMÁTICO → **REPROVADO editorialmente pelo mantenedor** (termina durante a explicação) | Rubrica agente F3: 10/10 (diverge do aceite humano — registrado); legendas reais; 9:16 |
| 2 | Gemma-3-12B texto + borders (G8) | Quatro critérios para validar a eficácia de um portfólio | 970,00–1009,68 (39,68 s → 39,71 s) | `../goal-recuperacao-autoclip-2026-10-23/g8-corte-2-Quatro-criterios-para-validar-a-eficacia.mp4` | NOVO AUTOMÁTICO → **REPROVADO** (começa na enumeração sem apresentar o assunto; fim aprovado) | Rubrica agente F3: 9/10; legendas reais; 9:16 |
| 3 | Gemma-3-12B texto + borders (G8) | Priorizar qualidade em vez de quantidade de cases | 1194,42–1239,38 (44,96 s → 44,96 s) | `../goal-recuperacao-autoclip-2026-10-23/g8-corte-3-Priorizar-qualidade-em-vez-de-quantidade.mp4` | NOVO AUTOMÁTICO → **REPROVADO** (começa sem contexto; não sustenta o título) | Rubrica agente F3: 10/10 (divergência idem #1); legendas reais; 9:16 |
| 4 | Clipe REAL (score 95) do mesmo projeto, **editado na UI** no lab F2 (build nova, perfil WebView próprio — dados do mantenedor intactos) | Como identificar problemas de clareza no portfólio profissional | 0–17,12 s mantendo 2 segmentos: 0–5,65 + 13,70–17,12 (9,07 s → 9,16 s, Δ 0,05 s) | `f2-corte-EDITADO-pipeline.mp4` | **EDITADO** — aguarda aceite | Plano salvo e reaberto idêntico na UI (run 9); 12 cortes antigos preservados; MP4 pelo pipeline real do app (mesma rota do botão pós-diálogo) |
| 5 | Mesmo clipe, integral, **exportado pelo BOTÃO Baixar + DIÁLOGO NATIVO** (clique real via computer-use; build com correção do bug `wordsPerCaption`) — fecha o critério F2 | Como identificar problemas de clareza no portfólio profissional | 0–17,12 s (17,12 s → 17,142 s, Δ 0,02 s) | `f2c-corte-BOTAO-dialogo-nativo.mp4` (original publicado em `Downloads/TXT Aceite Manual-Como identificar problemas de clareza no.mp4`, sha256 617ee2ca…) | **NOVO AUTOMÁTICO (botão real)** — aguarda aceite | Diálogo nativo abriu com nome G7 projeto-título; "Salvar" clicado; UI reportou "Vídeo exportado."; bug que quebrava TODO export UI com legendas corrigido (ver `f2c-export-botao-dialogo.json`) |

Verificação independente (executável por qualquer um):
`ffprobe -v error -show_entries format=duration -of csv=p=0 <arquivo>` —
valores na coluna "medida" foram medidos nesta entrega (2026-10-24).

## B. Os 8 cortes do G8 — rubrica por corte × estado editorial (F3)

| Intervalo (s) | Título (resumo) | Rubrica F3 | Fidelidade | Exportado | Estado |
|---|---|---|---|---|---|
| 1239,4–1287,6 | Melhores plataformas (Framer/PDF) | 10 | 2/2 | MP4 #1 | Reprovado pelo mantenedor |
| 970,0–1009,7 | Quatro critérios | 9 | 2/2 | MP4 #2 | Reprovado pelo mantenedor |
| 1194,4–1239,4 | Qualidade vs quantidade | 10 | 2/2 | MP4 #3 | Reprovado pelo mantenedor |
| 1085,7–1127,6 | Trabalho real | **7** | 2/2 | não | Abaixo do alvo (≥8) |
| 1009,7–1065,3 | Projetos acadêmicos | 8 | 2/2 | não | Rubrica OK |
| 1131,9–1165,6 | Bootcamp/fim de semana | 9 | 2/2 | não | Rubrica OK |
| 1340,0–1406,4 | Evitar Figma p/ currículos | 9 | 2/2 | não | Rubrica OK |
| 900,9–938,2 | Sites p/ portfólios | **6** | 2/2 | não | Abaixo do alvo (≥8) |

- **Sem média escondendo corte ruim**: 6/8 ≥8/10; 2/8 abaixo (7 e 6);
  fidelidade 8/8 (nenhum inventado, verbatim confirmado); nenhum veto da
  rubrica, mas o **aceite do mantenedor divergiu da rubrica nos 3 exportados**
  — a rubrica 0–2 não capturou a severidade dos defeitos que o mantenedor viu
  (fim durante a explicação, início sem contexto). Detalhes em
  `f3-rubrica-por-corte.md`.
- Causa dos defeitos (F3): **seleção/prompt de título**, não os thresholds do
  `borders.rs` — as fronteiras estão em frase completa, mas a JANELA escolhida
  corta a ideia (termina antes da conclusão) ou começa depois da apresentação.
  Calibração de prompt + re-geração da amostra reprovada: PENDENTE de
  autorização (não executada nesta rodada; ver F3).
