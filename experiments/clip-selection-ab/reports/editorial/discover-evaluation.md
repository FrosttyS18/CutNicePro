# Avaliação editorial — descoberta por janelas (retomada da atualização 6)

Data: 2026-10-20 · Transcrição: 322 falas, 599,1 s (davyjones) · limites 15–90 s, 3 cortes.
Método: leitura integral dos cortes escolhidos (dossiê: `discover-dossier.md`),
localização da sequência de aceite POR CONTEÚDO (nenhum nome/palavra/timestamp
do episódio fixado em lógica). Nota de modelo não é prova; cada critério foi
verificado no texto real do corte.

## Caso de aceite — sequência real do episódio

Localizada na transcrição pelos próprios fatos narrados:

| Etapa | Conteúdo (citação da transcrição) | Onde |
|---|---|---|
| criação do personagem | "a gente entrou mal e começou a fazer o personagem… era botar barba" | ~55–62 s |
| thumbnail ausente | "dois quadradinhos… escrito **Thumbnail Missing**" | ~64–68 s |
| jogo trava | "fomos passar pra botar roupa… O jogo **crashou** no Playstation" | ~85–88 s |
| save perdido | "**matou o save**, a gente teve que começar tudo de novo" | ~91–93 s |
| reação/consequência | "Quando faltou a thumb na barba, já estava ruim… Mas daí crachou… **Aí apagou o save**" | ~111–121 s |

O arco completo (criação → desfecho com reação) ocupa ≈ 55–121 s (~66 s) — cabe
integro em um corte de até 90 s. O sistema IDEAL propõe uma versão narrativa
completa dessa história, não só o início ou o fim do bloco.

## Resultado por perfil

### A — Qwen3-4B instalado, non-thinking (paridade com o app) — FALHA EDITORIAL
Escolhidos: 0–36,4 s · 311–329,7 s · 493,9–583,9 s (todos nota 75).
- **Arco-alvo: NÃO entregue.** Nenhum corte contém a história completa. O único
  candidato com os 3 fatos (107,2–123,1 s) é o *recap* de 16 s — resumo que
  pressupõe contexto que o corte não carrega ("a thumb na barba" sem mostrar
  criação/crash). Nota dele: 60–65; perdeu para três 75.
- **Publicidade selecionada indevidamente:** A3 (493,9–583,9 s) contém a
  leitura de patrocínio com CTA e cupom ("entrem aí no site… cupom Flow15…").
  A própria razão da avaliação do perfil diz "pode ser considerado uma
  publicidade em vez de uma história" — e ainda assim nota 75, o topo da
  distribuição (55–75, quatro 75). O avaliador do perfil A quase não
  discrimina (amplitude 20 pontos) e premiou o comercial.
- Contexto isolado: A1 abre com "antes da gente entrar no GTA…" — fala de
  introdução de live, não gancho de clipe.
- Título fiel possível para A3: "Promoção da Logitech G" — ou seja, o título
  revela que o corte é anúncio.

### C — Qwen3-4B-Instruct-2507 — BOM, MAS TRUNCA A HISTÓRIA
Escolhidos: 18,1–70,5 s (95) · 129,7–199,2 s (90) · 261,2–301,5 s (85).
- **Arco-alvo: PARCIAL.** C1 cobre criação + thumbnail e termina em "Aí,
  sério?" — frase completa, história INCONCLUSA: o crash (85 s) e a perda do
  save (91 s), que são o desfecho, ficam fora. Caso literal do critério "não
  confundir frase terminada com história concluída". Nota 95 = a maior do
  experimento inteiro → nota alta ≠ história completa.
- Nenhum candidato de C cobriu o arco completo (o segundo candidato da região,
  70,9–90,5 s, pega o crash mas perde o save e a reação).
- Sem publicidade nos escolhidos; contextos de abertura bons ("Recentemente,
  a EA deve odiar quando eu jogo os jogos dela…" é gancho válido frio).
- Repetição: nenhum overlap entre escolhidos (DP). C2/C3 são unidades
  autônomas legítimas (erro "Group therapy"; skin "Secute").
- Títulos fiéis possíveis: "Jogo lançou com 'Thumbnail Missing' na criação de
  personagem" (fiel ao que C1 contém — e o título evidencia o que FALTA:
  crash/save não estão nele).

