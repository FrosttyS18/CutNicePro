# Resumo A/B/C — atualização 2 (autocontido; não exige executar nada)

Projeto davyjones · 12 candidatos já coletados (reutilizados; 0 novas
chamadas de inferência nesta atualização) · constantes inalteradas
(3 cortes, 15–90 s, 9:16, Qwen3-4B, temp=0).

## O que mudou em relação ao resumo anterior

1. **Recomendação de dedupe 50% RETIRADA (contraprova confirmada).**
   Caso: longo [0,60) nota 90 + esquerda [0,30) 75 + direita [30,60) 75,
   count=2. DP sem poda = esquerda+direita (2 cortes, soma 150). Composição
   dedupe-50%-antes-da-DP = só o longo (1 corte, soma 90). Reproduzido no
   código Rust do experimento (testes + `reports/counterproof.json`) e
   confirmado de forma independente pela enumeração exaustiva em Python
   fornecida pelo mantenedor (`external/contraprovas_selecao.py`), que
   mostra o mesmo resultado com três denominadores diferentes
   (IoU/menor/maior). Política substituta implementada: **equivalência
   demonstrada** — remover apenas candidatos com cobertura de falas
   IDÊNTICA à de um candidato de nota maior (sem limiar numérico). Nos 12
   reais: ver números abaixo.
2. **Objetivo da DP fixado por contrato, não por gosto.** A UI
   ("Quantidade" 1–12) e o seletor atual tratam count como TETO: aceitam
   menos e priorizam nota. Caso [0,60):100 vs [0,30):49+[30,60):49:
   max-soma escolhe o longo (100, 1 corte); max-quantidade escolhe os dois
   curtos (98, 2 cortes). Contrato adotado na DP: **max soma com até count**
   (= comportamento atual, ótimo). Priorizar quantidade é decisão de
   produto NÃO tomada aqui (demonstração em `counterproof.json`).
3. **DP validada contra enumeração exaustiva**: 248 cenários (240
   aleatórios determinísticos + vazio + encostados + duplicatas exatas +
   empates + 3 permutações + count>n), **0 falhas**
   (`reports/crosscheck.json`; teste `crosscheck_dp_contra_enumeracao`).
4. **Diagnósticos corrigidos** (detalhe na seção final).

## Resultado nos 12 candidatos reais (números exatos)

- A (greedy, cópia 1:1 do atual): C1 [0–88,7] 85, C8 [400,7–455,8] 85,
  C11 [483,3–505,7] 80 — 3/3, soma 250.
- B (DP, sem poda): os MESMOS três (combinatória não era o gargalo aqui).
- C (rerank conjunto, reutilizado): os MESMOS intervalos, com razões e
  notas recalibradas; 2 dedupes de janela; sem fallback.
- dedupe por equivalência de cobertura: **0 remoções nos 12 reais** (12
  coberturas de falas distintas) — conservadora por construção; a antiga
  dedupe-50% removia 2 e foi retirada.

## Avaliação editorial (pelo agente, com citações; auditoria humana pendente)

- **C8 é o melhor corte do pool** — arco completo: skin bugada → história
  da Valve (estátua → skin ruim → nova skin → “a skin antiga hoje vale 3
  mil reais”).
- **C1 é bom mas termina cedo** — o desfecho “matou o save, a gente teve
  que começar tudo de novo” está FORA do corte (fala 40).
- **C11 é o elo fraco** — mistura PUBG (“Sobretudão”) com o PC/Makita e
  termina solto (“Ele tá piorando, é”); nota inicial 80 otimista.
- **C12 descartado corretamente** — terminaria DENTRO do comercial
  (“agradecer mais uma vez o Logitech G”).
- C2–C6: janelas deslizantes do mesmo trecho raso; C7 é ponte fraca para
  C8; C9/C10 fracos.

## Momentos relevantes que NÃO viraram candidatos (limitação do coletor)

- Desfecho do save (~89–131 s) — completaria C1.
- Meme “Group therapy” → “É o grupo do papi” (~130–200 s) — autocontido.
- **“Secute” + personagem com 5–6 pistolas (~249–382 s)** — nenhum
  candidato cobre; subtrecho das pistolas (falas 163–209, ~76,6 s de span).
