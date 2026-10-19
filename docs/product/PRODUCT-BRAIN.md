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

> Fase 03 (2026-10-18): marcos de entrega M1..M6 definidos no BACKLOG; **M1 IMPLEMENTADO**
> (app Windows Tauri + React/TS, Home, criar/listar/abrir projetos, persistência JSON
> local; evidências no relatório da fase). Stack técnica: Vite + React + TypeScript +
> Tauri v2 (Rust) — UI separada da lógica (comandos Tauri para persistência).



12 épicos, 37 histórias, 93 ACs — priorização MoSCoW e ordem de entrega em
docs/product/BACKLOG.md. Estado geral: PLANNED.

## 10. Governança de artefatos visuais (Fase 02A.5)

Estados oficiais: **APPROVED** (aprovado expressamente pelo mantenedor) ·
**IN REVIEW** (tecnicamente validado, aguardando mantenedor) · **DRAFT**
(preliminar) · **REFERENCE** (apoio/exploração, sem autoridade) ·
**SUPERSEDED** (substituído por versão posterior aprovada) ·
**REJECTED/ARCHIVED** (reprovado ou histórico) · **BLOCKED** (pendência
crítica). Regra permanente: **apenas artefatos explicitamente APPROVED são
especificação visual definitiva para implementação**; Quality Gate PASS ≠
Product Design APPROVED; a documentação canônica prevalece sobre diagramas em
divergência (respeitando estado APPROVED/PROPOSED de cada decisão); conflito
entre decisões aprovadas → BLOCKED para resolução humana.

| ID | Nome | Tipo | Versão | FigCraft (página/frame) | Gate téc. | Mantenedor | Supersede | Canônicos | Elegível p/ implementação |
|---|---|---|---|---|---|---|---|---|---|
| ART-001 | User Journey Map — CUTNICEPRO END-TO-END | Journey map | 02A.1 | roadmap / frame 436 | n/a (pré-gate) | — | — | JRN-001..014 | Não (DRAFT/REFERENCE) |
| ART-002 | MASTER USER FLOW | User flow | 02A.1 | roadmap / frame 368 | n/a (pré-gate) | REPROVADO | — | JRN/BR/DEC | Não (REJECTED/ARCHIVED) |
| ART-003 | PRODUCT DELIVERY ROADMAP | Roadmap | 02A.1 | roadmap / frame 656 | n/a (pré-gate) | — | — | EPIC/US/DEC; BACKLOG.md | Não (DRAFT) |
| ART-004 | 00 — PRODUCT FLOW OVERVIEW V2 | Fluxo macro | V2 (02A.3) | roadmap / frame 728 | GATE V3 PASS (02A.4) | PENDING | candidata a superseder ART-002* | PRD §fluxo; JRN-001..013; DEC-012 | Não (IN REVIEW) |
| ART-005 | 01 — FIRST RUN & ACCESS USER FLOW V2 | User flow piloto | V2 (02A.3) | roadmap / frame 799 | GATE V3 PASS (02A.4) | PENDING | candidata a superseder ART-002* | JRN-001/002/014; BR-037/049; DEC-011/012 | Não (IN REVIEW) |
| ART-006 | Proposta A — Creative Studio | Proposta de UI | Fase 01 | UI - designer / frame 2 | n/a | — | — | UX-FOUNDATION §8 | Não (REFERENCE) |
| ART-007 | Proposta B — AI Clip Workspace | Proposta de UI | Fase 01 | UI - designer / frame 154 | n/a | — | — | UX-FOUNDATION §8 | Não (REFERENCE) |
| ART-008 | Home Galaxy CutNicePro | UI implementada | 03B | Home atual no app; origem UI - designer | Ver relatórios 03B | APPROVED em 2026-10-19 | — | JRN-001/002; FR-001/002 | Sim, Home aprovada pelo mantenedor |
| ART-009 | Entrada, projeto e editor | v1 REJECTED pelo mantenedor; correção v2 IN REVIEW | 03E v2 | Fonte própria: frames 2262/2440/2391; design/handoff/03d/flow-ui-v1.figcraft (rascunhos) | Build, 15 Rust e 13 runtime PASS (escopo) | PENDING HUMAN APPROVAL | — | UPLOAD-SCREEN.md; JRN-003/004/006/008/009 | Escopo de implementação autorizado; estética IN REVIEW |

