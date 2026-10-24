# G6 — Proposta de IA local para o CutNicePro (2026-10-23, goal-recuperacao-autoclip)

Fundamentação: matriz 4B×12B (`g5-matriz-comparacao.md`), estudo AutoClip
(`g4-estudo-autoclip.md`), baseline do vídeo inteiro (goal-cortes-texto:
12B 19,7 min, RAM grupo 10,2 GB), rubrica 12B 8,6/10 fidelidade 9/9.
Decisões editoriais finais pertencem ao mantenedor; isto é proposta com
evidência.

## Componentes por função (recomendado)

| Função | Componente | Por quê (evidência) |
|---|---|---|
| ASR | **Whisper Turbo local (manter)** | vigente, com palavras por tempo — insumo do refine de fronteiras; AutoClip usa faster-whisper equivalente |
| Seleção/análise | **Gemma 4 12B QAT (manter default)** | rubrica 8,6/10 e fidelidade 9/9 na amostra reservada; títulos específicos. Qwen 4B é 3,1× mais rápido mas títulos genéricos e 12 candidatos redundantes — alternativa para "modo rápido" futuro, decisão do mantenedor |
| Transporte do motor | **Reuso via llama-server SEM mmproj** (melhoria nº 3) | a recarga por chamada domina o custo (12 recargas ≈ 2–3 min do total de 19,7); RAM de pico NÃO difere entre modelos → o ganho está no reaproveitamento, não na troca de modelo. Já autorizado pelo objetivo se medido |
| Fronteiras | **Refine determinístico frase+pausa (melhoria nº 2)** | maior déficit comprovado contra os dois AutoClips; insumos já existem no app (words do Whisper + silencedetect). Fins abruptos visíveis na rubrica 12B (2 cortes 5–6/10) |
| Payload | **Formato compacto id\|tempo\|texto na seleção (melhoria nº 1)** | ~40% menos tokens (zhou, clip_finder.py); menos contexto por chamada = menos tempo |
| Visão/tracking | **FORA do caminho padrão (decisão mantenedor mantida)** | multimodal cancelado por custo/RAM; YuNet ONNX (MIT) fica como estudo opt-in futuro, nunca default; "preencher o quadro ≠ detectar rosto" |

## Manter / Adaptar / Rejeitar do AutoClip
- **Manter (já temos e comprovamos)**: âncora de citações (mais forte contra
  invenção que o score solto deles), jobs/cancel/gate (paridade funcional,
  gate F provado), falha honesta, biblioteca com isolamento.
- **Adaptar**: as três melhorias acima (fronteiras, payload, reuso).
- **Rejeitar**: cloud-first (zhou), diarização↔track (jazi) e qualquer
  tracker por padrão; troca de stack/ASR; fine-tuning.

## Implementação incremental autorizada nesta meta (ordem)
1. **Refine de fronteiras** (valor editorial imediato; módulo Rust puro +
   testes; hook no fim do prepare em generation::run, depois de
   scene_regions; usa words + pauses já computadas).
2. **Reuso do motor** (server sem mmproj no caminho textual; A/B medido na
   janela reservada antes de adotar; guarda CNP_TEXT_SERVER=1 opt-in).
3. **Payload compacto** (mudar o PROMPT/payload da seleção; A/B na janela
   reservada; sem mudar contratos de saída).

## Custo/qualidade esperado (declarado ANTES, medir depois)
- Fronteiras: rubrica de fechamento melhora nos casos "fim abrupto" sem
  mudar cobertura; sem custo de inferência extra (código puro).
- Reuso: −2 a −3 min no vídeo inteiro (estimativa por 12 recargas medidas
  no baseline); RAM pico similar (server mantém o modelo vivo ~7 GB VRAM).
- Payload: −30–40% tokens de entrada na seleção → menos tempo na etapa de
  descoberta.

## Tratamento de falhas
- Refine: nenhuma fronteira válida → mantém a do modelo (nunca perde clipe).
- Server: falha de subida → queda automática para llama-completion por
  chamada (caminho atual), com registro do motivo.
- Payload: resposta fora do formato → parse atual rejeita e o pipeline
  segue o fluxo de janela/tentativa existente.


## Implementação executada nesta meta (nº 2 — refine de fronteiras) — 2026-10-23
- `app/src-tauri/src/clips/borders.rs` (NOVO): `refine_boundaries` puro —
  frases por words do Whisper (pontuação OU pausa ≥0,55 s sem pontuação),
  início sobe p/ começo da frase, fim desce p/ fim de frase interna,
  pergunta final do entrevistador devolvida ao próximo tópico (resposta
  ≤12 s; nunca remove >40% do clipe), snap a pausa real ≤1,2 s,
  limites duros (mídia/vizinhos/mínimo da Options). Sem words em
  NENHUM segmento → janela intacta (conservador; nunca perde clipe).
  6 testes unitários cobrindo cada regra + caso conservador.
- Hook em `generation.rs` (depois de `scene_regions::refine`, antes do
  multimodal/id): clipes ordenados, refine com prev/next, IDs
  recalculados no laço seguinte. Pausas reais reaproveitadas quando o
  modo multimodal as computou (`pauses` já existia); textual puro usa
  apenas words (pausas sintáticas por gap de palavra).
- Adaptado de: zhouxiaoka `boundaries.py`/`quality.py` + artbyjazi
  `boundaries.py` (MIT; registro em OPEN-SOURCE-ENGINE-RESEARCH §2b).
- Validação: Rust 159/159 (6 novos), TS 227/227, tsc OK, exe
  target-upd20 reconstruído. Prova A/B de qualidade editorial fica para
  o lab de aceite (G8): gerar com refine e aplicar rubrica na amostra
  reservada (compare com 8,6/10 do 12B sem refine).
- Nº 1 (payload compacto) e nº 3 (reuso server sem mmproj): PROPOSTA
  apenas — exigem A/B medido próprio e não bloqueiam a recuperação.
