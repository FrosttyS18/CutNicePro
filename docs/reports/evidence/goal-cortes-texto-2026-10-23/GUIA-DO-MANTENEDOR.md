# GUIA DO MANTENEDOR — cortes por texto (goal-cortes-texto, 2026-10-23)

## O que já está pronto para você conferir (arquivos reproduzíveis)
Pasta: `docs/reports/evidence/goal-cortes-texto-2026-10-23/`

| Arquivo | Conteúdo | Conferência esperada |
|---|---|---|
| `corte-real-1.mp4` (17,1 s) | "Como identificar problemas de clareza no portfólio" (nota 95) — 0:00–0:17 do vídeo | Abre falando do problema; legenda queimada correta |
| `corte-real-2.mp4` (23,5 s) | "A preferência por qualidade em vez de quantidade" (95) — 19:54–20:18 | Argumento 3-casos-bem-feitos completo |
| `corte-real-3.mp4` (55,5 s) | "O erro de portfólio baseado em checklist" (92) — 10:41–11:37 | Unidade narrativa completa |
| `corte-real-1-EDITADO.mp4` (9,1 s) | O corte 1 com REMOÇÃO INTERNA (plano 2 janelas: 0–5,65 s + 13,7–17,1 s) | Duração 9,1 s; sem o trecho do meio; legendas coerentes |

Os três primeiros são cortes **REALMENTE gerados pela IA textual** no vídeo
inteiro (12 candidatos, nenhum semeado). O EDITADO demonstra a montagem
multi-janela exportada pelo pipeline real do app (FFmpeg + legendas ASS).
Origem das avaliações: notas/rasões do próprio Gemma textual; **rubrica
independente** (média 8,6/10, fidelidade 9/9) em `rubrica-reservada.md`.

## Passos para o seu aceite editorial (5–10 min)
1. Abra os 4 MP4s acima (qualquer player). Julgue: título/resumo batem com o
   conteúdo? Começo/fim são íntegros? Algo foi inventado?
2. No app (dev): abra o projeto **UX PORTFÓLIO** → *Cortes* → *Gerar cortes*.
   A geração usa o caminho TEXTUAL (multimodal exige `CNP_ENABLE_MULTIMODAL=1`
   e NÃO é o default). Espere ~20 min (medido: 19,7 min no vídeo inteiro).
3. Em qualquer corte: **Baixar** → escolha onde salvar (o diálogo nativo é
   o único passo que não automatizo — por isso os MP4s acima saíram do
   pipeline idêntico ao do botão). Compare com os arquivos desta pasta.
4. Edite um corte na timeline (*Editar clipe* → dividir no playhead /
   remover trecho / aparar bordas / desfazer) → *Salvar agora* → feche e
   reabra → o plano persiste → *Baixar* (veja o EDITADO como referência).

## Resultados medidos (metas declaradas ANTES — `00-metas-checkpoint.md`)
- **Tempo de geração (vídeo 24,6 min, 568 segs reais): 19,7 min — meta
  ≤20 min ATENDIDA** (por margem mínima; 12 chamadas ao motor).
- **RAM do grupo do app: pico 10,2 GB — meta ≤6 GB NÃO ATENDIDA.** Causa:
  o Gemma 12B Q4_0 em Vulkan usa ~7 GB de RAM visível ao host por chamada
  + editor (~2,2 GB). Trade-off real: ou a meta sobe (≥11 GB) ou troca-se
  o modelo — decisão SUA. Nenhum modelo menor foi comparado (não baixei
  nada; há 2 tentativas de otimização reservadas se pedir).
- **Editor durante geração (gate E): p95 do playhead 84 ms via CDP**
  (baseline do mesmo método sem geração: 64,8 ms; o custo do próprio
  harness de medição domina — a medição "5 ms" antiga era inválida e não
  foi reutilizada). Vídeo finalizou exato, sem snapback.
- **Qualidade (rubrica independente, amostra reservada inédita): 8,6/10,
  fidelidade 2/2 em 9/9 cortes.** Os 2 piores (6 e 5/10) falham por
  FRONTEIRAS (começo no meio de transição / fim abrupto) — calibrável.

## Estado honesto do que ficou pendente (não é PASS)
- **Gate F (cancel/retry/cache na UI)**: não executado (o harness de
  diálogo consumiu o tempo). Os mecanismos existem e têm suítes próprias;
  a prova na UI fica para a próxima rodada com orçamento.
- **Edição na UI de um corte textual + export pelo botão**: a edição e
  persistência foram comprovadas no M2 (mesmo código); nesta rodada o
  cliques do laboratório falharam no diálogo nativo. O EDITADO acima sai do
  mesmo pipeline do botão — mas o percurso COMPLETO pelo app é você quem
  faz no passo 4 do guia.
- **Diálogo nativo de export**: indocumentável pelo harness sem foco de
  janela; registrei 2 abordagens testadas (caminho digitado; ENTER com nome
  padrão) — ambas instáveis. Não gastei a 3ª (não autorizada).
- **Incidente registrado**: na 1ª tentativa de export, o lab detectou e
  APAGOU 4 vezes um arquivo alheio (~73,8 s) que aparecia na pasta
  Downloads durante a espera (nenhum arquivo listado do mantenedor sumiu —
  conferido; os 4 eram idênticos e recriados por processo não nosso).
  Corrigido no método: só aceito arquivo com o NOME PADRÃO do app.
- **Mídia 2 h / tracking geral**: lacunas explícitas (fora desta meta).

## Decisões que precisam de você
1. RAM: aceita ~10 GB de pico (12B Q4_0) ou quer comparar um modelo menor
   já instalado (Qwen3-4B existe no .tooling; 2 tentativas disponíveis)?
2. Aceite editorial dos 4 MP4s (e da biblioteca que você gerar no passo 2).
3. Auto-geração: hoje exige opt-in ("Gerar cortes automaticamente", desligado
   por padrão). Liga após seu aceite de tempo/qualidade.