### D — Gemma-4-12B-IT QAT Q4_0 (thinking desativado) — ENTREGA O CASO DE ACEITE
Escolhidos: 33,5–120,9 s (85) · 129,7–219,6 s (88) · 313,3–367,3 s (92).
- **Arco-alvo: COMPLETO em D1 (33,5–120,9 s, 87,4 s).** Abre em framing
  autônomo ("A gente fez uma live aqui, foi um transtorno, terrível"), contém
  criação → Thumbnail Missing → crash no Playstation → "matou o save" → recap
  da reação fechando em "Aí apagou o save". É versão narrativa válida dentro
  da duração, não conservação de início/fim de bloco longo.
- **A avaliação separou as versões:** D propôs DUAS versões do arco. A que
  termina em 116,6 s (sem o recap final) recebeu menos (65) que a que termina
  em 120,9 s com a reação (85) — o procedimento do próprio perfil premiou a
  história concluída. D1 é alternativa 'início avançado' (preserva o desfecho)
  — comportamento projetado: proposta original fora da faixa, nota original
  registrada como proveniência, avaliação própria por cima.
- Sem publicidade nos escolhidos; D2 (passe de batalha/IA) e D3 (5 pistolas →
  "Que loucura") são unidades completas com abertura e desfecho próprios;
  D3 estende a mesma região de A2 MAS inclui o payoff que falta a A2.
- Títulos fiéis derivados do conteúdo: "Criamos o personagem, o jogo crashou
  e apagou o save" (D1); "Skin de 'Group Therapy' virou 'Therapy' no passe de
  batalha" (D2); "O boneco tem 5 pistolas: contagem completa" (D3).

### B — mesmo checkpoint do instalado, thinking natural — BLOQUEADO NA PROVA CURTA
Não executou o episódio (política da retomada: perfil que falha na prova curta
não roda). Evidência: com amostragem documentada (temp 0,6 / top_p 0,95 /
top_k 20), o raciocínio não terminou em 1.200 nem em 3.000 tokens para APENAS
8 falas — enumeração não convergente ("ID 0" re-examinado 15×). Limite de
raciocínio registrado como tal; não é falha do checkpoint em non-thinking.

## Comparação resumida

| Critério | A (instalado) | C (2507) | D (Gemma 4 12B) |
|---|---|---|---|
| Arco completo (criação→save→reação) | não | truncado (sem crash/save) | **sim (87,4 s)** |
| Abertura compreensível isolada | fraca (A1) | boa | **boa** |
| Desfecho presente no intervalo | não (A1/A2); anúncio (A3) | parcial (C1) | **sim nos 3** |
| Publicidade selecionada | **sim (cupom Flow15)** | não | não |
| Discriminação de notas (amplitude) | 20 (55–75) | 45 (50–95) | 37 (55–92) |
| Nota máxima vs qualidade editorial | 75 para anúncio | 95 para história truncada | 92 para unidade completa; 85 para o arco |
| Chamadas LLM (prova+descoberta+avaliação) | 1+3+3 | 1+3+2 | 1+2+2 |
| Tempo total de inferência | 212,6 s | 213,7 s | 470,6 s |
| Status | RESULTADO_COMPLETO (execução) | RESULTADO_COMPLETO (execução) | RESULTADO_COMPLETO (execução) |
| Status editorial (agente) | FALHA (anúncio + arco ausente) | PARCIAL (trunca desfecho) | **ATENDE O CASO DE ACEITE** |

## Conclusão do agente (para decisão do mantenedor)

O caso de aceite pedido — o sistema encontrar sozinho a versão narrativa
completa da sequência criação → thumbnail ausente → crash → save perdido →
reação, dentro de 15–90 s, sem nada disso fixado em código — foi atendido
somente pelo perfil D (Gemma-4-12B-IT QAT Q4_0, thinking desativado,
amostragem documentada do modelo). O perfil A (paridade com produção) selecionou
publicidade como "melhor momento" e não propôs o arco completo; o perfil C
propôs a história pela metade e deu a ela a nota mais alta do experimento.
Aprovação editorial final é do mantenedor; nenhum resultado foi comparado ao
OpusClip nem exige coincidência com ele.
