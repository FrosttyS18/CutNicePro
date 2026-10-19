# Whisper: referência e âncoras confirmadas — 2026-10-19

Estado: PARTIAL para qualidade ASR. Comparação real, sem substituir dados do projeto.

Amostra: primeiros 86 s da mídia Davy Jones já gerenciada pelo app, extraída com FFmpeg em PCM mono/16 kHz. Dois modelos nativos, uma execução de cada vez no CUDA: Large v3 Turbo e Large v3. Mesmos pesos e alinhamento DTW da 03K. O texto Opus fornecido pelo mantenedor é referência imperfeita, sem timestamps. Ele próprio contém variantes como “Pois”, “IEFC” e “essas graças”; portanto não representa um conjunto ouro nem autoriza alegação de 98% de precisão.

## Método e resultados

`tools/asr/evaluate_reference.py`: minúsculas, remoção de acentos e pontuação, distância de Levenshtein por palavra contra o prefixo da referência com melhor alinhamento. O prefixo escolhido tem 308 palavras. Esta distância inclui divergências da própria referência, hesitações e escolhas de grafia; **não é a taxa real de erro contra revisão humana**.

| Modelo | Variante | Distância/palavras de referência | Abertura humana exata | EA FC | essa desgraça |
|---|---|---:|---|---|---|
| Turbo | atual, sem prompt | 65/308 | não | sim | não |
| Turbo | contexto genérico, 224 tokens | 53/308 | não | não | não |
| Turbo | vocabulário do tema, 224 tokens | 61/308 | não | sim | não |
| Large | atual, sem prompt | 70/308 | não | sim | não |
| Large | contexto genérico, 224 tokens | 68/308 | não | sim | não |
| Large | vocabulário do tema, 224 tokens | 73/308 | não | sim | não |

As âncoras vêm das correções do mantenedor, não da referência automática. “Abertura exata” exige a sequência “Bom, galera, antes da gente entrar no GTA”; Turbo ainda insere “isso”. O nome GTA aparece corretamente em resultados Turbo, mas a frase inteira falha. A âncora de palavrão verifica “essa desgraça”. Não foi recuperada. A lista de vocabulário já fornece nomes do tema ao motor: não é avaliação cega de generalização.

O contexto genérico aproximou o Turbo do texto Opus, mas perdeu EA FC; o vocabulário não resolveu as correções humanas. **Nenhuma dessas variantes foi promovida ao padrão do aplicativo.** Turbo permanece o padrão; cada transcrição carrega somente o Whisper selecionado, sob o gate global de processamento. Não há substituições globais de IFC/EA FC, nem inserção de falas a partir da referência.

## Falha encontrada e recuperação delimitada

A primeira execução Large com vocabulário acentuado terminou no motor, mas gerou bytes ACP em um JSON esperado em UTF-8, inclusive em um token derivado de “Fênix”. Resultado marcado FAIL e preservado. Foi repetida somente essa configuração, com vocabulário ASCII, sem sobrescrever o resultado inválido e sem repetir os cinco aprovados. Seis saídas finais válidas; sete invocações no total. Esse vocabulário experimental não foi exposto como recurso do app.

Tempos de parede registrados: 32,580/25,758/10,253 s para Turbo e 14,858/15,648/12,301 s para Large, na ordem da tabela. As primeiras medições concorreram com a análise textual em CPU; caches/partida não foram controlados. Não usar esses tempos para concluir qual modelo é mais rápido.

O contrato Rust `refinement_results_preserve_real_words_and_later_times` leu as seis saídas reais, validou os segmentos contra 86 s, confirmou mais de 200 palavras alinhadas e palavras após 80 s em cada saída, sem caracteres de substituição. Isso valida contrato e tempos; não aprova precisão da fala.

Artefatos locais ignorados: `.tooling/vendor/asr-refinement/{comparison.json,*.json,*.log,first-hook-86s.wav}`. Resumo permanente: `docs/reports/evidence/2026-10-19-source-clips-validation.json`. Fonte técnica: [CLI oficial do whisper.cpp](https://github.com/ggml-org/whisper.cpp/tree/master/examples/cli).
