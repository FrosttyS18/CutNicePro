# Avaliação editorial dos 12 candidatos — davyjones

**Proveniência e natureza:** avaliação produzida por modelo (GLM-5.3, o agente),
lendo os textos reais transcritos de cada candidato com contexto (dossiê:
`candidates-full.md`). É AVALIAÇÃO, não verdade humana; todas as afirmações
têm citação literal para auditoria do mantenedor. Zero chamadas de inferência
adicionais (a perspectiva do motor local vem do rerank reutilizado de
`real-joint.json`, teto do orçamento respeitado: 0 novas chamadas).

## Escolhidos (A = B = C nestes dados)

### C1 [0,0–88,7s] nota 85 — FORTE
- Abertura compreensível: sim — “Bom, galera, antes da gente entrar no GTA, eu
  queria só trazer uma observação” + pergunta “você tá sabendo o que tá
  rolando agora?” (gancho clássico de curiosity gap).
- Contexto necessário: sim — apresenta o jogo (“Eu joguei o IFC, que é
  medonho”), a live e o preço (“400 reais, a gente comprou o lançamento”).
- Desenvolvimento/conclusão: desenvolvimento forte (sequência “loads
  infinitos” → “Thumbnail Missing” na barba), mas a conclusão fica CORTADA:
  o corte termina em “O jogo crashou no Playstation” e o desfecho real —
  “matou o save, a gente teve que começar tudo de novo” (fala 40) — está
  FORA do corte. Corte bom com final antecipado.
- Fidelidade: total (todas as falas são literais).

### C8 [400,7–455,8s] nota 85 — FORTE (o melhor corte do pool)
- Arco completo: problema (“Você gasta o seu dinheiro para comprar a skin
  bugada”) → exemplo comparativo com desfecho (história da Valve: estátua →
  skin ruim → “fez outra skin” → “a skin antiga hoje vale 3 mil reais” →
  “Caralho”). Autocontido, engraçado, concluído.
- Limitação herdada da coleta: começa em “Que porra é essa?” cujo setup
  visual (“olha as armas juntadinhas ali, ó”, falas 219–220) está em C7,
  descartado. Funciona sem o setup, mas perderia pouco começando em C7.
- Fidelidade: total.

### C11 [483,3–505,7s] nota 80 — FRACO (o elo fraco dos escolhidos)
- Mistura de assuntos: começa em PUBG (“o primeiro loot e o Sobretudão”),
  salta para o PC (“o computador tá… / O PC vai voar igual o carro dela /
  a bancada é com cinco… e a Makita”) e termina em “Ele tá piorando, é” —
  sobre o barulho do PC. Dois assuntos, nenhum concluído; a continuação
  natural (“Eu tô em live aqui com esse PC desde duas horas”) ficou em C12.
- Abertura depende do corte anterior; como clipe vertical isolado, começa
  no meio (“Mas em qualquer momento, né…”).
- Nota inicial 80 é otimista para o conteúdo; a razão do rerank
  (“desempenho do PC e competição entre jogadores”) reenquadrou o corte
  como sendo do PC — coerência possível, mas confirma o assunto duplo.
- Veredito: mantido por nota, não por mérito editorial isolado.

## Descartados relevantes (com motivo editorial independente)

- **C12 [506,1–539,2s] nota 75 — descarte CORRETO por conteúdo**: termina
  DENTRO do comercial (“Bom, galera, e agradecer mais uma vez o Logitech G”).
  Clipe que acaba em merch é editorialmente ruim independentemente da nota.
- **C7 [384,8–400,7s] nota 75**: abertura fraca (“Rapaz, o PC, ele tá…”),
  mas é a PONTE que daria setup a C8; alternativa defensável a C11 seria
  C7+C8 encostados (384,8–455,8 = 71 s ≤ 90 s) — nenhum candidato cobre o
  intervalo inteiro (o coletor gerou os dois separados).
