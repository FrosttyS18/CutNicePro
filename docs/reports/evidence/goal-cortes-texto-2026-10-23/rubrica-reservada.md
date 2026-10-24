# RUBRICA INDEPENDENTE — amostra reservada 1000–1300 s (goal-cortes-texto)

Avaliador: agente (rubrica independente do gerador — os critérios/notas do
próprio Gemma NÃO foram usados; verificação de fidelidade feita contra a
transcrição REAL da janela, verbatim). **Aceite humano do mantenedor segue
pendente** — estas notas não são aprovação editorial.

Dimensões 0–2: contexto | desenvolvimento | fechamento | fidelidade | título/resumo.

| # | Janela (s) | Título (gerado) | ctx | dev | fech | fid | tít | total |
|---|---|---|---|---|---|---|---|---|
| 1 | 1192–1239 | Prioridade de qualidade sobre quantidade em estudos de caso | 2 | 2 | 2 | 2 | 2 | **10** |
| 2 | 1239–1288 | Melhores plataformas para criar um portfólio profissional | 2 | 2 | 2 | 2 | 2 | **10** |
| 3 | 902–947 | Recomendações de sites para encontrar portfólios reais | 2 | 2 | 2 | 2 | 2 | **10** |
| 4 | 948–1010 | Quatro perguntas para validar a estrutura de um portfólio | 2 | 2 | 2 | 2 | 2 | **10** |
| 5 | 1340–1402 | Por que evitar o Figma para currículos/portfólios | 1 | 2 | 2 | 2 | 2 | **9** |
| 6 | 1132–1176 | Impossibilidade de aprender UX/UI num fim de semana | 2 | 2 | 1 | 2 | 2 | **9** |
| 7 | 1010–1065 | Como incluir projetos acadêmicos no portfólio | 2 | 1 | 1 | 2 | 2 | **8** |
| 8 | 1107–1132 | Projetos que não agregam valor ao portfólio | 1 | 1 | 1 | 2 | 1 | **6** |
| 9 | 1411–1458 | Teste de 30 s para validar clareza do portfólio | 0 | 1 | 0 | 2 | 2 | **5** |

**Média da amostra: 8,6/10 (meta ≥8 ✓) · Fidelidade: 9/9 com 2/2 ✓**

## Verificações de fidelidade (claims → transcrição verbatim da janela)
- "3 casos bem feitos > quantidade", Framer+PDF, Bestfolios/Cofolios/Adpliste,
  4 perguntas (problema/solução/resultado/papel), Figma em leitura de
  currículo→Google Docs, "impossível num fim de semana" (desafio), projetos
  acadêmicos com pesquisa real, "Daily UI sem contexto nenhum" (clip 8) —
  TODOS confirmados literalmente na transcrição (`reservada-resultado.json`
  → windowTranscript).
- Nenhum corte inventou palavra, fato ou intenção; nenhum afirma ter visto
  o vídeo (modo textual).

## Observações honestas (sem ciclo de calibração — meta já atingida)
- Os 2 piores (6 e 5/10) sofrem de FRONTeIRAS: início no meio de uma
  transição ("Outro ponto"…) e fechamento abrupto — padrão já visto nos
  critérios do próprio gerador (Fechamento 10–40 nessas janelas). Melhoria
  provável via instrução de fronteira/mínimo de fechamento; fica como
  calibração futura (orçamento de ciclo disponível: 2/2).
- Os 4 melhores são unidades narrativas completas com títulos específicos e
  resumos naturais (sem "o falante introduz o tema").
- Exposição prévia da amostra: NENHUMA (janela 1000–1300 reservada no
  checkpoint antes de qualquer ajuste; clipes M3/M2 documentados entre
  245–839 s). A janela 360–720 (M3) permanece marcada como CALIBRAÇÃO
  exposta e não foi usada como teste cego.
