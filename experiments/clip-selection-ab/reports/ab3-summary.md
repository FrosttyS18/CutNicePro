# Comparação A/B/C — atualização 3 (correção da construção + avaliação integral)

Mesma transcrição (davyjones), mesmas opções registradas do experimento (min 15 / max 90 / count 3 / 9:16), mesmo motor (Qwen3-4B-Q4_K_M, temp 0). As opções HISTÓRICAS do app na geração de produção são DESCONHECIDAS (não presumidas).

## Causas confirmadas (determinístico, sobre brutos preservados)
- 8/12 propostas fora da faixa: 1 longa demais (0–200,4 s p/ limite 90) e 7 curtas demais (spans naturais 6,9–13,0 s p/ mínimo 15).
- O caminho ANTIGO transformava silenciosamente (encurtava/alongava) e PRESERVAVA a nota: 0–200,4→0–88,7 com nota 85 do intervalo longo.
- O modelo das janelas não escolheu momentos: PARTITIONOU as falas em blocos quase consecutivos (janela 0: 0–100, 101–105, 106–110…; janela 1 pula o id 220).
- O rerank antigo recebia 420 chars: o texto do clipe [400,7–455,8] cortava ANTES do desfecho da Valve e o do [506,1–539,2] cortava NA ENTRADA do comercial.
- Recuperação por LLM: INEFICAZ neste motor — 2 tentativas × 2 lotes (4 execuções; prompts distintos) ecoaram as propostas originais (brutos: scratch/recovery-echo-* e scratch/recovery-*). Substituída por reparo determinístico no app.

## Construção: antes → depois
- ANTES: 12 candidatos, 8 com intervalo alterado silenciosamente (nota inalterada).
- DEPOIS: 12 candidatos, 0 descartados; 4 conformes + 8 REPARADOS deterministicamente COM marcação em reasons (início avançado p/ preservar o encerramento; fim estendido p/ preservar a abertura). Janela 0: 0+6; janela 1: 4+2.

## Escolhas finais
| | 1º | 2º | 3º |
|---|---|---|---|
| A (histórico) | [0.0–88.7] 85 | [400.7–455.8] 85 | [483.3–505.7] 80
| B (construção corrigida) | [110.8–200.4] 85 | [400.7–455.8] 85 | [483.3–505.7] 80
| C (rerank integral) | [110.8–200.4] 85 | [209.7–226.7] 80 | — |

## Textos reais (abertura e fechamento) dos cortes escolhidos
- **A [0.0–88.7] nota 85** — ABRE: “Bom, galera, antes da gente entrar no GTA, eu queria só trazer uma observação aqui, porque assim...” … FECHA: “no Playstation.”
- **A [400.7–455.8] nota 85** — ABRE: “Que porra é essa?” … FECHA: “Caralho.”
- **A [483.3–505.7] nota 80** — ABRE: “Mas em qualquer momento, né...” … FECHA: “Ele tá piorando, é.”
- **B [110.8–200.4] nota 85** — ABRE: “O que eu achei engraçado é que, assim,” … FECHA: “É o grupo do papi.”
- **B [400.7–455.8] nota 85** — ABRE: “Que porra é essa?” … FECHA: “Caralho.”
- **B [483.3–505.7] nota 80** — ABRE: “Mas em qualquer momento, né...” … FECHA: “Ele tá piorando, é.”
- **C [110.8–200.4] nota 85** — ABRE: “O que eu achei engraçado é que, assim,” … FECHA: “É o grupo do papi.”
- **C [209.7–226.7] nota 80** — ABRE: “É um erro, é.” … FECHA: “na cabeça, na parte de trás do personagem, né?”

## Casos de avaliação (exigidos pelo ofício) — constatações, não vereditos forçados
- **História do save**: em A o corte [0–88,7] termina no crash, ANTES do desfecho (“matou o save… começar tudo de novo”, ~89–131 s). Em B/C o primeiro corte é [110,8–200,4]: cobre o FINAL da sequência (loads/save/meme), mas o início (89–110,8) segue fora — nenhum caminho captura o arco completo, pois o COLETOR nunca propôs [~55–160].
- **Group therapy / “grupo do papi”**: sem candidato em A (região invisível ao pool). Em B e C, DENTRO do primeiro corte [110,8–200,4] (o reparo preservou o encerramento proposto na fala 100).
- **Encerramento da história da skin ([400,7–455,8])**: completo em A e B (conforme natural). O C NÃO o escolheu — priorizou continuidade na região 110–227; avaliação de modelo, sujeita a julgamento humano.
- **Mistura de assuntos ([483,3–505,7])**: escolhido por A e B (nota inicial 80); NÃO escolhido pelo C.
- **Publicidade ([506,1–539,2], termina no comercial Logitech)**: existe no pool B como conforme; nenhum caminho o escolheu (A/B por nota; C por avaliação). O rerank integral via o texto completo, incluindo o comercial.

## Numeração dos candidatos (3 espaços distintos, declarados)
- Ordem cronológica usada nos dossiês das rodadas 1-2 (candidates-full.md): C1=[0–88,7]… C8=[400,7–455,8], C11=[483,3–505,7], C12=[506,1–539,2].
- Prompt do rerank ANTIGO (rerank-joint-prompt.txt): [400,7–455,8]=C2, [483,3–505,7]=C3, [506,1–539,2]=C6.
- Prompt do C ATUAL (rerank-full-prompt.txt, sobre o pool v2): [400,7–455,8]=C7, [483,3–505,7]=C9, [506,1–539,2]=C10. Neste documento os cortes são citados por INTERVALO para evitar ambiguidade.

## Correções pós-revisão (rodada 1)
- O C fez **3 picks (C1, C3, C5) e entregou 2 clipes**: C5=[224,5–242,8] sobrepõe C3=[209,7–226,7] e foi descartado — o descarte era silencioso no código e no relatório; agora registrado em real-c2.json (details.overlap_discarded, reconstruído dos brutos sem nova chamada) e no código para futuras execuções.
- Tensão de design declarada (limitação): a nota HERDADA ainda decide a finalização (B) antes de qualquer reavaliação — a marcação é honesta, mas a reavaliação só ocorre depois da escolha (análise por clipe no app; rerank C no experimento). Alternativas (finalizar sem notas, ou reavaliar antes de finalizar) ficam como questão de produto.

## Inferências e tempos (rodada 3)
- Janelas: 0 chamadas (respostas brutas preservadas reutilizadas). Recuperação por LLM: 4 execuções (2 tentativas × 2 lotes; evidência de eco; ineficaz). Reparo determinístico: 0. Rerank integral: 1 chamada, 26,6 s, prompt 8.059 chars (coube no contexto; sem lote necessário).
- App: suítes 102 passed / 0 failed / 6 ignored (pré-existentes).