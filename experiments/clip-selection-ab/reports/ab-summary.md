# Resumo A/B — seleção de cortes (avaliação do mantenedor)

Transcrição: projeto "davyjones" (cópia), 322 falas, 599,1 s. Constantes: 3 cortes, 15–90 s, 9:16, Qwen3-4B temp=0 (flag --seed 42 passada como no app; logs registram sampler seed 4294967295 — binário aparenta ignorar a flag; sem efeito sobre a comparação A/B).

## Caso controlado (determinístico, sem LLM)

| Cenário | Guloso (atual) | DP (ótimo por soma) |
|---|---|---|
| S1-armadilha-central | 1 corte(s), soma 90 | 2 corte(s), soma 150 |
| S2-duplicatas-de-janela | 2 corte(s), soma 160 | 3 corte(s), soma 220 |
| S3-controle-sem-conflito | 3 corte(s), soma 234 | 3 corte(s), soma 234 |

S1: o candidato central de nota 90 bloqueia dois medianos (75) compatíveis entre si — o atual entrega 1 de 2. S3 (sem conflito): estratégias coincidem.

## Execução real (12 candidatos em 2 janelas; coleta 86 s)

| Estratégia | Cortes | Soma notas | Repetição máx (bigrama) | Fronteiras | Tempo |
|---|---|---|---|---|---|
| greedy | 3/3 | 250 | 0.017 | válidas | 0.0 s |
| dp | 3/3 | 250 | 0.017 | válidas | 0.0 s |
| joint | 3/3 | 250 | 0.017 | válidas | 19.9 s |

Convergência: A e B escolheram OS MESMOS três intervalos (nesta transcrição, greedy == dp == joint).

### Cortes escolhidos (comuns a A e B neste caso)

**0.0s – 88.7s** (nota 85)
- Texto: “Bom, galera, antes da gente entrar no GTA, eu queria só trazer uma observação aqui, porque assim... Você, Fênix, se jogou bastante Battlefield 6, você tá sabendo o que tá rolando agora? O quê? Não. Eu mandei pra você, né? O que acontece? Vem o novo passo de batalha aí, e vocês sabem como é que a EA funciona, né? Vocês estão familiarizados aí. Recentemente, a EA deve odiar quando eu jogo os jogos dela, porque... Acho que eles devem falar assim, não fala do meu jogo, por favor. Exatamente. Ué, ninguém manda fazer mer…”

**400.7s – 455.8s** (nota 85)
- Texto: “Que porra é essa? Nem revisar o bagulho. Secute, tepap. Esse é o tipo de AKP mal utilizada que ninguém gosta. Sim. Quando é bem utilizada, como disse, gosta. E claro que eles estão vendendo, né? Lógico. Estão vendendo isso aí. Tem isso ainda, né? Você gasta o seu dinheiro para comprar a skin bugada, não é, mano? Essas skins aí, eles podiam manter no jogo. A Valve já fez isso, cara, que é bem interessante. Teve uma skin que a galera comprou uma estátua e aí ganhou a skin. E aí essa skin, quando ela chegou, porque vo…”

**483.3s – 505.7s** (nota 80)
- Texto: “Mas em qualquer momento, né... Então tem lá, quanto é que tá valendo? Aquele da primeira temporada, o primeiro loot e o Sobretudão. A galera se botou na Makita aí, viu? É, não, o computador, coitado. O computador tá... O PC vai voar igual o carro dela. É, galera, hoje a bancada é com cinco. Nós quatro e a Makita. E o bagulho. Porque ele tá bem pior. Uma hora atrás, ele não tava gritando tanto. Ele tá piorando, é.”

### Referência de produção (app, pipeline atual + refine de cenas)

**16.4s – 105.2s** (nota 79) — Crítica a um jogo com problemas técnicos
**400.7s – 455.8s** (nota 78) — Crítica a práticas de venda de skins em jogos
**483.3s – 528.5s** (nota 69) — Problemas técnicos e barulho constante

Dois dos três inícios (400,7 s e 483,3 s) coincidem com a produção; a diferença no primeiro (0,0 vs 16,4 / 88,7 vs 105,2) e o fim do terceiro (505,7 vs 528,5) vêm do refine de fronteiras por cena e de opções possivelmente distintas na geração original — fora da etapa comparada.

### Descartes (M5)

- greedy: 9 descartes — não avaliado×9
- joint: 2 dedupes (duplicatas de janela) + 7 candidatos apresentados e não escolhidos pelo rerank (sem motivo individual — limitação registrada)

### Diversidade (M6)

- greedy: gap mínimo entre inícios 82.56 s; regiões de 60 s cobertas [0, 6, 8]
- dp: gap mínimo entre inícios 82.56 s; regiões de 60 s cobertas [0, 6, 8]
- joint: gap mínimo entre inícios 82.56 s; regiões de 60 s cobertas [0, 6, 8]

---
Notas de rodapé: (1) a coluna "Soma notas" do joint usa as notas RECALIBRADAS pelo rerank (que sobrescrevem `score`), enquanto greedy/dp usam as notas da primeira passada — a igualdade 250=250 é coincidência do modelo ter devolvido os mesmos valores; M2 é descritiva, não prova de qualidade. (2) A análise por critérios Gancho/Desenvolvimento/Fechamento (semantic) é pós-seleção e idêntica para A e B no app — não executada aqui por não ser diferenciadora.
