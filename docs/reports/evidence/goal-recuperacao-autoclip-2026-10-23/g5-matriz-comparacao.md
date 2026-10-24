# G5 — Matriz controlada Gemma 12B × Qwen3-4B + comparação por capacidade (2026-10-23)

## Matriz modelo (efeito MODELO isolado: mesmo pipeline do app, mesma transcrição
REAL de 135 segmentos na janela INÉDITA 1200–1476 s — nunca usada em calibração;
1000–1300 foi a da rubrica 12B anterior e 360–720 é calibração M3; mesmos
options/templates/sampling por motor; mesmo hardware RTX 5070/5700X)

| Métrica | Qwen3-4B (standard) | Gemma-4-12B (experimentalGemma) |
|---|---|---|
| Tempo total de geração (janela 4,6 min) | **93 s** | **286 s** (3,1×) |
| Cortes publicados | 12 | 4 |
| RAM pico do grupo (processo) | 1.251 MB | 1.218 MB (por chamada: modelo recarregado; 12B já medido ~7 GB host no vídeo inteiro — meta-cortes-texto) |
| VRAM usada durante | 3.182 MiB | 3.067–3.246 MiB |
| Notas | 82–85 no topo | 89 topo; 2 cortes ≤52 |
| Fidelidade (spot-check verbatim) | 3/3 OK | 3/3 OK |
| Falha? | nenhuma | 1ª tentativa: job morto por crash do WebView2 (conhecido); retry sem reload OK |

**Extrapolação honesta para o vídeo inteiro (568 segs):** 12B medido 19,7 min
(goal-cortes-texto); 4B na mesma janela foi 3,1× mais rápido → estimativa ~6–7 min
(medir antes de afirmar; os 93 s são da janela 4,6 min com ~10 chamadas).

### Qualidade editorial comparada (rubrica rápida nos top-3 de cada braço)
Os TÍTULOS do 4B são mais genéricos ("Definição da estrutura básica para
portfólio", "Clareza e eficácia no portfólio" — padrão "o falante apresenta X"),
enquanto o 12B nomeia o acontecimento ("Recomendação de Framer e PDF para
criação de...", "Por que evitar o Figma para currículos"). Fidelidade: ambos
OK nas checagens verbatim — nenhum inventou. 4B produziu 12 candidatos com
menos dedupe aparente (títulos repetitivos); 12B mais seletivo (4).
**Decisão de qualidade segue sendo do mantenedor**; a rubrica formal por
amostra já existe para o 12B (8,6/10; goal-cortes-texto).

## Comparação por capacidade — CutNicePro × AutoClip(zhouxiaoka) × AutoClip(artbyjazi)

Fonte: G4 (`g4-estudo-autoclip.md`, revisões fixadas).Documento de referência
permanente: `docs/references/OPEN-SOURCE-ENGINE-RESEARCH.md` (seção nova).

| Capacidade | AutoClip zhou (3d3b5ed) | AutoClip jazi (5d0eac3) | CutNicePro hoje | Diferença comprovada | Consequência | Adaptação proposta | Risco | Teste necessário |
|---|---|---|---|---|---|---|---|---|
| Seleção (descoberta) | one-pass com janelas (cloud 60min/70k chars; local 20min/12k) + legado 6-step | janelas 8min/60s overlap, concorrência local=1 | seleção por janelas de fala com orçamento de tokens (12B, ctx 8192) | zhou reduz ~40% tokens com formato `id\|time\|text` vs SRT | menos chamadas/contexto por vídeo | adaptar payload da seleção para formato compacto linha+tempo | baixo; formato é interno | regerar na amostra reservada e comparar cobertura/tempo |
| Fronteiras de corte | código corrige modelo: frase (regex+pausa 0,6s) → clamp duração → drop pergunta final; snap a cues ±3s | igual + silêncio medido (vale real, lead 0,12s/tail 0,28s) | LLM define fronteiras + scene_regions ajusta por transição | nossa ausência de camada determinística é a maior lacuna editorial (fins abruptos vistos na rubrica) | cortes terminam no meio do pensamento | adicionar refine programático por frase+pausa (dados já temos: Whisper word-level + silencedetect) | médio; pode conflitar com scene_regions | gerar, aplicar refine, rubrica antes/depois na amostra reservada |
| Avaliação/nota | 0–1.0, threshold 0.7 + min_keep/max_clips por tier; fallback marcado | score int 0-100, ranking | 0–100 com critérios ancorados em quotes (evidence.rs) | nossa ÂNCORA em citações é MAIS forte contra invenção | mantemos | nenhum | — |
| Títulos/resumo | títulos ≤20 chars, checagem CJK | — | títulos + resumo grounded | comparável | — | — | — |
| 9:16 enquadramento | YuNet+boca-que-se-move por PLANO; fit c/ blur sem rosto | landmarks+tracks+diarização, "never jarring" | centro único por clipe (M4, FORA do caminho padrão por decisão do mantenedor) | ambos superam nosso M4; jazi o mais maduro | não usar auto-crop hoje | estudar YuNet ONNX (MIT, ~1MB) como opt-in futuro | alto; "preencher o quadro ≠ detectar rosto" | demo isolada antes de qualquer default |
| ASR | faster-whisper sob demanda (tiny→large-v3), progresso por segmento | Whisper local + cuda | Whisper Turbo local | paridade | — | — | — |
| LLM local | cloud-first; Ollama/LM Studio presets c/ janela reduzida | local-first (provider Ollama próprio) | local-first com motor dedicado por chamada | nossa troca de modelo = 1 enum; reuso de modelo entre chamadas NÃO existe (recarga por chamada ~2-3min no total) | tempo desperdiçado | server sem mmproj p/ o MESMO modelo (autorizado se medido: "Texto pode usar server local sem mmproj se trouxer ganho medido") | médio; processo a gerenciar | A/B mesmo input; ganho esperado ~2-3 min/vídeo |
| Jobs/cancel | dedupe por projeto; bind/checkpoint; limpeza pós-delete | jobs/queue próprio | ClipJobs + ProcessingGate + cancel (comprovado gate F) | paridade funcional; nós sem limpeza de artefatos pós-cancel de render | baixo | — | — |
| Biblioteca global | DB SQL | DB SQL | agregação com isolamento por projeto (G3B) | paridade após correção | — | — | — |
| Falha honesta | PipelineFailure stage/código/http | ProviderError com hint | clipMessage mapeado + erro bruto no job | paridade | — | — | — |

**Defeito × escolha × hipótese**: fronteira determinística ausente = DEFICIT
contra ambos; título genérico do 4B = observação de modelo (escolha); "4B
resolve RAM" = HIPÓTESE (RAM medida por janela não mostrou diferença de pico
do grupo porque a recarga por chamada domina — medir reaproveitamento antes).
