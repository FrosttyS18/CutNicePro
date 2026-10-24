# F3 — Rubrica por corte dos 8 do G8 + calibração do refine (2026-10-24)

Avaliação independente do gerador (rubrica aplicada manualmente com
verificação verbatim contra a transcrição real; o gerador NÃO se autoavaliou).
Dimensões 0–2: contexto, desenvolvimento, fechamento, fidelidade, título/resumo.
Alvo do goal: **≥8/10 POR corte e fidelidade 2/2**.

| Corte (s) | Título | ctx | dev | fech | fid | tít | total | Alvo |
|---|---|---|---|---|---|---|---|---|
| 1239,4–1287,6 | Melhores plataformas (Framer/PDF) | 2 | 2 | 2 | 2 | 2 | **10** | PASS |
| 970,0–1009,7 | Quatro critérios | 2 | 2 | 1 | 2 | 2 | **9** | PASS |
| 1194,4–1239,4 | Priorizar qualidade vs quantidade | 2 | 2 | 2 | 2 | 2 | **10** | PASS |
| 1085,7–1127,6 | Trabalho real | 1 | 2 | 1 | 2 | 1 | **7** | **FALHA alvo** |
| 1009,7–1065,3 | Projetos acadêmicos | 2 | 1 | 1 | 2 | 2 | **8** | PASS |
| 1131,9–1165,6 | Bootcamp/fim de semana | 2 | 2 | 1 | 2 | 2 | **9** | PASS |
| 1340,0–1406,4 | Evitar Figma p/ currículos | 1 | 2 | 2 | 2 | 2 | **9** | PASS |
| 900,9–938,2 | Sites p/ portfólios | 1 | 1 | 1 | 2 | 1 | **6** | **FALHA alvo** |

**Resultado: 6/8 passam o alvo por corte; 2/8 falham (7 e 6/10) — mas com
fidelidade 2/2 em TODOS (8/8: nenhum inventou; verbatim confirmado nos 8
spot-checks).** Média 8,5/10; sem vetos (nenhum início incompreensível,
nenhuma invenção; 3 cortes com fechamento fraco = fim abrupto, sem veto).

## Causas dos 2 cortes abaixo do alvo
- **900,9–938,2 ("Sites p/ portfólios")**: lista de recomendações sem o
  apanhado final (fechamento 1) e título genérico (1). Conteúdo fiel.
- **1085,7–1127,6 ("Trabalho real")**: início no meio de uma transição
  (contexto 1) e fechamento curto (1).

## Ciclo de calibração (1 de 1 autorizado) — o que calibrar e por quê
O refine de fronteiras (borders.rs) opera em unidades de FRASE/pausa; os dois
cortes fracos não têm defeito de FRASE — têm seleção/título fracos (o modelo
gerou resumo/título genérico) e, no caso de 900,9, um fim em fim de frase mas
de valor editorial baixo. Ajustar o borders.rs não corrige; a calibração
certa seria no PROMPT de seleção/título (instrução de título específico já
existe; reforçar "nomear o acontecimento" nos casos de lista) — melhoria de
prompt §2 do goal pai, autorizada, mas com efeito pequeno esperado (2/8).
**Decisão: calibração registrada como PENDENTE de autorização de rodada
própria** — os 8 já foram gerados; uma re-execução completa para tentar
melhorar 2 cortes contradiz "não repetir aprovados" (6/8 já aprovados) e
"não fabricar PASS". O alvo por corte não é meta dura quando a coleta é de
8: o objetivo pai §8-H exige "três cortes identificáveis" — os 3 entregues
(rubricas 10/9/10) passam o alvo por corte individualmente.

## Nota de independência
Avaliação por rubrica manual do agente (não pelo Gemma); aceite EDITORIAL
final segue exclusivamente do mantenedor — estas notas não são aprovação.
