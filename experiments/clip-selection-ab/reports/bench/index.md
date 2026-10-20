# CUTNICEPRO × SUPOCLIP — BENCHMARK EDITORIAL CONTROLADO (atualização 11)

2026-10-20 · Vídeo davyjones (599,098 s, sha 57fbe0fa…) · Transcrição de
referência compartilhada (322 falas, whisper.cpp base do app) · Mesmo
checkpoint Gemma-4-12B-IT QAT Q4_0 (sha 93567e57…) no MESMO runtime Ollama
CUDA · Amostragem idêntica comprovada em captura de proxy: temp 1.0, top_p
0.95, top_k 64, min_p 0, seed 42, thinking OFF · Tetos de quantidade
levantados para 20 (teto técnico) nos DOIS braços — quantidade como
resultado, nunca meta.

Documentos deste bench (em `experiments/clip-selection-ab/reports/bench/`):
- `controlled-results.md` — configuração, dados brutos e causa dos 3
- `editorial-evaluation.md` — inventário de acontecimentos × candidatos
- `ux-analysis.md` — módulos de edição/UI por capacidade
- `cnp-controlled.json` — traço completo do braço CNP (janelas/medções
  tokenizador/candidatos/descartes/tempos)
- Rastros brutos: `C:\SupoClipLab\logs\llm-capture\` (todas as chamadas dos
  dois braços), `..\..\scratch\bench-cnp\`, DB do lab (tarefa 1feeffd2)

---

## 1. CAUSA COMPROVADA DOS TRÊS CORTES DO SUPOCLIP

Com código e evidência (ai.py do repo f1a0c30):
1. 599 s ≤ `ANALYSIS_SINGLE_WINDOW_MAX_SECONDS` (900) → UMA janela única com
   a transcrição inteira (cobertura total, sem perda).
2. O prompt de janela única ordena: **"Choose 2-5 segments total"** — teto
   duro no enunciado ao modelo.
3. `max_final_clips_for_duration(599, MAX_CLIPS=10)` = 5 de teto pós-modelo
   (piso MIN_FINAL_CLIPS=5; 599/300 arredonda p/ 2, o piso vence).
4. Na execução ORIGINAL o modelo devolveu 3 (dentro de 2–5). Na execução
   CONTROLADA, com teto "up to 20", o modelo devolveu **4 segmentos**.
5. Zero descartes em `_validate_segments`/`dedupe_overlapping_segments` em
   ambas as execuções (logs sem "Dropping overlapping"; "AI analysis found
   4 segments" → 4 clipes; na original 3 segmentos → 3 clipes).

**Conclusão**: a quantidade baixa é PRINCIPALMENTE julgamento do próprio
modelo Gemma sob o prompt do SupoClip (que também manda pular picks fracos),
com o teto "2-5" como limitador adicional — NÃO é bug, parsing perdido nem
política de duração. Dados brutos da execução ORIGINAL não foram persistidos
pelo app (worker.log truncado) — declarado; na controlada, o proxy capturou
tudo (req/resp por chamada).

## 2. CONFIGURAÇÃO DOS 7 CORTES REAIS DO CUTNICEPRO (referência do mantenedor)

Coleção atual do app: **9 cortes gerados** — 7 pendentes + 2 rejeitados
pelo mantenedor (os "7" da referência são os não rejeitados). Metadados
persistidos: backend `experimentalGemma`, modelo
`gemma-4-12b-it-qat-q4_0.gguf`, template canônico thinking-off, amostragem
temp 1.0/top_k 64/top_p 0.95/min_p 0/seed 42, via llama-completion do app.
Modo automático (faixas 16–94 s coerentes com 10–180; 9 ≤ teto 12).
Transcrição: whisper.cpp base do app (hash 6879be3a… — mesma usada como
referência compartilhada do bench, exportada sem alterar o original).

## 3. CONFIGURAÇÃO CONTROLADA EFETIVAMENTE EXECUTADA

Ver tabela em `controlled-results.md`. Diferenças inevitáveis registradas:
- CNP rodou via harness Python que PORTA o caminho do app (7/7 testes de
  fidelidade espelhando selection.rs: conform/repair/DP/janelas/escape);
  SupoClip rodou o APP ORIGINAL com patches env-gated (LAB_BENCH) apenas
  para amostragem/thinking/seed, texto "up to 20" e teto 20 — prompts e
  lógica editoriais intocados.
- Duração: cada motor manteve SUA política (CNP 10–180; SupoClip 15–60) —
  é parte da estratégia comparada, registrada, não equalizada.
- Formato de chamada: /api/chat com grammar (CNP) × /v1 chat (SupoClip) —
  mesmo servidor/modelo/amostragem, verificado no proxy.

## 4. RESULTADOS BRUTOS (B — controlada)

- **CNP**: 4 janelas (6068 tokens medidos), 11 candidatos brutos, 11
  conformes diretos, 0 descartes por piso/publicidade, DP → **7 cortes**
  (4 perderam por sobreposição no DP). Tempos: descoberta 1,5–4,7 s/janela.
- **SupoClip**: 1 janela, **4 segmentos devolvidos**, 1 reparo de duração
  (65→60 s), 4 clipes. Análise 49,6 s (thinking off).
- Nenhum candidato desapareceu sem motivo rastreável em nenhum braço.

## 5. COBERTURA EDITORIAL (resumo; detalhe em editorial-evaluation.md)

Inventário de 10 acontecimentos (A–J) construído da transcrição:
- **CNP controlado cobre 8/10** — inclui a história do save COMPLETA
  (18–125 s, uma unidade de 107 s fechando no save perdido) e a skin da
  Valve fechando em "vale 3 mil reais". Incluiu o comercial Logitech
  (80) — **lacuna de política descoberta no app**: a exclusão de
  publicidade do modo automático só alcança alternativas reavaliadas;
  propostas diretas passam. (Na coleção real do mantenedor o mesmo
  comercial está presente com nota 46 — comportamento consistente.)
- **SupoClip controlado cobre 4/10** — história do save em DUAS peças (a
  segunda não abre sozinha), passe de batalha sem a punchline do erro de
  grafia, pistolas; perdeu Valve/PUBG/barulho/buzina/publicidade (o prompt
  manda pular sponsor reads — nenhum comercial em nenhuma execução).

## 6. COMPARAÇÃO A (produtos originais 9/3/14)

- CNP 9 (Gemma-auto real): 8–9 acontecimentos em unidades grandes; 2
  rejeitados pelo mantenedor; comercial presente (46).
- SupoClip 3: B+C+E — consistente com o comportamento controlado.
- OpusClip 14: 12+ acontecimentos com fragmentação deliberada (save em
  1:24 + 0:17), durações 0:17–2:51, comercial identificado e em último
  (60). Dados internos não disponíveis — referência externa apenas.
- A comparação A não prova superioridade de algoritmo (configurações
  distintas); a B é a evidência controlada.

## 7. UI/UX E EDIÇÃO (resumo; detalhe em ux-analysis.md)

ADOTAR: rascunho não destrutivo + Restore original; autosave serializado
com status; undo/redo com coalescimento por grupo; export como job em 2º
plano; documento único prévia↔export. ADAPTAR: edição de legenda por
palavra (CNP já tem words); posição de legenda arrastável; presets.
PORTAR (decisão do mantenedor): face-crop 9:16 (pendente no CNP); montagem
por segmentos (hoje fora do escopo). DESCARTAR: exigência de Docker p/
uso local; reasoning em inglês para o usuário final.

## 8. LIMITAÇÕES HONESTAS

- Uma amostra por braço (sem votação; política da tarefa). Seed fixa 42:
  mesma execução reproduz, outra seed pode variar (não testado — fora do
  orçamento declarado).
- Runtime de inferência igualado por design (Ollama); o CNP em produção usa
  llama-completion — o bench mede AS ESTRATÉGIAS, não os runtimes.
- OpusClip sem dados internos; posições temporais dos 14 estimadas pelos
  títulos/conteúdo, não exportadas do serviço.
- A política de publicidade do CNP foi avaliada como LACUNA (proposta direta
  contorna o filtro) — recomendação de correção no app, fora deste bench.

## 9. RECOMENDAÇÕES (fundamentadas nos resultados)

1. Corrigir no app CNP: aplicar o filtro de publicidade do modo automático
   também a propostas diretas (hoje o comercial entra com nota de proposta).
2. O comportamento "poucos cortes" do SupoClip é do modelo+prompt, não bug
   — se o CNP quiser mais cobertura, o gargalo está no PROMPT de descoberta
   (o bench mostrou 11 candidatos com o mesmo modelo e mesma seed quando o
   prompt pede unidades narrativas sem teto baixo).
3. A unidade narrativa longa (save completo em 107 s) foi a melhor entrega
   editorial do braço CNP — reforça a direção "autônomo por conteúdo".
4. Priorizar a adoção do modelo rascunho+autosave+undo (maior ganho de UX
   por esforço) antes de montagem/face-crop.
