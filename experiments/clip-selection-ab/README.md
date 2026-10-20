# Experimento A/B — Seleção de cortes (CutNicePro)

Comparação entre a finalização **atual** do seletor de clipes (gulosa por
ordem de score) e uma alternativa com **avaliação conjunta dos candidatos
antes da limitação final** (conceito estudado no SupoClip; implementação
própria). Diretório ISOLADO: nada aqui altera o aplicativo, os dados do
usuário ou configurações.

## Proveniência e fidelidade

- Base: `app/src-tauri` em `d5a17ad4ab835becb61cb54fd9b4e83c0160e4e2` (hoje
  HEAD~1; `git diff d5a17ad..8c5b504 -- app/src-tauri/src` é vazio — as cópias
  valem para ambos).
- Cópia byte a byte: `transcription/{types,process,progress,parser,words}.rs`,
  `clips/{types,analysis_types,text_engine,selection}.rs`,
  `clips/selection-prompt.txt`.
- Únicas diferenças das cópias (auditáveis por `diff`):
  1. `src/clips/selection.rs`: `struct Candidate`, `struct Reply` e
     `fn materialize` marcadas `pub(crate)` para reuso sem duplicação —
     nenhuma linha de decisão alterada;
  2. `src/transcription/types.rs`: `EngineStatus` removido (único uso de
     `super::profiles`, fora do caminho de seleção).
- `selection_x::collect` reproduz o corpo de `selection::select`
  (linhas 103-140) e devolve o conjunto de candidatos ANTES da etapa final.
- `finalize::greedy` é cópia 1:1 de `selection.rs:141-153` (o `break` do
  original vira registro de "não avaliado"; as decisões são idênticas).

## Licença do material de referência (decisão registrada)

O SupoClip (github.com/FujiwaraChoki/supoclip) é **AGPL-3.0**. Nenhum código,
prompt ou texto dele foi copiado; apenas o CONCEITO (dedupe por sobreposição
+ rerank conjunto antes da limitação) foi reimplementado em Rust próprio,
com prompt original em português. Incorporar CÓDIGO do SupoClip dependeria
de decisão de distribuição do mantenedor (copyleft forte) e NÃO foi feito.

## Constantes fixadas (execução real)

| Constante | Valor | Fonte |
|---|---|---|
| Transcrição | cópia de `transcripts/453eefc7…json` (projeto davyjones) | `data/transcript-davyjones.json` |
| Duração da mídia | 599,098 s | ffprobe 9.0.2 na mídia gerenciada |
| count / min / max / formato | 3 / 15 s / 90 s / 9:16 | compatível com a produção (clipes reais de 45–89 s) |
| Modelo | Qwen3-4B-Q4_K_M via `CNP_ANALYSIS_HOME` | mesmo motor do app |
| Inferência | temp=0, -c 8192, schema JSON | herdado do `text_engine` copiado |
| Seed | `--seed 42` passado pelo código (como no app); logs registram `sampler seed: 4294967295` com a cadeia terminando em `greedy` (temp=0). **NÃO COMPROVADO em qualquer direção**: o valor é consistente com sampler greedy + LLAMA_DEFAULT_SEED em builds llama.cpp (justificativa técnica também não verificada neste binário customizado); indistinguível sem modificar o runtime |
| Chamadas LLM | janelas da coleta (previsto: 2) + 1 rerank conjunto | idênticas para A e B na parte de janelas |

## Orçamento (conjunto finito, declarado antes da execução)

1. **Controlado** (determinístico, sem LLM): 3 cenários fixos, 1 rodada —
   efeito da ordem de seleção/descarte puro.
2. **Real**: 1 transcrição, **uma** coleta de candidatos; finalizações
   `greedy` (= A), `dp` (referência ótima por soma) e `joint` (= B, rerank
   conjunto). Total previsto de chamadas LLM: ≤ 3.
3. Repetições: NENHUMA além disso sem nova evidência; no máximo 1 repetição
   justificada por falha real (política de validação).

## Como executar

```
cd experiments/clip-selection-ab
export CNP_ANALYSIS_HOME=/c/CutNicePro/.tooling/vendor/analysis
cargo run --release -- controlled
cargo run --release -- collect
cargo run --release -- finalize --strategy greedy
cargo run --release -- finalize --strategy dp
cargo run --release -- finalize --strategy joint
python tools/analyze.py preserve-before   # antes da coleta
python tools/analyze.py metrics           # após as finalizações
python tools/analyze.py preserve-after && python tools/analyze.py preserve-check
```

Saídas em `reports/` (candidates, real-*, controlled, metrics,
preservation-*, audit-mtime, ab-summary); rascunhos de cada chamada LLM em
`scratch/`.

## Preservação — ordem cronológica e natureza de cada evidência

1. ANTES das operações (hash SHA-256 dos JSONs de estado do app-data):
   `preservation-before.json` — gerado antes do primeiro build/execução.
2. DEPOIS das operações, MESMO escopo: `preservation-after.json` —
   **comparação antes/depois: idêntica** (`preservation-check.json`,
   evidência forte).
3. Inventário APENAS posterior (natureza distinta, complementar):
   `preservation-after-full.json` (21 arquivos, incl. mídia) e
   `audit-mtime.json` (nenhum arquivo criado/modificado após o início).

## Contraprovas e validação (atualização 2 — determinístico, sem LLM)

- `reports/counterproof.json` — contraprova R2 (dedupe-50% antes da DP
  destrói o ótimo: 2 cortes/150 → 1/90) + distinção max-soma ×
  max-quantidade (100×1 vs 98×2). Reproduz o `external/
  contraprovas_selecao.py` (enumeração exaustiva independente, fornecida
  pelo mantenedor; três denominadores de sobreposição).
- `reports/crosscheck.json` — DP × enumeração exaustiva: 248 cenários,
  0 falhas.
- `reports/editorial/` — dossiê dos 12 candidatos com contexto e mapa de
  cobertura (`candidates-full.md`) e avaliação editorial com citações
  (`evaluation.md`).
- `reports/ab2-summary.md` — resumo autocontido da atualização 2.

## Métricas (independentes da nota do modelo)

M1 nº de cortes entregues vs solicitado · M2 soma/mediana de notas
(descritivo) · M3 sobreposição textual entre escolhidos (Jaccard de uni e
bigramas) · M4 validade de fronteiras e durações · M5 descartes por motivo ·
M6 diversidade (gap mínimo entre starts; regiões de 60 s cobertas) ·
M7 tempo por estratégia · M8 (controlado) distância do ótimo DP.