- Conclusão: nesta transcrição o gargalo editorial está na COLETA
  (6 candidatos/janela), não na finalização. Um finalizador melhor não
  recupera o que o coletor não gerou.

## Diagnósticos corrigidos (em relação à entrega anterior)

- **Seed**: os logs registram `sampler seed: 4294967295` com a cadeia
  terminando em `greedy` (temp=0). Comportamento CONSISTENTE com o uso de
  sampler greedy e LLAMA_DEFAULT_SEED em builds llama.cpp (não verificado
  neste binário específico) — o valor isolado NÃO prova que `--seed 42`
  foi ignorado, nem o oposto. Diagnóstico anterior REBAIXADO a
  “não comprovado/indistinguível sem modificar o runtime”; nada foi
  modificado.
- **Produção × experimento**: `scene_regions::refine` só move fronteiras
  até 0,8 s (código, linhas 102/112) — não explica diferenças de 16 s. A
  causa compatível são as OPÇÕES: a UI envia min = máx(10, duração/2);
  com “Duração máxima = 90 s” → min 45/max 90, faixa em que os 3 clipes
  de produção (88,8/55,1/45,2 s) cabem exatamente, ao contrário do
  experimento (min 15). Comparação mantida INCONCLUSIVA (opções originais
  não registradas); a atribuição anterior ao refine foi retirada.
- **Preservação**: ordem e natureza explicitadas no README — a evidência
  forte é a comparação de hashes ANTES/DEPOIS das operações (JSONs de
  estado, idênticos); o inventário completo pós-fato (21 arquivos) e a
  auditoria de mtimes são evidência COMPLEMENTAR de natureza distinta.

## Status das conclusões (demonstrada / refutada / inconclusiva)

| Conclusão | Status |
|---|---|
| Guloso perde cortes em conflito (S1/S2) | DEMONSTRADA (determinístico) |
| Dedupe 50% antes da DP pode destruir o ótimo | DEMONSTRADA (Rust + Python independente) |
| Dedupe por equivalência de cobertura é seguro p/ DP | **REFUTADA EM GERAL** (contraprova da revisão adversarial: coberturas idênticas com janelas distintas — ótimo 155→95; teste de regressão adicionado). Segura APENAS sob a âncora do coletor (start/end em fronteiras de fala), condição que cessa após scene_regions::refine |
| DP == ótimo (max soma, até count) | DEMONSTRADA em 249 cenários + casos estruturais |
| max-soma ≠ max-quantidade | DEMONSTRADA (100×1 vs 98×2) |
| DP melhora os cortes DESTA transcrição | REFUTADA (A=B=dp aqui — sem conflito custoso) |
| Rerank LLM melhora a escolha DESTA transcrição | INCONCLUSIVA (convergiu; N=1; só transparência mudou) |
| C11 é qualitativamente inferior a C1/C8 | AVALIAÇÃO DE MODELO (citações em evaluation.md) |
| Gargalo editorial aqui está na coleta | AVALIAÇÃO DE MODELO, fortemente indicada (3 momentos não cobertos) |
| “--seed 42 ignorado” | NÃO COMPROVADA (LLAMA_DEFAULT_SEED esperado com temp=0) |
| Diferenças vs produção por scene_regions | REFUTADA (limite 0,8 s); hipótese opções min=45 CONSISTENTE, formalmente inconclusiva |
| Equivalência ao SupoClip completo | NENHUMA alegada — apenas o conceito de rerank estudado; nada copiado (AGPL) |

## Recomendações de integração por tipo de evidência

1. **Corretude combinatória (demonstrada):** substituir o loop guloso por
   DP (max soma, até count) SEM poda prévia. Custo zero, resolve S1/S2.
2. **Qualidade editorial (não demonstrada por soma):** nenhum ganho
   comprovado de DP/rerank NESTE pool; o ganho editorial provável está na
   COLETA (mais candidatos/janela ou candidatos mais longos que cruzem
   fronteiras de janela) — registrar como investigação futura, não como
   recomendação fechada.
3. **Desempenho (medido):** DP/greedy ≈ 0 s; rerank +19,9 s/+1 chamada —
   só justificar se transparência/calibração forem desejadas.