\* Journey Map (ART-001) e Product Flow Overview (ART-004) são artefatos
metodologicamente DISTINTOS (jornada × fluxo): um não supersede o outro. A
aprovação de ART-004/005 tornaria ART-002 SUPERSEDED (mesmo propósito: user
flow de referência visual) — hoje ART-002 permanece REJECTED/ARCHIVED.

Pendências por artefato: ART-004 → aprovação do mantenedor + D1 (ordem da
config de IA, PROPOSED no diagrama em âmbar). ART-005 → aprovação do
mantenedor + DEC-011 (mecanismo de acesso) + BR-049 (política offline;
detalhes PENDING USER DECISION). ART-003 → revisão contra BACKLOG.md quando
do próximo ciclo de planejamento. Próxima ação comum: auditoria/aprovação do
mantenedor; nenhum wireframe deve derivar destes artefatos antes de APPROVED.

## 11. Última revisão

2026-10-19 — Home aprovada expressamente pelo mantenedor (ART-008). Autorizada a implementação das telas de envio, preparação, visão do projeto e editor antes da integração do motor (ART-009). `docs/product/UPLOAD-SCREEN.md` registra escopo, limites de demonstração e rastreabilidade. Permanecem fora desta entrega: transcrição real, download de vídeo, render/export e integração Local/BYOK. A autorização específica não aprova globalmente as demais jornadas históricas.

2026-10-18 — **Decisão OPERACIONAL (não-produto): Protocolo Permanente de
Validação e Economia de Execução** (mantenedor): aprovação estética/visual é
exclusiva do mantenedor; subagente VISION proibido por padrão; validação
proporcional ao escopo com orçamento de execução (1 rodada + no máximo 1
repetição justificada); relatórios distinguem FUNCTIONAL/REGRESSION/VISUAL
status. Referência: `docs/engineering/VALIDATION-POLICY.md` + seção
`VALIDATION OWNERSHIP & EXECUTION BUDGET` no AGENTS.md. Nenhuma decisão de
produto/UX/comercial foi alterada por esta entrada.

2026-10-18 — Fase 03 (MVP freeze: D1 APPROVED, DEC-010 preço hipótese R$ 29,90,
DEC-011 convite beta, BR-049 offline técnico; baseline MVP v0.1 no PRD; marcos M1..M6;
M1 implementado) por ZCode. 2026-10-18 — Fase 02A.5 (governança de artefatos). 2026-10-17
— Fase 02A.1 por ZCode; aguardando avaliação.

2026-10-18 — Fase 02A.5 (governança de artefatos + organização da página
roadmap + índice visual; estados oficiais e regra de elegibilidade) por
ZCode. 2026-10-17 — Fase 02A.1 (modelo comercial + BYOK + jornadas/regras/
backlog expandidos + mapas visuais) por ZCode; aguardando avaliação.

## 12. Evidências

Relatórios de tarefa: docs/reports/ (LATEST.txt + history/). Evidências de design:
docs/reports/evidence/. Auditoria de consistência documental: TRACEABILITY.md §auditoria
(script de cross-check de IDs executado — resultado registrado lá).

## 13. Relação com o Graphify

Graphify: INSTALLED — INITIAL INDEX PENDING (sem código-fonte; docs/TOOLING.md).
PRODUCT-BRAIN ≠ grafo de código: durante a fase de produto, a rastreabilidade é a
documentação estruturada acima (IDs explícitos). Quando houver código, avaliar integração
das relações de implementação ao Graphify, sem afirmar indexação automática sem evidência.

2026-10-19 — Revisão 03E: mantenedor rejeitou fluxo de criação vazia, preparação simulada e proporções da 03D. UPLOAD-SCREEN.md registra correção solicitada e aceites de viewport; v1 histórico rejeitado, v2 pendente de aprovação humana. Home continua aprovada.

2026-10-19 — Refinamento 03F de ART-009: modal de estilos e cursor/foco da timeline; UI ainda IN REVIEW. Estado e proposta de integração incremental do motor em docs/engineering/ENGINE-HANDOFF.md. Nenhuma IA instalada nem decisão de runtime/modelo promovida a aprovada.
