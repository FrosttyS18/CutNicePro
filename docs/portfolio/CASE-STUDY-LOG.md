# CutNicePro — Case Study Log (histórico autêntico)

> Registro contínuo e verdadeiro da concepção do produto, para virar case profissional de
> Product Design. **Nada aqui é fictício**: cada entrada distingue pesquisa secundária,
> hipótese, decisão aprovada, avaliação técnica, teste real (nenhum até agora) e resultado
> comprovado (nenhum até agora). Não escrever o "case final" antes dos fatos existirem.

## Contexto do problema

Criador individual (mantenedor) precisa de volume de cortes curtos a partir de conteúdo
longo; processo manual disperso em ferramentas (PRD §1 — hipótese a validar).

## Linha do tempo (entradas em ordem cronológica)

| Data | Tipo | Evento | Evidência |
|---|---|---|---|
| 2026-10-17 | Decisão aprovada | Ambiente de desenvolvimento preparado (skills, MCPs, hooks, harness, protocolo de relatórios) | docs/reports/history/*; SETUP-REPORT |
| 2026-10-17 | Artefato | Exploração visual A/B no FigCraft attached (2 propostas, validadas com inspeção+VISION) | design/; relatório 2226 |
| 2026-10-17 | Avaliação técnica | Auditoria estrutural das propostas (deficiências medidas) + teste de componentização nativa (mestres/instâncias/variantes OK na 0.6.0) | relatório 2330 |
| 2026-10-17 | Decisão aprovada | Identidade oficial (Poppins; preto puro/attractive black/deep aqua/white marble; dark glass 3D restrito) | docs/brand/ |
| 2026-10-17 | Decisão aprovada | Publicação pública do repo + Conventional Commits | GitHub main @ 80f578e |
| 2026-10-17 | Pesquisa secundária | Benchmark OpusClip/CapCut/Descript com fontes datadas | PRD §3 (fontes) |
| 2026-10-17 | Hipótese | Problema, públicos (proto-personas), proposta de valor, escopo MVP/V1 | PRD §1/§2/§6/§7 |
| 2026-10-17 | Artefato | Fundação de produto: PRD, 11 jornadas, 36 BRs + estados, IA, 9 DECisions, backlog (10 épicos/28 US/66 AC), rastreabilidade | docs/product/ |
| 2026-10-17 | Avaliação de consistência | Auditoria de IDs por script: 0 referências quebradas; lacunas declaradas | TRACEABILITY §4 |
| 2026-10-17 | Decisão aprovada (mantenedor) | Modelo comercial: assinatura mensal SEM créditos; IA local ou BYOK; custos externos esclarecidos (DEC-010, BR-037..041) | docs/product/DECISIONS.md |
| 2026-10-17 | Hipótese/decisão | Arquitetura de motor de IA local/BYOK com matriz conceitual por tarefa (DEC-012); reavaliação de DEC-002 por fases sem apagar histórico (DEC-011); fila sequencial MVP como hipótese (DEC-013) | PRD §13; DECISIONS |
| 2026-10-17 | Artefato visual | User Journey Map + Master User Flow + Product Roadmap construídos no FigCraft attached (página `roadmap` do documento do usuário; páginas históricas preservadas) | design/exports/*.png; relatório 02A.1 |
| 2026-10-17 | Avaliação técnica | Script de auditoria versionado (tools/audit) com testes positivo/negativo | TRACEABILITY §4 |

## Hipóteses documentadas (a validar — nenhuma validada)

H1 primeiro projeto sem instruções · H2 compreensão dos modos A/B/C · H3 clareza de
progresso · H4 revisão rápida · H5 controle sobre a IA · H6 exportação sem fricção ·
H7 recuperação/retomada. Proto-personas: 6 (HYPOTHESIS). Detalhe: PRD §2/§12.

## Pesquisa validada

Secundária apenas: benchmark com fontes públicas datadas (PRD §3). **Nenhuma entrevista,
teste de usabilidade, métrica ou resultado real até 2026-10-17.**

## Testes de usabilidade futuros (roteiro pronto)

Criar projeto sem ajuda; importar vídeo; achar "apenas legendar"; identificar corte que
precisa de ajuste; exportar vários; recuperar projeto anterior (PRD §12). Registrar
execuções AQUI com data, participantes reais e achados — nunca fabricar.

## Decisões relevantes e alternativas

DEC-001..DEC-009 (docs/product/DECISIONS.md) com contexto. Alternativas consideradas:
onboarding longo vs. entrada direta (JRN-001 D1); modo A vs. B primeiro (DEC-003);
mídia copiada vs. referenciada (DEC-004); web vs. desktop local (DEC-001).

## Limitações conhecidas

Sem validação com usuários; premissa técnica local-first sem spike de performance;
6 BRs PENDING TECHNICAL VALIDATION; pesos Poppins incompletos no ambiente de design.

## Evolução futura (planejada, não executada)

Fase 02 visual (redesign sob diretrizes) → implementação por incrementos do backlog →
testes de usabilidade → medição dos critérios de sucesso do PRD §11.
