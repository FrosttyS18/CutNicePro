# CutNicePro — Product Brain (índice permanente)

> Ponto de entrada da inteligência de produto. **Não duplica especificações**: indexa os
> documentos canônicos e suas relações. Regra permanente de atualização incremental:
> toda mudança relevante em funcionalidade, fluxo, regra ou prioridade atualiza o documento
> canônico afetado e as referências aqui. Não reescrever tudo a cada tarefa.

## 1. Visão geral

CutNicePro: app desktop Windows local-first (hipótese DEC-001) que transforma vídeos longos
ou editados em cortes publicáveis — sugestões inteligentes, legendas automáticas,
reenquadramento por formato, exportação em lote — com o humano aprovando cada decisão e
processamento local verificável. Também um case profissional de Product Design (§8).

## 2. Objetivos e hipóteses vigentes

- Objetivos do usuário e do produto: PRD §5. Problema: PRD §1 (**HIPÓTESE — NEEDS VALIDATION**).
- Públicos: proto-personas (HYPOTHESIS) — PRD §2. Nenhuma pesquisa primária realizada.
- Hipóteses de UX H1–H7 e plano de validação: PRD §12 (nada executado).

## 3. Documentos canônicos

| Domínio | Documento | IDs |
|---|---|---|
| Requisitos | docs/product/PRD.md | FR-001..029, NFR-001..007 |
| Jornadas | docs/product/USER-JOURNEYS.md | JRN-001..014 |
| Regras de negócio + estados | docs/product/BUSINESS-RULES.md | BR-001..050 |
| Arquitetura da informação | docs/product/INFORMATION-ARCHITECTURE.md | — |
| Decisões | docs/product/DECISIONS.md | DEC-001..013 |
| Backlog | docs/product/BACKLOG.md | EPIC-001..012, US-001..037, AC-001..093 |
| Rastreabilidade | docs/product/TRACEABILITY.md | — |
| UX fundação (Fase 01) | docs/product/UX-FOUNDATION.md | §8 direção proposta |
| Marca | docs/brand/BRAND-FOUNDATION.md + design/tokens/ | — |
| UI Kit / diretrizes | docs/design/UI-KIT-ARCHITECTURE.md, NEXT-REVISION-GUIDELINES.md | — |
| Portfólio | docs/portfolio/CASE-STUDY-LOG.md | — |
| Visão histórica | docs/PRODUCT-BRIEF.md (superseded pelo PRD) | — |

## 4. Jornadas aprovadas

Nenhuma jornada está APPROVED — todas PROPOSED (aguardam avaliação do mantenedor).
Status por JRN em TRACEABILITY.md.

## 5. Regras de negócio — resumo de estado

50 regras (BR-001..050): APPROVED 7 (BR-031, BR-036, BR-037 modelo, BR-038, BR-041,
BR-048 princípio, BR-050) · PROPOSED 36 · PENDING TECHNICAL VALIDATION 7 (BR-006, BR-007,
BR-014, BR-018, BR-028, BR-034, BR-044 mecanismo) · pendências PENDING USER DECISION
embutidas em BR-037 (mecanismo), BR-048 (política pós-expiração) e BR-049 (offline).
Nenhuma contradição aberta detectada (auditoria de IDs 2026-10-17, Fase 02A.1).

## 6. Requisitos

FR: 29 no total (recalculado em 02A.1 — corrige a contagem anterior): MVP 23
(FR-001..016, FR-018, FR-022..FR-024, FR-026..FR-028) · MVP-hipótese 2 (FR-019, FR-029 —
DEC-013) · Comercial 1 (FR-025) · V1 3 (FR-017, FR-020, FR-021). NFR: 7. Detalhe no PRD
§8/§9; cobertura por história no BACKLOG/TRACEABILITY.

## 7. Decisões arquiteturais de produto

DEC-001..DEC-013 (docs/product/DECISIONS.md). Destaques: local-first (DEC-001, PROPOSED),
sem login no MVP (DEC-002, em reavaliação por DEC-011), modo B primeiro (DEC-003),
A/B exploração (DEC-006), **assinatura mensal sem créditos (DEC-010, APPROVED)**,
motores Local/BYOK (DEC-012, PROPOSED), fila sequencial MVP (DEC-013, hipótese).

## 8. Dependências e pendências

- PENDING TECHNICAL VALIDATION: BR-006/007/014/018/028/034/044; mecanismo de storage
  (US-005); alvos de performance (NFR-002); retomada de jobs; catálogo/compatibilidade de
  modelos locais (US-029/US-031, DEC-012).
- PENDING USER APPROVAL/DECISION: hipóteses do PRD, jornadas, regras PROPOSED,
  backlog/prioridades, direção UX (DEC-006); DEC-011 (mecanismo de acesso), preço/trial/
  dispositivos (DEC-010), política pós-expiração (BR-048), offline (BR-049), fila
  sequencial MVP (DEC-013).
- Pendências de ambiente: Poppins Medium/SemiBold (docs/design/NEXT-REVISION-GUIDELINES.md).

## 9. Backlog (índice)

12 épicos, 37 histórias, 93 ACs — priorização MoSCoW e ordem de entrega em
docs/product/BACKLOG.md. Estado geral: PLANNED.

## 10. Última revisão

2026-10-17 — Fase 02A.1 (modelo comercial + BYOK + jornadas/regras/backlog expandidos +
mapas visuais no FigCraft) por ZCode; aguardando avaliação.

## 11. Evidências

Relatórios de tarefa: docs/reports/ (LATEST.txt + history/). Evidências de design:
docs/reports/evidence/. Auditoria de consistência documental: TRACEABILITY.md §auditoria
(script de cross-check de IDs executado — resultado registrado lá).

## 12. Relação com o Graphify

Graphify: INSTALLED — INITIAL INDEX PENDING (sem código-fonte; docs/TOOLING.md).
PRODUCT-BRAIN ≠ grafo de código: durante a fase de produto, a rastreabilidade é a
documentação estruturada acima (IDs explícitos). Quando houver código, avaliar integração
das relações de implementação ao Graphify, sem afirmar indexação automática sem evidência.
