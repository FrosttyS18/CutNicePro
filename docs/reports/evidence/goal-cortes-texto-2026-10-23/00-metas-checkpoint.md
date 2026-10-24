# CHECKPOINT DE METAS — declaradas ANTES do baseline/calibração (2026-10-23, goal-cortes-texto)

Fundamentação: baseline parcial existente (M3, janela 360–720 s + contexto,
219 segs): textual 674 s com ~12 chamadas ao motor (cada chamada do
llama-completion RECARREGA o modelo 12B Q4_0). Vídeo inteiro = 568 segs
(≈2,6× o contexto) — SEM extrapolação linear como prova; os valores abaixo
são METAS de experiência, medidas reais virão do baseline integral (F2).

## Metas de tempo e recursos (vídeo 24,6 min / 568 segs / transcrição pronta)
- **Espera total de geração: ≤ 20 min.** Justificativa: manter o fluxo
  utilizável (usuário espera uma vez por biblioteca); acima disso a
  auto-geração não deve ser habilitada. Trade-off declarado: NÃO reduzir
  cobertura/candidatos/janelas para bater a meta (proibido pelo objetivo).
- **RAM do grupo de processos do app: pico ≤ 6 GB.** (Editor aprovado usa
  ~2,1–2,2 GB com o blob; motor 12B Q4_0 cabe em ~7 GB VRAM.)
- **VRAM do motor: ≤ 8 GB** (RTX 5070 12 GB; deixa headroom p/ WebView2).
- **Editor utilizável durante geração** (gate E, eventos reais).
- **Qualidade: rubrica ≥ 8/10 na amostra reservada NOVA, com fidelidade
  obrigatória 2/2** (avaliação independente do gerador; aceite humano
  segue pendente por definição).

## Metodologia da medição (e limitações declaradas)
- Tempo por etapa: contagem e timestamps das chamadas no scratch do job
  (result.json/log por stem: selection-N, evaluate-N, analysis-N); tempo
  total pelo job. LIMITAÇÃO: timestamps internos dos logs são por PROCESSO
  (mm:ss desde o spawn de cada chamada) — o relógio de parede por chamada
  vem do mtime dos arquivos; precisão ±1-2 s.
- Memória: amostragem do WorkingSet do GRUPO (cutnicepro + msedgewebview2 +
  llama-completion) a cada 15 s; VRAM via nvidia-smi (leitura pontual no
  pico e no fim). LIMITAÇÃO: WorkingSet superestima memória compartilhada
  entre processos (DLLs); VRAM do WebView2 não é separável por processo na
  leitura simples — declarado, não medido por componente.
- Partida fria × reuso × cache: baseline = partida fria (primeira geração
  do projeto); reuso de modelo por chamada NÃO existe no caminho exe
  (recarrega por chamada — parte do diagnóstico); cache de resultados =
  dedupe/incremental do store (validado no gate F).

## Amostras — separação calibração × avaliação (declarada ANTES do ciclo)
- **CALIBRAÇÃO (já exposta)**: janela 360–720 s (contexto 240–840) — usada
  no M3 (comparação + inspeção de resultados) e nos labs M2. NÃO é teste
  cego; serve para ajustar instruções se a rubrica falhar.
- **AVALIAÇÃO (reservada AGORA, antes de qualquer novo ajuste)**: janela
  **1000–1300 s** (min ~16:40–21:40), contexto 880–1420. Exposição anterior
  conhecida: NENHUM resultado M3/M2 cobre 1000–1300 (clipes M3 documentados
  entre 245–839 s — conferível em m3-arm-*.json); nenhum ajuste de
  instrução desta meta tocou essa janela.

## Orçamento do objetivo
4 h ativas (novo), máx. 2 abordagens de otimização, máx. 2 ciclos de
calibração; 1 rodada por fatia + 1 repetição só por falha/mudança pert.
Horas da meta multimodal anterior (~8 h) NÃO são apagadas — registro
separado no ENGINE-HANDOFF.
