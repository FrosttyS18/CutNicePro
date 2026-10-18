# CutNicePro — Traceability

> Conexões explícitas Jornada ↔ Regra ↔ Requisito ↔ História ↔ Aceite ↔ Validação.
> Registros só apontam para elementos existentes (auditado por script — §Auditoria).
> Referência não resolvida = pendência declarada, nunca preenchida com invenção.

## 1. Matriz por jornada

| Jornada | FR cobertos | BR aplicados | Histórias (US) | ACs (amostra) | Validação planejada | Status |
|---|---|---|---|---|---|---|
| JRN-001 Primeira execução | FR-001, FR-002 | BR-001, BR-002 | US-001, US-002 | AC-001..005 | H1 (teste de usabilidade) | PROPOSED |
| JRN-002 Recorrente | FR-002, FR-004, FR-016 | BR-002, BR-004, BR-032, BR-033 | US-003, US-005 | AC-006..008, AC-012..013 | H7 | PROPOSED |
| JRN-003 Criação do projeto | FR-003 | BR-001, BR-002 | US-004 | AC-009..011 | H1 | PROPOSED |
| JRN-004 Importação | FR-005, FR-006 | BR-006..BR-011, BR-032 | US-007, US-008, US-009 | AC-016..024 | H2 | PROPOSED |
| JRN-005 Modo | FR-007 | BR-009, BR-012, BR-013 | US-010, US-016 | AC-025..027, AC-046 | H2 | PROPOSED |
| JRN-006 Configuração | FR-008 | BR-012, BR-024 | US-011 | AC-028..030 | H2 | PROPOSED |
| JRN-007 Processamento | FR-009 | BR-013..BR-018 | US-012 | AC-031..036 | H3 | PROPOSED |
| JRN-008 Resultados | FR-010 | BR-019..BR-023 | US-014, US-015 | AC-040..045 | H4 | PROPOSED |
| JRN-009 Edição avançada | FR-011, FR-012, FR-013 | BR-020, BR-022, BR-025, BR-026 | US-017..US-022 | AC-047..056 | H5 | PROPOSED |
| JRN-010 Exportação | FR-014, FR-015, FR-018 | BR-027..BR-031 | US-023..US-025 | AC-057..063 | H6 | PROPOSED |
| JRN-011 Continuidade | FR-016, FR-017 | BR-005, BR-015, BR-018, BR-032..BR-034 | US-003, US-005, US-006 | AC-012..015 | H7 | PROPOSED |
| JRN-012 Primeira ativação | FR-025 | BR-037, BR-048, BR-049 | US-033 | AC-081..083 | H8 (futura) | PROPOSED |
| JRN-013 Configuração do motor de IA | FR-022..FR-024, FR-026..FR-028 | BR-039..BR-047, BR-050 | US-029..US-032, US-037 | AC-067..080, AC-092..093 | H8 | PROPOSED |
| JRN-014 Exceções comerciais/motor | FR-025..FR-028 | BR-037, BR-041, BR-043..BR-049 | US-033..US-035, US-037 | AC-081..088, AC-092..093 | H7/H8 | PROPOSED |

## 2. Matriz por requisito (FR → histórias)

FR-001 US-001 · FR-002 US-001/002/003 · FR-003 US-004 · FR-004 US-003/005 · FR-005 US-007/008 ·
FR-006 US-009 · FR-007 US-010 · FR-008 US-011 · FR-009 US-012 · FR-010 US-014/015 ·
FR-011 US-019..022 · FR-012 US-013/017/018 · FR-013 US-020/021 · FR-014 US-023/024 ·
FR-015 US-023 · FR-016 US-005 · FR-017 US-006 (V1) · FR-018 US-025 ·
FR-019 US-036 (MVP-hipótese DEC-013) · FR-020 US-027 (V1) · FR-021 US-028 (V1) ·
FR-022 US-029 · FR-023 US-030 · FR-024 US-031 · FR-025 US-033..035 (comercial) ·
FR-026 US-030/032/035 · FR-027 US-037 · FR-028 US-032 · FR-029 US-036.

