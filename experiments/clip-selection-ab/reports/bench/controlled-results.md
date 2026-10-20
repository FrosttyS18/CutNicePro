# Bench controlado — dados brutos das duas execuções (2026-10-20)

## Configuração comum (comprovada nas capturas do proxy 11435)

| Parâmetro | Braço CNP | Braço SupoClip |
|---|---|---|
| Backend | Ollama nativo /api/chat (format=grammar) | Ollama /v1 via pydantic-ai |
| Modelo | gemma4-qat — MESMOS pesos (sha 93567e57), Q4_0, gemma4 | idem |
| Amostragem | temp 1.0, top_p 0.95, top_k 64, min_p 0, seed 42 | temp 1.0, top_p 0.95, top_k 64, seed 42 (captura 011) |
| Thinking | OFF (think=false) | OFF (reasoning_effort=none; reasoning 0 chars na captura) |
| Transcrição | referência compartilhada (322 falas, whisper.cpp base do app CNP) | idem (injetada por SUPOCLIP_TRANSCRIPT_OVERRIDE; whisper pulado — log "Generating transcript" → análise em ~1 s) |
| Teto de quantidade | 20/janela, 20 final (teto técnico do bench) | "up to 20" no prompt + ceiling 20 |
| Duração | 10–180 s (modo automático do app) | 15–60 s (política editorial do próprio SupoClip, mantida) |

Evidências: `C:\SupoClipLab\logs\llm-capture\` (req/resp/meta por chamada);
`scratch\bench-cnp\*-req/resp.json`; `reports\bench\cnp-controlled.json`.

## Braço CutNicePro (bench_cnp.py — porta do app b6f146e, 7/7 testes de fidelidade)

Janelas com orçamento real: [(0,109),(52,218),(110,216),(157,322)] —
6068 tokens/janela medidas com llama-tokenize (o mesmo tokenizador do app).
11 candidatos brutos; TODOS conformes diretos (nenhuma alternativa de
reparo necessária); 0 descartes por piso/publicidade; DP escolheu 7.

| ✔ | intervalo | span | score | ids | janela | destino |
|---|---|---|---|---|---|---|
| ✔ | 18,1–125,5 | 107 s | 95 | [6,59] | w0 | SELETO — história do save COMPLETA |
| ✔ | 129,7–234,4 | 105 s | 95 | [63,123] | w1 | SELETO — passe de batalha/IA/Group Therapy |
|   | 129,7–212,6 | 83 s | 92 | [63,108] | w0 | sobreposto ao 95 (DP) |
| ✔ | 238,4–346,2 | 108 s | 88 | [124,185] | w1 | SELETO — buzina→pistolas |
|   | 245,0–284,2 | 39 s | 85 | [128,150] | w2 | sobreposto |
|   | 308,0–367,3 | 59 s | 92 | [164,200] | w2 | sobreposto (pistolas) |
|   | 317,5–373,3 | 56 s | 92 | [169,204] | w3 | sobreposto (pistolas) |
| ✔ | 346,4–393,4 | 47 s | 92 | [186,217] | w1 | SELETO — continuação armas/EA |
| ✔ | 418,4–455,0 | 37 s | 88 | [231,240] | w3 | SELETO — skin Valve R$3 mil |
| ✔ | 484,1–518,3 | 34 s | 85 | [268,285] | w3 | SELETO — itens PUBG + início barulho PC |
| ✔ | 536,7–599,1 | 62 s | 80 | [293,321] | w3 | SELETO — comercial Logitech (proposta direta; lacuna: exclusão de publicidade do automático só atinge alternativas reavaliadas, não propostas diretas) |

Tempos: janelas ~6 medições tokenizador; descoberta 4 chamadas (1,5–4,7 s
cada); total < 1 min. Avaliação: 0 lotes (sem pendentes).

## Braço SupoClip (app original, patches LAB-BENCH env-gated)

1 chamada de análise (janela única 599 s ≤ 900 s). Captura 011: 49,6 s,
8.045 chars de conteúdo, 4 segmentos devolvidos pelo modelo — com teto
"up to 20". Funil no worker.log: "AI analysis found 4 segments" → 1
reparo de duração (01:28→01:13: 65 s > 60 s máx) → 4 validados → 4 clipes.

| intervalo | span | virality | hook_title |
|---|---|---|---|
| 02:12–03:50 (proposta 02:12–03:02 pós-reparo? ver DB) | 50–98 s | 85 | A EA usou IA no Battlefield 6? |
| 00:23–01:13 | 50 s | 75 | O jogo de 400 reais que deu erro |
| 01:31–02:00 | 29 s | 62 | O pesadelo de perder o save |
| 05:20–06:15 | 55 s | 61 | O soldado mais preparado da guerra |

DB (gerados): 02:12–03:02 (50 s, 85) / 00:23–01:13 (50 s, 75) /
01:31–02:00 (29 s, 62) / 05:20–06:15 (55 s, 61). Nota: o segmento
02:12–03:50 (98 s) foi REPARADO para 03:02 pelo próprio SupoClip (máx 60 s).

## Resposta à pergunta central (por que 3 na execução original)

Código (com evidência):
1. `ANALYSIS_SINGLE_WINDOW_MAX_SECONDS=900` → 599 s = 1 janela única.
2. Prompt single-window: "Choose 2-5 segments total" (ai.py:718+prompt).
3. `max_final_clips_for_duration`: min(5, ceil(599/300)=2)=max→ 5 de teto.
4. Modelo devolveu 3 (dentro de 2-5) na original; no bench SEM teto
   ("up to 20") devolveu 4. Conclusão: a quantidade baixa é PRINCIPALMENTE
   julgamento do modelo Gemma sob este prompt (que também manda "skip weak
   standalone picks"), amplificado pelo teto 2-5 — NÃO é perda de dados:
   validação/dedupe não descartaram nada em nenhuma das duas execuções
   (logs: "found 4 segments" → 4 clipes; zero "Dropping overlapping").
5. Sem bruto armazenado na ORIGINAL (worker.log truncado por restart com
   `>`): declarado; na execução controlada o proxy capturou tudo.
