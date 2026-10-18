# CutNicePro — Protocolo Obrigatório de Entrega e Auditoria

Referência oficial do protocolo de relatórios. **Toda tarefa realizada pelo ZCode neste
workspace termina com um relatório `CUTNICEPRO — ZCODE REPORT`** — sem exceção, inclusive
em PASS, PARTIAL, FAIL ou BLOCKED, e mesmo quando o usuário não solicitar explicitamente.
Aplica-se a frontend, backend, IA, MCP, skills, hooks, documentação, arquitetura, correções
e manutenção.

## Regras obrigatórias

1. Toda tarefa produz um relatório final, sem exceção.
2. O relatório é gerado mesmo em caso de PASS, PARTIAL, FAIL ou BLOCKED.
3. O relatório contém fatos verificáveis, não apenas afirmações do agente.
4. Todos os testes executados apresentam contagens e resultados.
5. Arquivos criados, modificados e removidos são identificados.
6. Mudanças no Git são documentadas.
7. Falhas, limitações e pendências não podem ser omitidas.
8. Não declarar PASS quando existir falha em requisito obrigatório.
9. Não inventar testes, evidências, resultados ou validações.
10. Não confundir testes simulados com validação de eventos reais.
11. Não considerar a tarefa concluída antes da geração e verificação do relatório.
12. O relatório apresentado no chat corresponde integralmente ao conteúdo persistido no TXT.

## Persistência

- **Mais recente:** `docs/reports/LATEST.txt` (sobrescrito a cada entrega).
- **Histórico:** `docs/reports/history/<AAAA-MM-DD>_<HHMMSS>_<slug-da-tarefa>.txt` — um
  arquivo por tarefa, nunca sobrescrever histórico.
- Sem commits automáticos; sem credenciais, tokens, segredos ou dados sensíveis nos
  relatórios; sem arquivos ou logs desnecessários.

## Formato obrigatório

```text
╔════════════════════════════════════════════╗
║       CUTNICEPRO — ZCODE REPORT            ║
╚════════════════════════════════════════════╝

TASK
  Name:
  Status: PASS / PARTIAL / FAIL / BLOCKED
  Scope:
  Objective:
  Result:

IMPLEMENTATION
  Completed:
  Not completed:
  Changes:
  Architecture impact:

FILES
  Created:
  Modified:
  Deleted:
  Unexpected changes: NONE / DETAILS

VALIDATION
  Typecheck: PASS / FAIL / SKIP
  Lint: PASS / FAIL / SKIP
  Unit tests: PASS / FAIL / SKIP
  Integration tests: PASS / FAIL / SKIP
  Regression tests: PASS / FAIL / SKIP
  Visual tests: PASS / FAIL / SKIP
  Runtime verification: PASS / FAIL / SKIP
  Total passed:
  Total failed:
  Total skipped:

HOOKS / HARNESS
  Hooks active:
  PreToolUse:
  PostToolUse:
  Stop:
  Baseline:
  Gate result:
  Evidence:

MCP / SKILLS
  Tools used:
  Connection status:
  Failures:
  Pending activation:

GIT
  Branch:
  HEAD:
  Working tree:
  Commits created:
  Push performed:
  Merge performed:
  Uncommitted changes:

EVIDENCE
  Commands executed:
  Relevant logs:
  Screenshots:
  Test artifacts:
  Reproduction details:

ISSUES
  Bugs found:
  Unresolved failures:
  Regressions:
  Risks:
  Blockers:

FINAL
  Delivery status:
  Requirements met:
  Remaining work:
  User action required:
  Restart required:
  Ready for next task:

REPORT
  Latest file:
  Historical file:

END OF REPORT
```

## Regras de preenchimento

- Não preencher campos com informações inventadas.
- Verificação não aplicável → `SKIP` + explicação resumida.
- Validação necessária mas não executável → `BLOCKED` ou `PENDING`, conforme o caso.
- Ausência de erros não é prova de funcionamento.
- Diferenciar sempre: código implementado × código compilado × teste automatizado aprovado
  × funcionalidade executada e validada × validação manual pendente.
- Registrar contagens reais; se nenhum teste foi executado, informar claramente.
- O hook Stop registra a baseline, mas **não é gate**: exit 0 do Stop não significa PASS.
- O status final reflete as evidências efetivas da tarefa.

## Apresentação no chat

Ao concluir qualquer tarefa, nesta ordem:

1. Finalizar as alterações autorizadas.
2. Executar as validações pertinentes.
3. Reunir as evidências.
4. Determinar o status real.
5. Gerar o relatório TXT (histórico + `LATEST.txt`).
6. Verificar que o arquivo foi gravado e pode ser lido.
7. Apresentar o conteúdo **completo** no chat, em **um único bloco de código `text`** —
   sem substituí-lo por parágrafos, tabelas, resumos narrativos ou mensagens de conclusão;
   o bloco deve ser copiável integralmente para auditoria externa e idêntico ao arquivo,
   incluindo os caminhos dos arquivos de relatório. O usuário não deve precisar abrir
   arquivos para descobrir resultados; falhas e evidências relevantes não são omitidas.