NFR-001 DEC-001 · NFR-002 PENDING alvos · NFR-003 US-005/AC-013 · NFR-004 US-012/AC-036 ·
NFR-005 diretrizes de design (docs/design/) · NFR-006 arquitetura em camadas (AGENTS.md) ·
NFR-007 BR-031/BR-036.

## 3. Matriz por regra (BR → aplicação)

Todas as BR-001..036 aparecem em ≥1 jornada/história (colunas acima; verificação por
script abaixo). Sem regra órfã detectada.

## 4. Auditoria de consistência (executada)

Método: script versionado **`tools/audit/id_audit.py`** (`--root` parametrizável;
comportamento preservado do protótipo de 2026-10-17 que vivia em `.tooling/`, área
ignorada). Testes executados em 02A.1: POSITIVO (repo real) e NEGATIVO (sandbox com
referências falsas de numeração inexistente — ambas detectadas; sandbox removido).

Resultados (2026-10-17, Fase 02A.1 — saída completa no relatório da tarefa):
- Referências a IDs inexistentes: **0** (conjuntos: FR 29, NFR 7, JRN 14, BR 50, EPIC 12,
  US 37, AC 93, DEC 13 — numeração contígua, 0 lacunas).
- Definições duplicadas reais: 0 (repetições = menções internas legítimas nos canônicos).
- Teste negativo do script: sandbox com duas referências falsas (numerações 999/099 dos
  prefixos FR/JRN) — ambas detectadas e o sandbox foi removido.

### Lacunas conhecidas (declaradas, não mascaradas)

- Jornadas sem requisito: atualização do app; instalação de dependências locais; mídia
  parcialmente legível; FLUXO DE COMPRA/assinatura fora do app (DEC-010/011 — por decisão).
- Requisitos sem história: nenhum.
- Histórias sem AC: nenhuma (37/37).
- Regras sem aplicação: nenhuma; 7 PENDING TECHNICAL VALIDATION (BR-006/007/014/018/028/034/044).
- Estados sem tratamento: retomada de job (BR-018); política pós-expiração (BR-048) e
  offline (BR-049) PENDING USER DECISION.
- Funcionalidades duplicadas: nenhuma (Editor A × Revisão B papéis distintos; lote
  discriminado em importação múltipla/fila sequencial/paralelo/exportação — DEC-013).
- Dependências circulares: nenhuma (1→2→3/4→5→6→9→8→7→11→12/US-036→10).
- Decisões contraditórias: DEC-002 × DEC-010 resolvidas por DEC-011 (fases distintas do
  produto; histórico preservado, não apagado).
- Cobertura declarada ≠ 100%: hipóteses comerciais (preço/trial/dispositivos) e técnicas
  (modelos/segredos) permanecem PENDING — a ausência de IDs quebrados não é prova de
  cobertura completa (§16 da tarefa 02A.1).
- IDs definidos sem qualquer referência cruzada: nenhum essencial (FR-019..021 e US-026..028
  são V1/Won't-now por decisão de escopo, não lacuna).
- Duplicações integrais de conteúdo entre documentos: nenhuma (Brain é índice).

## 5. READINESS GATE — PRODUCT MODEL & UX FLOW (02A.1)

**Status: PARTIAL** — estrutura válida e consistente (auditoria limpa; modelo comercial
APPROVED), mas decisões comerciais (mecanismo de acesso DEC-011, preço/trial, política
pós-expiração BR-048, offline BR-049, fila sequencial DEC-013) e técnicas (7 BRs +
modelos de IA + armazenamento de segredos) permanecem pendentes.

- Evidência: auditoria de IDs (0 quebradas/0 lacunas) + testes +/- do script versionado +
  baseline full (relatório da tarefa) + mapas visuais no FigCraft (página `roadmap`).
- Decisões aprovadas: DEC-010 (assinatura sem créditos — mantenedor); DEC-007/008/009
  (históricas). Reavaliada sem apagar: DEC-002 via DEC-011.
- Pronto para wireframes: CONDICIONAL — estruturas de fluxo/jornadas suportam wireframes
  de baixo risco; UI definitiva exige aprovação das pendências (PRODUCT DESIGN GATE).
