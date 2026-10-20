# Comparação — descoberta por janelas (retomada da atualização 6)

2026-10-20 · Mesma transcrição (322 falas, 599,1 s) · limites 15–90 s · 3 cortes ·
DP idêntica para todos · cada perfil propôs os SEUS candidatos e avaliou todos
pelo SEU procedimento (notas antigas = só proveniência; nenhum fallback).

## Configuração efetiva e comprovada em log (argv registrado por chamada)

| Perfil | Modelo | Template | ctx | Amostragem (efetiva no log) | Grammar | Prova curta |
|---|---|---|---|---|---|---|
| A | Qwen3-4B-Q4_K_M instalado (vendor) | ChatML + `<think>` vazio (paridade app `text_engine.rs:74`) | 8192 | temp 0 (greedy), seed 42 | sim | **OK** (606/606 tokens; n_ctx 8192) |
| B | mesmo checkpoint | ChatML aberto (sem prefill) | 16384 | temp 0,6, top_k 20, top_p 0,95, min_p 0 | não | **REPROVADA** (limite de raciocínio) |
| C | Qwen3-4B-Instruct-2507 (home-c) | ChatML do próprio GGUF (sem think) | 8192 | temp 0,7, top_k 20, top_p 0,8, min_p 0 | sim | **OK** (597/596 tokens) |
| D | Gemma-4-12B-IT QAT Q4_0 (home-e) | canônico do GGUF (`<\|turn>`/`<\|channel>`), thinking desativado | 8192 | temp 1,0, top_k 64, top_p 0,95, min_p 0 (metadados do GGUF) | sim | **OK** (553/553 tokens; para em 44 tokens) |

BOS/parity: tokenizador (`llama-tokenize`) e motor (`llama-completion`)
contam o mesmo nº de tokens (A 606/606, D 553/553; C 597/596, diferença de 1
registrada). O erro "max 8188" da atualização 6 era o contexto 8192 do código
publicado (8188 úteis); `-c` maior chega ao executável (comprovado: log
`generate: n_ctx = 16384` com prompt de 10438 tokens avaliado a 211 tok/s).

## Janelas e cobertura (tokenizador real; prompt FINAL com template e reservas)

| Perfil | Janelas [seg.) | Tokens/janela | Orçamento/janela | Lacunas |
|---|---|---|---|---|
| A | [0,183) [133,313) [273,322) | 5927 · 6006 · 1954 | 6068 | 0 |
| B | (idem A — não executado) | 5918 · 5997 · 1945 | 6068 | 0 |
| C | [0,183) [133,313) [273,322) | 5918 · 5997 · 1945 | 6068 | 0 |
| D | [0,196) [144,322) | 5982 · 5663 | 6068 | 0 |

Sobreposições de fronteira: A/C 133–182 e 273–312; D 144–195 (≈90 s, como a
produção). Nenhuma subdivisão foi necessária (todas as janelas couberam na
verificação exata).

## Execução por perfil (uma passada; nenhuma repetição de descoberta)

| | A | B | C | D |
|---|---|---|---|---|
| Chamadas LLM | 3+3 | 2 (só prova) | 3+2 | 2+2 |
| Propostas (todas as janelas) | 17 | — | 18 | 9 |
| Únicas (dedupe) | 12 | — | 12 | 9 |
| Fora da faixa → alternativas | 5 → 10 | — | 0 → 0 | 2 → 4 |
| Construídos → avaliados | 17 → 17 | — | 12 → 12 | 11 → 11 |
| Notas (amplitude) | 55–75 | — | 50–95 | 55–92 |
| Cortes finais | 3 | 0 | 3 | 3 |
| Status execução | RESULTADO_COMPLETO | EXECUÇÃO_FALHOU (prova) | RESULTADO_COMPLETO | RESULTADO_COMPLETO |
| Tempo inferência | 212,6 s | ~2 min (provas) | 213,7 s | 470,6 s |

Nota de orçamento (registro honesto): a fórmula inicial de declaração do A
previa máx. 2 lotes de avaliação e não contemplava alternativas de repair;
com 17 construídos executaram-se 3 lotes (todos dentro da passada única; a
fórmula foi corrigida para C/D antes de suas execuções).

## Cortes finais (abertura → fechamento)

- **A**: 0,0–36,4 (intro EA) · 311,0–329,7 (números/pistolas) · 493,9–583,9 (**leitura de patrocínio com cupom**).
- **C**: 18,1–70,5 (EA→thumbnail, **sem crash/save**) · 129,7–199,2 (passe de batalha/IA) · 261,2–301,5 (skin "Secute").
- **D**: 33,5–120,9 (**arco completo: criação→Thumbnail Missing→crash→save→reação**) · 129,7–219,6 (IA/"Group therapy" com desfecho) · 313,3–367,3 (5 pistolas→"Que loucura").

Análise criteriosa (contexto, desfecho, repetição, publicidade, títulos):
`editorial/discover-evaluation.md` · textos integrais: `editorial/discover-dossier.md`.

## Conclusão para o mantenedor

1. O caso de aceite (sequência real criação→thumbnail ausente→crash→save
   perdido→reação, dentro de 15–90 s, sem hardcode) foi entregue SOMENTE por D.
2. A (paridade com o app) selecionou publicidade e não propôs o arco completo —
   problema de AVALIAÇÃO (notas planas 55–75; anúncio no topo) e de descoberta.
3. C descobriu bem unidades autônomas mas truncou a história principal no meio
   e a premiou com a nota máxima (95) — nota do modelo não é prova de história
   concluída.
4. B (thinking) não é viável neste checkpoint com orçamento finito: o
   raciocínio não cabe (evidência em `prove-b`).
5. Nenhuma troca de produção foi feita; decisão sobre o modelo de produção
   pertence ao mantenedor.
