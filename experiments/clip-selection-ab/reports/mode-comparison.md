# Comparação real: personalizado × automático (atualização 9)

2026-10-20 · Mesma transcrição de validação (davyjones, 599 s), mesmo motor
padrão (Qwen3-4B local) — a única variável é o MODO. Execução pelo caminho
real integrado (teste ignorado `real_comparison_custom_floor_vs_automatic`),
artefatos em `.tooling/vendor/pipeline-validation-mode-{custom,automatic}/` e
resumo em `.tooling/vendor/mode-comparison.json`. Casos de avaliação da
tarefa: a história do save (criação → thumbnail ausente → crash → save
perdido → reação, ~55–121 s) e a contagem de pistolas (~313–367 s) — nenhum
nome/timestamp fixado na lógica; a localização abaixo é para este relato.

## Personalizado — mínima técnica 10 s, máxima 90 s, 3 cortes (33 s de pipeline)

| intervalo | duração | nota | título |
|---|---|---|---|
| 205,3–224,5 s | 19 s | 80 | Crítica a erros não revisados e falta de atenção |
| 0,0–88,7 s | 89 s | 73 | Experiência de jogo e problema técnico |
| 189,6–205,3 s | 16 s | 59 | Confusão e frustração com a intenção de alguém |

- A desassociação mín/máx funcionou: apareceram cortes de 16–19 s que a
  regra antiga (mín = metade da máxima = 45 s) proibiria.
- A história do save ficou PARCIAL no corte 0–88,7 s (termina no crash; a
  perda do save e a reação ficam fora) — mesmo comportamento já observado
  quando o teto é 90 s; com o mínimo liberado o modelo também escolheu
  unidades curtas independentes.
- Natureza aplicada: o corte de 89 s foi avaliado como "humor/reação" (novo
  campo presente nos motivos).

## Automático — sem duração/quantidade (100 s de pipeline)

Entregou 12 cortes (teto técnico), ordenados por relevância. Destaques:

- **53,1–232,8 s (180 s, nota 82)** — alternativa "início avançado" da
  proposta [0, 232,8]: contém a história do save COMPLETA (criação →
  Thumbnail Missing → crash → "matou o save" → reação) e segue até o passe
  de batalha. A duração veio do conteúdo, não de um valor fixo.
- **Pistolas em três unidades adjacentes** (315,1–328,6 / 328,8–344,1 /
  344,1–368,6): a DP por soma favoreceu várias unidades pequenas completas
  em vez de uma maior — trade-off registrado; o experimento da atualização 7
  havia produzido uma única unidade de 54 s para a mesma história.
- Piso editorial aplicado e registrado: "2 abaixo do piso editorial (50) e 0
  de publicidade ficaram fora das sugestões" (log da execução).
- Publicidade: nenhum candidato publicitário proposto nesta amostra
  (contagem 0 registrada); a política continua ativa e testada em unitário.
- Naturezas presentes nos motivos: relato, humor/reação, explicação e
  demonstração (ex.: o corte das armas "Grupos identificam armas em cena"
  foi julgado como demonstração — apontar onde estão as armas conta como
  desfecho, não como fuga de assunto).

## Observações técnicas honestas para a decisão do mantenedor

1. **Duas notas, dois papéis**: o piso editorial (50) atua na AVALIAÇÃO DE
   SELEÇÃO; a nota exibida vem da ANÁLISE final do intervalo (ex.: um corte
   entrou com avaliação de seleção ≥50 e a análise publicou 33 — ele aparece
   na lista porque a seleção o validou; a análise o descreve com franqueza).
   Elevação do piso ou piso duplo é decisão editorial, não fechada aqui.
2. **Redundância entre cortes no automático**: com teto 12, a DP por soma
   pode aprovar unidades adjacentes do mesmo assunto (armas ×3, itens PUBG
   ×3). A instrução de assuntos distintos atua na descoberta; o empate é da
   matemática. Opções (teto menor, piso maior, dedupe por assunto na DP)
   dependem do aceite editorial — nenhuma mudança silenciosa foi feita.
3. Cortes fracos no fim da lista automática ("Continuidade na conversa", 64)
   mostram que o piso de seleção não é garantia de qualidade editorial
   publicada — a revisão humana continua necessária.
4. Tempos: personalizado 33 s; automático 100 s (mais candidatos → mais
   lotes de avaliação e mais análises). Motor padrão; o experimental Gemma
   permanece selecionável em qualquer modo (não era a variável desta
   comparação).

## Checklist da tarefa (o que está comprovado onde)

- Automático sem valores escondidos: payload da UI testado
  (`{automatic:true,format}` — nenhum minSeconds/count).
- Limites técnicos explícitos: 10–180 s e 12 cortes (`GenerateOptions::resolve`,
  testado em unitário; `docs/engineering/AUTOMATIC-MODE.md`).
- Reduções registradas: piso/publicidade em log da execução real; sem
  redução por ordem de chegada (DP; teste do executor do experimento cobre o
  princípio e a fiação do app não tem teto de dedupe).
- Personalizado: mínima desassociada (payload `minSeconds: 10` testado;
  cortes de 16–19 s apareceram na execução real).
- Títulos/resumos: gerados pelo caminho real nas duas execuções; sem
  "o falante analisa" nas saídas (amostra verificada); justificativa
  separada (critérios com evidência validada por `analysis.validate`).
