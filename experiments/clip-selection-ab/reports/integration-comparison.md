# Integração experimental Gemma no app — comparação e veredicto técnico (atualização 8)

2026-10-20 · Duas execuções REAIS pelo caminho integrado (teste ignorado
`real_experimental_gemma_generation_end_to_end`, mesma transcrição de validação
do pipeline, base isolada `.tooling/vendor/pipeline-validation-gemma*`):
- **Execução 1** (743,8 s): prompt de seleção de PRODUÇÃO — variante descartada
  para o modo experimental (não era o fluxo validado); artefatos preservados em
  `pipeline-validation-gemma-run1-productionprompt`.
- **Execução 2** (690,2 s): prompt de UNIDADES NARRATIVAS da atualização 7
  (`discover-prompt.txt`, agora no app) + template canônico + amostragem
  documentada. Repetição única justificada por correção material (troca do
  prompt), registrada.

## O que o caminho integrado preserva do fluxo validado (item 2 da tarefa)

| Elemento | Estado |
|---|---|
| Template canônico Gemma 4 (`<\|turn>`/`<\|channel>`, thinking off) | ✓ idêntico (`prompt_gemma`, teste de paridade de string) |
| Amostragem documentada (temp 1,0 / top_k 64 / top_p 0,95 / min_p 0 / seed 42) | ✓ argv por chamada; registro técnico na coleção |
| Sem `--fit` no experimental (contexto chega inteiro; `-c 8192`) | ✓ |
| Janelas com cobertura + orçamento REAL de tokens (tokenizador do modelo) | ✓ `windows_budgeted` (orçamento 6068; 4 medições na execução 2) |
| Candidatura própria + avaliação de TODOS (lotes de 8, sem nota antiga) | ✓ pipeline existente do app, motor injetado |
| Associação estável ID↔intervalo↔texto↔nota | ✓ inalterada (testes de associação preservados) |
| Falha/cancelamento | ✓ `control.check()` por janela, por lote e entre medições de tokens |
| Escolha final pelo código (DP sem sobreposição) | ✓ inalterado |
| Análise do conteúdo publicado (título/critérios com evidência citada) | ✓ `analysis.validate` verde nos 3 cortes das duas execuções |
| Metadados técnicos (modelo/config/procedência) | ✓ `engine` na coleção; UI só mostra selo "experimental" |
| Sem fallback silencioso de modelo | ✓ experimental ausente → erro explícito com orientação |
| Análise antiga de outro motor NÃO é reutilizada | ✓ `merge_previous` (testado) |

## Desempenho e offload (medido, não deduzido por nome de pasta)

| métrica | execução 2 integrada | atualização 7 (experimento D) |
|---|---|---|
| prompt eval | 101,9–108,1 tok/s | 101,5–103,7 tok/s |
| geração | 3,4–4,0 tok/s | 3,43–3,44 tok/s |
| load por chamada | 3,5–5,8 s (total 23,2 s) | 4,2–11,7 s |
| pipeline completo | 690,2 s (+0,2 s descoberta) | 470,6 s (sem cenas/análise) |

- **Offload efetivo confirmado por paridade**: prompt eval ~102 tok/s é ordem
  de grandeza acima do perfil CPU para 12B; idêntico ao experimento validado.
- **Pico de memória**: os logs do runtime não expõem VRAM; `--list-devices`
  antes/depois mostrou 11175 MiB livres nas duas medições (modelo não
  residente entre chamadas — cada chamada é um processo novo). Pico real
  durante as chamadas: INDISPONÍVEL nos artefatos atuais; declarado como tal.
- Gargalo dominante: geração single-token a 3,4 tok/s (perfil Vulkan do 12B
  nesta GPU) + recarga de modelo por chamada. Nenhuma otimização aberta: exigiria
  gargalo medido e aprovação, e o orçamento da tarefa veda campanha.

## Comparação editorial: experimento × integração (fato material)

A execução 2 escolheu 420,9–461,8 / 315,1–367,3 / 488,4–533,4 s (notas
58/56/42; unidades completas com títulos e critérios validados). O ARCO da
atualização 7 (criação → thumbnail ausente → crash → save → reação) NÃO foi o
corte final — mas a tracing mostra:

1. A janela 0 **propôs exatamente a região do arco**: candidato (15,64) ≈
   28–120 s, nota 88 — 92 s, fora da faixa máx 90 → alternativas de reparo
   E1 = 32,2–120,9 s (essencialmente o D1 33,5–120,9 da atualização 7) e
   E2 = 26,3–115,8 s.
2. A avaliação DESTA amostra deu **E1=60** ("muito longo e narrativa confusa";
   88,7 s no limite) e E2=45 — contra 85 do D1 na atualização 7 (a versão SEM
   desfecho havia recebido 65 lá).
3. DP então escolheu outras unidades (soma maior).

Conclusão técnica: com amostragem documentada temp 1,0 (uma amostra com seed),
o resultado de UMA execução é de alta variância — o fluxo estrutural é fiel e o
arco CHEGA à disputa, mas a nota de uma amostra não garante a seleção. Na
atualização 7 a amostra foi favorável; aqui não foi. Isso é um ACHADO sobre o
modo experimental (estabilidade de resultado), não um defeito de integração:
cada etapa proposta→conformação/reparo→avaliação própria→DP funcionou como
especificado e está testada sem LLM. Estabilidade/consistência editorial entre
amostras é critério do mantenedor (exige decisão: mais amostras, votação,
temperatura menor contra a documentação do modelo — qualquer uma delas é
mudança de escopo e não foi feita aqui).

## Testes técnicos vs aprovação editorial (distinção explícita)

- TÉCNICO (PASS): 119 testes Rust do app (11 novos: template/argv/serde/
  orçamento de janelas/subdivisão/mesclagem por backend/round-trip de
  metadados); 154 testes TS (2 novos: envio de `quality` e selo experimental);
  27 testes do executor Python do experimento (correção do descarte); 2
  execuções reais integradas de ponta a ponta com persistência e reabertura.
- EDITORIAL (PENDENTE DO MANTENOR): assistir aos cortes das duas execuções
  (JSONs em `pipeline-validation-gemma*/generated-clips-gemma.json`), comparar
  com o dossiê da atualização 7 e decidir adoção — inclusive sobre a
  variabilidade de amostra descrita acima.

## Procedimento de reversão (preparado; nada precisa ser executado agora)

1. **Voltar a gerar com o motor padrão**: no app, diálogogo "Gerar cortes" →
   Análise "Padrão". Nenhuma configuração global foi alterada; projetos novos
   continuam no padrão por omissão.
2. **Desativar o modo experimental por completo**: remover/renomear
   `.tooling/vendor/analysis/engine-gemma.json` (o seletor passa a exibir erro
   claro se alguém tentar usá-lo; o padrão não lê esse arquivo).
3. **Remover o código** (se desejado): os commits futuros podem reverter os
   arquivos desta entrega (listados no relatório ZCODE); nenhum dado do
   usuário depende deles — coleções antigas sem metadado `engine` continuam
   válidas (teste dedicado).
4. Coleções geradas no experimental continuam abertas/reexportáveis no padrão
   (IDs idênticos por intervalo; apenas reanálise usa o motor de origem).
