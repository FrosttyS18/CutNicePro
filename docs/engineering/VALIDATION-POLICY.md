# CutNicePro — Política de Validação e Economia de Execução

**Estado:** APROVADO pelo mantenedor em 2026-10-18 (protocolo permanente).
**Escopo:** todas as futuras tarefas do CutNicePro no ZCode, em qualquer sessão.
**Referência no AGENTS.md:** seção `CUTNICEPRO — VALIDATION OWNERSHIP & EXECUTION BUDGET`.

Motivação: a Fase 03B.6 demonstrou custo operacional desproporcional de
validações visuais autônomas (subagente VISION, ciclos de screenshots,
investigações estéticas repetitivas). A partir desta política, **a aprovação
estética e visual é responsabilidade EXCLUSIVA do mantenedor**; o ZCode
concentra esforços na implementação correta e na verificação funcional.

---

## 1. Responsabilidades

### ZCode — engenharia e funcionamento

- Implementar os requisitos autorizados.
- Garantir compilação (typecheck/build conforme a stack).
- Executar testes pertinentes ao escopo.
- Verificar integração frontend↔backend.
- Validar funcionalidades em runtime quando necessário.
- Detectar regressões funcionais.
- Verificar erros de console, exceções e falhas de recursos.
- Identificar vazamentos de memória/processos **quando houver evidência objetiva**.
- Garantir gerenciamento correto de recursos.
- Preservar funcionalidades aprovadas.
- Reportar problemas com evidências reproduzíveis.

### Mantenedor — aprovação visual

- Avaliar estética e composição; comparar com referências.
- Aprovar proporções, tipografia e espaçamentos.
- Avaliar animações e microinterações.
- Determinar alterações de UI/UX; autorizar refinamentos visuais.
- Aprovar a experiência final.

O ZCode **não inicia auditorias estéticas autônomas**.

## 2. Subagente VISION — desativado por padrão

Uso do subagente VISION **PROIBIDO por padrão** neste projeto. Acionamento
somente quando:

1. o mantenedor solicitar explicitamente uma auditoria visual, ou
2. a tarefa atual contiver autorização específica.

Mesmo autorizado: objetivo delimitado + condição de parada objetiva.

Proibido executar automaticamente: comparações visuais com referências;
capturas repetitivas para estética; recortes sucessivos (Python/PIL); análise
de pixels buscando composição "perfeita"; classificação estética via
screenshots quando metadados estão disponíveis; investigação estética de
animações; rodadas iterativas de VISION até "aprovação"; subagentes recursivos
validando outros subagentes.

## 3. Protocolo de validação proporcional

| Escopo da alteração | Validação |
|---|---|
| Pequena | apenas testes relacionados aos arquivos/funcionalidades modificados |
| Funcionalidade | unitários + integração + runtime conforme necessidade real |
| Arquitetura | baseline completa + regressões pertinentes |
| Exclusivamente visual | compilação; ausência de erros de runtime; integridade funcional; interações solicitadas; ausência de regressões identificáveis — **estética fica para o mantenedor** |

**Screenshots não são a evidência principal quando o estado da aplicação pode
ser verificado diretamente** (DOM, estado computado, contrato, comando).

## 4. Limites obrigatórios (orçamento de execução)

1. Planejar os testes ANTES de executá-los.
2. Definir critério objetivo de PASS/FAIL para cada teste.
3. Executar UMA rodada inicial de validação.
4. No máximo UMA repetição justificada por falha real ou teste inconclusivo.
5. Não repetir testes aprovados sem alteração relevante no código.
6. Não abrir investigações extras para "melhorar a apresentação" de evidências.
7. Não buscar a captura perfeita para provar algo já validado funcionalmente.
8. Não transformar pequenas alterações em auditoria completa do aplicativo.
9. Bloqueio externo → registrar `BLOCKED` (não repetir indefinidamente).
10. Limite atingido sem conclusão → registrar `PARTIAL` com a evidência disponível.

Exceções exigem autorização do mantenedor.

## 5. Critérios de aceite (obrigatórios nos relatórios)

- **FUNCTIONAL STATUS:** `PASS` / `FAIL` / `PARTIAL` / `BLOCKED`
- **REGRESSION STATUS:** `PASS` / `FAIL` / `NOT TESTED`
- **VISUAL STATUS:** `PENDING HUMAN APPROVAL` (sempre que houver UI envolvida)

Regras: PASS funcional ≠ aprovação estética; não declarar ausência de
regressões além do escopo testado; não declarar ausência definitiva de
vazamento de memória com base em uma única amostra de heap.

## 6. Eficiência de execução

Priorizar: testes determinísticos; verificação direta de estados; logs
estruturados; asserções automatizadas; testes de contrato; instrumentação
temporária REMOVIDA ao final; reaproveitamento de evidências existentes;
diagnóstico por causa-raiz em falhas reais.

Evitar: rebuilds desnecessários; abertura repetitiva do aplicativo; acúmulo
de processos WebView2 (limpar órfãos de portas de debug antes de nova
execução); subagentes sem limites; capturas redundantes; testes sintéticos
que não correspondam ao comportamento real; scripts temporários em excesso;
refatorações não solicitadas.

Funcionalidade comprovadamente correta → **ENCERRAR sua validação**.

## 7. Harness, hooks e relatórios

- Preservar todos os mecanismos existentes (baseline, proteções de comandos
  destrutivos, validações estruturais). O objetivo é eliminar validação
  VISUAL excessiva, não reduzir confiabilidade.
- Melhorias de hook/harness identificadas são documentadas como PROPOSTA para
  autorização posterior — nunca aplicadas por conta própria nesta política.
- Relatórios (formato `docs/REPORTING-STANDARD.md`, obrigatório em
  `LATEST.txt` + `history/`) passam a indicar: o que foi implementado; o que
  foi testado; quantos testes passaram/falharam; quais foram ignorados e por
  quê; regressões verificadas; problemas remanescentes; se houve acionamento
  de subagentes (e qual autorização); necessidade de aprovação visual humana.
- Evidências em quantidade suficiente para comprovar funcionamento — não uma
  apresentação visual. Sem dezenas de screenshots por tarefa.