- **C2 [200,4–216,6s] nota 75**: começa numa conclusão sem contexto (“Das
  duas, uma.”); o momento forte anterior (meme “Group therapy” → “É o grupo
  do papi”, falas 93–100) está FORA de todos os candidatos.
- **C3/C4/C5/C6 (70/65/60/55)**: janelas deslizantes do MESMO trecho
  (falas ~101–128: nuca do personagem, “Tourette”, “Vai, Corinthians”) —
  piadas internas, conteúdo raso; redundantes entre si por construção
  (geradas pela sobreposição de janelas). A política de equivalência por
  cobertura (nova) não as remove (coberturas diferentes — conservadora
  correta); a dedupe 50% antiga removia só C4/C6 e foi RETIRADA como
  recomendação (contraprova R2).
- **C9 [455,9–471,5s] nota 65**: continuação fragmentada de C8 (“Pô, eu
  tenho… / Pelo erro? / É que nem o…”), sem arco.
- **C10 [465,8–483,1s] nota 70**: fecho raso do assunto PUBG (“achava que
  tinha morrido / Não, ele tá bem ainda”).

## Momentos relevantes FORA do conjunto de candidatos (limitação do coletor)

Lendo a transcrição inteira (tabela de cobertura em `candidates-full.md`):

1. **Falas 39–63 (~89–131 s)** — o desfecho da história de C1: “matou o
   save, a gente teve que começar tudo de novo… É load, load, load…
   apagou o save”. Um candidato cobrindo o desfecho completaria C1.
2. **Falas 63–100 (~130–200 s)** — Battle Pass feito com IA + o erro de
   texto “Group therapy” → “É o grupo do papi”: momento autocontido com
   descoberta e reação; nenhum candidato o cobre (C2 começa na fala 101).
3. **Falas 129–209 (~249–382 s)** — a skin “Secute” (texto invertido),
   a discussão “fizeram de propósito pra virar meme?” e o personagem com
   5–6 pistolas no peito (“Um cara preparado para a guerra”): o subtrecho
   das pistolas (falas 163–209, ~76,6 s de span temporal) é humor
   autocontido — ZERO candidatos cobrem 129–209.
4. Falas 294–321 — comercial Logitech: exclusão correta.

**Registro separado (exigido):** um finalizador — guloso, DP ou rerank —
não recupera candidatos que o coletor nunca gerou. O coletor produziu
6 candidatos/janela; os melhores momentos da janela 1 (save/Group therapy)
e da janela 2 (Secute/pistolas) não estão entre eles. O gargalo editorial
desta transcrição está majoritariamente na COLETA, não na finalização.

## Separação dos efeitos (notas iniciais × avaliação editorial)

- **Efeito das notas iniciais (A/B):** dominante. A ordenou 85/85/80
  (C1, C8, C11) e a DP nada mudou (sem conflito custoso no pool real).
- **Efeito da avaliação editorial (C/rerank):** nulo sobre a ESCOLHA
  (mesmos intervalos), não nulo sobre TRANSPARÊNCIA (razões por escolha e
  notas recalibradas) — e a razão do C11 evidencia o assunto duplo.
- **Convergência A=B=C aqui NÃO prova que a finalização é irrelevante em
  geral** (o controlado S1/S2 já demonstrou perdas combinatórias quando há
  conflito); prova apenas que NESTE pool de 12 a combinatória não era o
  gargalo — o gargalo era o pool (coleta) e a nota do C11.

## Veredito editorial por corte (resumo)

| Corte | Veredito | Base |
|---|---|---|
| C1 | bom, final antecipado | desfecho “matou o save” fora do corte |
| C8 | o melhor do pool | arco completo com punchline |
| C11 | fraco | dois assuntos, sem conclusão |
| C12 | descarte correto | termina dentro do comercial |
| C2–C6 | descartes justos | raso/sem contexto/redundantes entre si |
| C7 | alternativa defensável | ponte para C8; fraco isolado |
| C9/C10 | descartes justos | fragmentado/raso |
